import type { LyricLine, Word } from '../../types/lyrics';

/**
 * FUZZY TEXT-TO-AUDIO ALIGNER (PRD Module 3)
 *
 * Maps the timing of an ASR transcription back onto the user's ORIGINAL lyric
 * text. The transcription is never shown to the user — it exists only to lend
 * its timestamps. Every visible character comes from `rawLyricsLines`, so the
 * user's spelling, capitalisation and punctuation are preserved exactly.
 *
 * Strategy:
 *   1. Flatten the original lyrics into a word stream, remembering each word's
 *      line and its raw (untouched) surface form.
 *   2. Globally align that stream against the recognised words with
 *      Needleman-Wunsch, scored by normalised string similarity.
 *   3. Copy timings from confidently matched words; linearly interpolate the
 *      timing of any original word the recogniser missed.
 *   4. Roll word timings up into per-line `startTime` / `endTime` bounds.
 */

export interface RecognizedWord {
  word: string;
  /** Seconds. */
  start: number;
  /** Seconds. */
  end: number;
  confidence?: number;
}

export interface AlignLyricsOptions {
  /** Minimum similarity (0..1) for a pair to count as a match. */
  matchThreshold?: number;
  /** Confidence assigned to interpolated (recogniser-missed) words. */
  interpolatedConfidence?: number;
  /** Fallback duration (seconds) used when a word must be estimated. */
  defaultWordDuration?: number;
}

const DEFAULTS: Required<AlignLyricsOptions> = {
  matchThreshold: 0.5,
  interpolatedConfidence: 0.35,
  defaultWordDuration: 0.3,
};

/** Normalises a token for comparison only; the raw form is what gets rendered. */
export function normalizeToken(w: string): string {
  return w
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^\p{L}\p{N}']/gu, '');
}

/** Classic Levenshtein edit distance between two short strings. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[b.length];
}

/** Similarity in 0..1 (1 = identical) from normalised edit distance. */
export function wordSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  return 1 - levenshtein(a, b) / maxLen;
}

interface OrigToken {
  raw: string; // exact surface form, rendered verbatim
  norm: string;
  lineIndex: number;
  /** Assigned during alignment. */
  start?: number;
  end?: number;
  confidence?: number;
  matched?: boolean;
}

/** Splits a line into surface words, dropping only pure-whitespace gaps. */
function splitWords(line: string): string[] {
  return line.split(/\s+/).filter((w) => w.length > 0);
}

function makeId(prefix: string, ...parts: (string | number)[]): string {
  return `${prefix}-${parts.join('-')}`;
}

/**
 * Needleman-Wunsch global alignment. Fills each original token that aligns to a
 * recognised token (above threshold) with that token's timing.
 */
function alignStreams(
  orig: OrigToken[],
  rec: RecognizedWord[],
  recNorm: string[],
  matchThreshold: number
): void {
  const n = orig.length;
  const m = rec.length;
  if (n === 0 || m === 0) return;

  const GAP = -0.6;
  // Score matrix + traceback. 0 = diag, 1 = up (orig gap), 2 = left (rec gap).
  const score = new Float64Array((n + 1) * (m + 1));
  const trace = new Uint8Array((n + 1) * (m + 1));
  const width = m + 1;

  for (let i = 1; i <= n; i++) {
    score[i * width] = i * GAP;
    trace[i * width] = 1;
  }
  for (let j = 1; j <= m; j++) {
    score[j] = j * GAP;
    trace[j] = 2;
  }

  for (let i = 1; i <= n; i++) {
    const on = orig[i - 1].norm;
    for (let j = 1; j <= m; j++) {
      const sim = wordSimilarity(on, recNorm[j - 1]);
      const matchScore = sim * 2 - 1; // 1..-1
      const diag = score[(i - 1) * width + (j - 1)] + matchScore;
      const up = score[(i - 1) * width + j] + GAP;
      const left = score[i * width + (j - 1)] + GAP;

      let best = diag;
      let dir = 0;
      if (up > best) {
        best = up;
        dir = 1;
      }
      if (left > best) {
        best = left;
        dir = 2;
      }
      score[i * width + j] = best;
      trace[i * width + j] = dir;
    }
  }

  // Traceback from bottom-right.
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    const dir = trace[i * width + j];
    if (dir === 0) {
      const o = orig[i - 1];
      const r = rec[j - 1];
      if (wordSimilarity(o.norm, recNorm[j - 1]) >= matchThreshold) {
        o.start = r.start;
        o.end = Math.max(r.end, r.start);
        o.confidence = r.confidence ?? 0.85;
        o.matched = true;
      }
      i--;
      j--;
    } else if (dir === 1) {
      i--;
    } else {
      j--;
    }
  }
}

/**
 * Fills timing for every original token the recogniser missed, using the
 * nearest matched anchors on each side. Runs on the flat token stream so
 * interpolation spans line breaks naturally.
 */
