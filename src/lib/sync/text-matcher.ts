import type { LyricLine, Word } from '../../types/lyrics';
import { canonicalToken, estimateWeight, tokenizePairs } from './text-normalization';

/**
 * FUZZY TEXT-TO-AUDIO ALIGNER (PRD Modules E, F, G, H, J)
 *
 * Maps the timing of an ASR transcription back onto the user's ORIGINAL lyric
 * text. The transcription is never shown to the user — it exists only to lend
 * its timestamps. Every visible character comes from `rawLyricsLines`, so the
 * user's spelling, capitalisation and punctuation are preserved exactly.
 *
 * Pipeline:
 *   1. Flatten the original lyrics into a word stream (tokenize_pairs style),
 *      remembering each word's line and its raw (untouched) surface form.
 *   2. Globally align that stream against the recognised words with
 *      Needleman-Wunsch, scored by normalised string similarity. The DP is
 *      monotonic, so repeated lines map to their own occurrences IN ORDER —
 *      a repeated chorus can never collapse onto a single occurrence.
 *   3. Copy timings from matched words; estimate the timing of any original
 *      word the recogniser missed using nearest left/right anchors with
 *      length-weighted shares (adapted from the reference implementation).
 *   4. Roll word timings up into per-line `startTime` / `endTime` bounds
 *      (first valid word start / last valid word end — PRD Module H).
 *   5. Score confidence per word, line and overall (PRD Module J) and mark
 *      every word's timing source: matched / interpolated / estimated.
 *
 * When the transcription is empty or unusable the aligner falls back to a
 * weight-based distribution across the audio duration at very low confidence
 * (adapted from the reference's `distribute_lines`) instead of leaving the
 * timeline broken.
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
  /** Confidence assigned to estimated (no-anchor) words. */
  estimatedConfidence?: number;
  /** Fallback duration (seconds) used when a word must be estimated. */
  defaultWordDuration?: number;
  /** Audio duration in seconds, for the no-transcript distribution fallback. */
  audioDurationSec?: number;
}

const DEFAULTS: Required<AlignLyricsOptions> = {
  matchThreshold: 0.5,
  interpolatedConfidence: 0.35,
  estimatedConfidence: 0.2,
  defaultWordDuration: 0.3,
  audioDurationSec: 0,
};

/**
 * Normalises a token for comparison only; the raw form is what gets rendered.
 * Kept for compatibility — internal matching now uses `canonicalToken` from
 * text-normalization (apostrophes folded away on BOTH sides, so lyric "Don't"
 * and ASR "dont" compare as equal).
 */
export function normalizeToken(w: string): string {
  return canonicalToken(w, true);
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
  timingSource?: Word['timingSource'];
}

function makeId(prefix: string, ...parts: (string | number)[]): string {
  return `${prefix}-${parts.join('-')}`;
}

/**
 * Needleman-Wunsch global alignment. Fills each original token that aligns to a
 * recognised token (above threshold) with that token's timing and similarity.
 * Monotonic by construction: repeated lyrics always map to their own
 * occurrences in audio order (PRD Module F).
 */
function alignStreams(
  orig: OrigToken[],
  rec: RecognizedWord[],
  recNorm: string[],
  matchThreshold: number
): { matchedPairs: number } {
  const n = orig.length;
  const m = rec.length;
  if (n === 0 || m === 0) return { matchedPairs: 0 };

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
      // Matches score by similarity; a small on-diagonal bonus (adapted from
      // the reference's order_penalty concept) breaks ties toward uniform
      // progression, so with repeated lyrics each occurrence pairs with the
      // transcript occurrence at the same relative position instead of
      // bunching onto an earlier one.
      const matchScore =
        sim >= matchThreshold
          ? sim * 2 - 1 + 0.3 * (1 - Math.abs(i / n - j / m))
          : -1;
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
  let matchedPairs = 0;
  while (i > 0 && j > 0) {
    const dir = trace[i * width + j];
    if (dir === 0) {
      const o = orig[i - 1];
      const r = rec[j - 1];
      const sim = wordSimilarity(o.norm, recNorm[j - 1]);
      if (sim >= matchThreshold) {
        o.start = r.start;
        o.end = Math.max(r.end, r.start);
        o.matched = true;
        o.timingSource = 'matched';
        o.matchSim = sim;
        // Word confidence blends the text-match similarity with the ASR's own
        // confidence when the provider reports one (PRD Module J).
        o.confidence = Number((sim * (0.5 + 0.5 * (r.confidence ?? 0.85))).toFixed(3));
        matchedPairs++;
      }
      i--;
      j--;
    } else if (dir === 1) {
      i--;
    } else {
      j--;
    }
  }
  return { matchedPairs };
}