function interpolateMissing(orig: OrigToken[], opts: Required<AlignLyricsOptions>): void {
  const n = orig.length;
  if (n === 0) return;

  let idx = 0;
  while (idx < n) {
    if (orig[idx].matched) {
      idx++;
      continue;
    }
    // [runStart, runEnd] is a maximal run of unmatched tokens.
    const runStart = idx;
    let runEnd = idx;
    while (runEnd + 1 < n && !orig[runEnd + 1].matched) runEnd++;

    const left = runStart > 0 ? orig[runStart - 1] : null;
    const right = runEnd + 1 < n ? orig[runEnd + 1] : null;
    const count = runEnd - runStart + 1;

    let spanStart: number;
    let spanEnd: number;

    if (left && right) {
      spanStart = left.end ?? left.start ?? 0;
      spanEnd = right.start ?? spanStart;
      if (spanEnd <= spanStart) spanEnd = spanStart + count * 0.05;
    } else if (right) {
      // Leading run: end where the first matched word begins, walk backwards.
      spanEnd = right.start ?? 0;
      spanStart = Math.max(0, spanEnd - count * opts.defaultWordDuration);
    } else if (left) {
      // Trailing run: start where the last matched word ended, walk forwards.
      spanStart = left.end ?? left.start ?? 0;
      spanEnd = spanStart + count * opts.defaultWordDuration;
    } else {
      // Nothing matched at all: lay words end-to-end from zero.
      spanStart = 0;
      spanEnd = count * opts.defaultWordDuration;
    }

    const step = (spanEnd - spanStart) / count;
    for (let k = 0; k < count; k++) {
      const t = orig[runStart + k];
      t.start = spanStart + step * k;
      t.end = spanStart + step * (k + 1);
      t.confidence = opts.interpolatedConfidence;
    }
    idx = runEnd + 1;
  }

  // Enforce a monotonic, non-overlapping timeline.
  let prevEnd = 0;
  for (const t of orig) {
    if (t.start === undefined) t.start = prevEnd;
    if (t.start < prevEnd) t.start = prevEnd;
    if (t.end === undefined || t.end <= t.start) t.end = t.start + 0.05;
    prevEnd = t.end;
  }
}

/**
 * Aligns raw (untimed) lyric lines against a word-level transcription and
 * returns fully timed `LyricLine[]` with per-word timestamps.
 *
 * Blank input lines are preserved (index-stable) as untimed pass-through lines.
 */
export function alignLyricsWithTranscription(
  rawLyricsLines: string[],
  recognizedWords: RecognizedWord[],
  options: AlignLyricsOptions = {}
): LyricLine[] {
  const opts = { ...DEFAULTS, ...options };

  // 1. Flatten original lyrics into a token stream.
  const tokens: OrigToken[] = [];
  for (let lineIndex = 0; lineIndex < rawLyricsLines.length; lineIndex++) {
    for (const raw of splitWords(rawLyricsLines[lineIndex])) {
      // Punctuation-only tokens stay attached but never match (norm is empty).
      tokens.push({ raw, norm: normalizeToken(raw), lineIndex });
    }
  }

  // 2. Only real (normalised, non-empty) tokens participate in alignment.
  const rec = recognizedWords
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end))
    .slice()
    .sort((a, b) => a.start - b.start);
  const recNorm = rec.map((r) => normalizeToken(r.word));

  alignStreams(tokens, rec, recNorm, opts.matchThreshold);
  interpolateMissing(tokens, opts);

  // 3. Roll tokens back up into lines.
  const tokensByLine = new Map<number, OrigToken[]>();
  for (const t of tokens) {
    const arr = tokensByLine.get(t.lineIndex);
    if (arr) arr.push(t);
    else tokensByLine.set(t.lineIndex, [t]);
  }

  const out: LyricLine[] = [];
  for (let lineIndex = 0; lineIndex < rawLyricsLines.length; lineIndex++) {
    const rawLine = rawLyricsLines[lineIndex];
    const text = rawLine.trim();
    const lineTokens = tokensByLine.get(lineIndex) ?? [];

    if (lineTokens.length === 0) {
      // Blank line / instrumental gap: keep it, but don't invent a timestamp.
      out.push({
        id: makeId('al-line', lineIndex),
        text,
        startTime: null,
        endTime: null,
        source: 'SOURCE_AUDIO_ALIGNMENT',
        generatedBy: 'audio-sync',
        originalText: rawLine,
      });
      continue;
    }

    const words: Word[] = lineTokens.map((t, j) => ({
      id: makeId('al-w', lineIndex, j),
      text: t.raw,
      startTime: Number((t.start ?? 0).toFixed(3)),
      endTime: Number((t.end ?? 0).toFixed(3)),
      confidence: t.confidence,
    }));

    const startTime = words[0].startTime;
    const endTime = Math.max(words[words.length - 1].endTime, startTime + 0.05);
    const matchedCount = lineTokens.filter((t) => t.matched).length;
    const confidence = Number(
      (
        lineTokens.reduce((s, t) => s + (t.confidence ?? 0), 0) / lineTokens.length
      ).toFixed(2)
    );

    out.push({
      id: makeId('al-line', lineIndex),
      text,
      startTime: Number(startTime.toFixed(3)),
      endTime: Number(endTime.toFixed(3)),
      words,
      confidence,
      source: 'SOURCE_AUDIO_ALIGNMENT',
      generatedBy: 'audio-sync',
      originalText: rawLine,
      // Provenance the UI can surface as a low-confidence warning.
      type: matchedCount === 0 ? 'UNKNOWN' : undefined,
    });
  }

  // Guarantee line-level monotonicity for any interpolated blanks in between.
  let prevEnd = 0;
  for (const l of out) {
    if (l.startTime === null) continue;
    if (l.startTime < prevEnd) l.startTime = prevEnd;
    if (l.endTime !== null && l.endTime < l.startTime) l.endTime = l.startTime + 0.5;
    prevEnd = l.endTime ?? l.startTime;
  }

  return out;
}