// Extra bookkeeping on OrigToken (declared after use above for clarity).
interface OrigToken {
  matchSim?: number;
}

/**
 * Fills timing for every original token the recogniser missed, using the
 * nearest matched anchors on each side with length-weighted shares (adapted
 * from the reference `interpolate_words`). Runs on the flat token stream so
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

    // Length-weighted shares inside the span (longer words take longer).
    const weights = orig.slice(runStart, runEnd + 1).map((t) => Math.max(1, t.raw.replace(/[^\p{L}\p{N}]/gu, '').length));
    const totalWeight = weights.reduce((s, w) => s + w, 0);

    let spanStart: number;
    let spanEnd: number;
    let source: Word['timingSource'];

    if (left && right && (left.end ?? left.start) !== undefined && (right.start ?? right.end) !== undefined) {
      spanStart = left.end ?? left.start ?? 0;
      spanEnd = right.start ?? right.end ?? spanStart;
      if (spanEnd <= spanStart) spanEnd = spanStart + count * 0.05;
      source = 'interpolated';
    } else if (right) {
      // Leading run: walk backwards from the first matched word.
      spanEnd = right.start ?? right.end ?? count * opts.defaultWordDuration;
      spanStart = Math.max(0, spanEnd - count * opts.defaultWordDuration);
      source = 'estimated';
    } else if (left) {
      // Trailing run: walk forwards from the last matched word.
      spanStart = left.end ?? left.start ?? 0;
      spanEnd = spanStart + count * opts.defaultWordDuration;
      source = 'estimated';
    } else {
      // Nothing matched at all: lay words end-to-end from zero.
      spanStart = 0;
      spanEnd = count * opts.defaultWordDuration;
      source = 'estimated';
    }

    let cursor = spanStart;
    for (let k = 0; k < count; k++) {
      const share = (spanEnd - spanStart) * (weights[k] / totalWeight);
      const t = orig[runStart + k];
      t.start = cursor;
      t.end = cursor + share;
      t.timingSource = source;
      t.confidence = source === 'interpolated' ? opts.interpolatedConfidence : opts.estimatedConfidence;
      cursor += share;
    }
    // Give the last word any floating-point remainder.
    orig[runEnd].end = spanEnd;
    idx = runEnd + 1;
  }

  // Enforce a monotonic, non-overlapping timeline with a minimum word span.
  let prevEnd = 0;
  for (const t of orig) {
    if (t.start === undefined) t.start = prevEnd;
    if (t.start < prevEnd) t.start = prevEnd;
    if (t.end === undefined || t.end <= t.start) t.end = t.start + 0.06;
    prevEnd = t.end;
  }
}

/** A low-trust timing distribution used when the transcript is unusable. */
function distributeLines(
  rawLyricsLines: string[],
  audioDurationSec: number,
  opts: Required<AlignLyricsOptions>
): LyricLine[] {
  const lines = rawLyricsLines.filter((l) => l.trim().length > 0);
  const usable = audioDurationSec > 0 ? audioDurationSec : Math.max(10, lines.length * 4);
  const weights = lines.map((l) => Math.max(0.5, estimateWeight(l)));
  const totalWeight = weights.reduce((s, w) => s + w, 0);

  const out: LyricLine[] = [];
  let cursor = 0;
  let lineIndex = 0;
  for (const rawLine of rawLyricsLines) {
    if (!rawLine.trim()) {
      out.push({
        id: makeId('al-line', lineIndex++),
        text: '',
        startTime: null,
        endTime: null,
        source: 'SOURCE_AUDIO_ALIGNMENT',
        generatedBy: 'audio-sync',
        originalText: rawLine,
      });
      continue;
    }
    const weight = weights.shift() ?? 1;
    const duration = Math.max(0.4, (usable * weight) / totalWeight);
    const lineWords = tokenizePairs(rawLine);
    const words: Word[] = lineWords.map(({ raw }, j) => ({
      id: makeId('al-w', lineIndex, j),
      text: raw,
      startTime: Number((cursor + (duration * j) / Math.max(1, lineWords.length)).toFixed(3)),
      endTime: Number((cursor + (duration * (j + 1)) / Math.max(1, lineWords.length)).toFixed(3)),
      confidence: opts.estimatedConfidence,
      timingSource: 'estimated',
    }));
    out.push({
      id: makeId('al-line', lineIndex),
      text: rawLine.trim(),
      startTime: Number(cursor.toFixed(3)),
      endTime: Number((cursor + duration).toFixed(3)),
      words,
      confidence: opts.estimatedConfidence,
      source: 'SOURCE_AUDIO_ALIGNMENT',
      generatedBy: 'audio-sync',
      originalText: rawLine,
      type: 'UNKNOWN',
    });
    cursor += duration;
    lineIndex++;
  }
  return out;
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
  const nonEmptyCount = rawLyricsLines.filter((l) => l.trim()).length;
  if (nonEmptyCount === 0) return [];

  // 1. Flatten original lyrics into a token stream.
  const tokens: OrigToken[] = [];
  rawLyricsLines.forEach((line, lineIndex) => {
    for (const { raw, canonical } of tokenizePairs(line)) {
      tokens.push({ raw, norm: canonical, lineIndex });
    }
  });

  // 2. Only real (normalised, non-empty) tokens participate in alignment.
  const rec = (recognizedWords ?? [])
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end))
    .slice()
    .sort((a, b) => a.start - b.start)
    .filter((r) => canonicalToken(r.word).length > 0);

  if (tokens.length === 0 || rec.length === 0) {
    // No recognisable transcript: distribute instead of failing (PRD §27
    // robustness) — very low confidence, the UI will flag every line.
    return distributeLines(rawLyricsLines, opts.audioDurationSec, opts);
  }

  alignStreams(tokens, rec, rec.map((r) => canonicalToken(r.word)), opts.matchThreshold);
  interpolateMissing(tokens, opts);

  // 3. Roll tokens back up into lines.
  const tokensByLine = new Map<number, OrigToken[]>();
  for (const t of tokens) {
    const arr = tokensByLine.get(t.lineIndex);
    if (arr) arr.push(t);
    else tokensByLine.set(t.lineIndex, [t]);
  }

  const out: LyricLine[] = [];
  rawLyricsLines.forEach((rawLine, lineIndex) => {
    const lineTokens = tokensByLine.get(lineIndex) ?? [];

    if (lineTokens.length === 0) {
      // Blank line / instrumental gap: keep it, but don't invent a timestamp.
      out.push({
        id: makeId('al-line', lineIndex),
        text: rawLine.trim(),
        startTime: null,
        endTime: null,
        source: 'SOURCE_AUDIO_ALIGNMENT',
        generatedBy: 'audio-sync',
        originalText: rawLine,
      });
      return;
    }

    const words: Word[] = lineTokens.map((t, j) => ({
      id: makeId('al-w', lineIndex, j),
      text: t.raw,
      startTime: Number((t.start ?? 0).toFixed(3)),
      endTime: Number((t.end ?? 0).toFixed(3)),
      confidence: t.confidence,
      timingSource: t.timingSource,
    }));

    const startTime = words[0].startTime;
    const endTime = Math.max(words[words.length - 1].endTime, startTime + 0.05);

    // Confidence = mean word evidence scaled by how much of the line matched
    // (adapted from the reference: avgSim × (0.55 + 0.45 × matchRatio)).
    const matchedTokens = lineTokens.filter((t) => t.matched);
    const matchRatio = matchedTokens.length / lineTokens.length;
    const meanWordConfidence =
      lineTokens.reduce((s, t) => s + (t.confidence ?? 0), 0) / lineTokens.length;
    const confidence = Number(
      Math.max(0, Math.min(1, meanWordConfidence * (0.55 + 0.45 * matchRatio))).toFixed(2)
    );

    out.push({
      id: makeId('al-line', lineIndex),
      text: rawLine.trim(),
      startTime: Number(startTime.toFixed(3)),
      endTime: Number(endTime.toFixed(3)),
      words,
      confidence,
      source: 'SOURCE_AUDIO_ALIGNMENT',
      generatedBy: 'audio-sync',
      originalText: rawLine,
      // Provenance the UI can surface as a low-confidence warning.
      type: matchedTokens.length === 0 ? 'UNKNOWN' : undefined,
    });
  });

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
