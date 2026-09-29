/**
 * AUTO ARRANGE ORCHESTRATOR
 *
 * Raw LRC (immutable) -> Auto Arrange (Wrap Only | Smart Split | Audio Sync)
 *                    -> processedLines -> chunkAllLyricLines / Lyrics Type
 *                    -> Lyrics Effect -> Renderer
 *
 * This module owns MODE DISPATCH and the single `activeLines` resolution point.
 * It contains no animation logic and does not import lyricsEffects.ts,
 * lyricsTypes.ts or animationEngine.ts.
 */

import type { LyricLine, GeneratedBy } from '../../types/lyrics';
import {
  DEFAULT_SMART_SPLIT_SETTINGS,
  MOBILE_READABILITY_SETTINGS,
  smartSplitLyrics,
  wrapOnlyLyrics,
  segmentForAudioSync,
  resolveCueTimings,
  computeTargetWords,
  tokenize,
  wrapText,
  type SmartSplitSettings,
  type AutoArrangeLogEntry,
} from './smart-split';

export type ArrangeMode = 'wrap-only' | 'smart-split' | 'audio-sync';
export type LyricsViewMode = 'original' | 'processed';

export interface ArrangeSettings extends SmartSplitSettings {
  mode: ArrangeMode;
}

/** Mobile Readability is ON by default: more cues, shorter text, 2-3 lines. */
export const DEFAULT_ARRANGE_SETTINGS: ArrangeSettings = {
  ...MOBILE_READABILITY_SETTINGS,
  mode: 'smart-split',
};

/** A word recognised in the audio, already matched to an LRC source line. */
export interface AlignedWord {
  text: string;
  startTime: number;
  endTime: number;
  confidence: number;
  sourceLineId: string;
}

export interface AutoArrangeOptions {
  /**
   * Word-level alignment for Audio Sync mode. Smart Split never needs this and
   * works fully without audio.
   */
  alignment?: AlignedWord[] | null;
  /** Below this average score a line falls back to its plain Smart Split result. */
  alignmentConfidenceThreshold?: number;
}

export interface AutoArrangeResult {
  processedLines: LyricLine[];
  log: AutoArrangeLogEntry[];
  /** Lines whose audio alignment confidence was too low to trust. */
  lowConfidenceLineIds: string[];
}

/** Builds the visible text for a chunk, honouring the punctuation preference. */
function joinChunk(tokens: ReturnType<typeof tokenize>, settings: SmartSplitSettings): string {
  let text = tokens.map((t) => t.raw).join(' ').replace(/\s+/g, ' ').trim();
  if (!settings.preservePunctuation) {
    text = text.replace(/[,;:]+$/, '').replace(/([,;:])([)\]}])/g, '$2');
  }
  return text;
}

function countTokens(tokens: ReturnType<typeof tokenize>): number {
  return tokens.reduce((sum, t) => sum + t.wordCount, 0);
}

/**
 * Audio Sync: reuse the EXACT Smart Split segmentation, but place the boundaries
 * on real measured word timings instead of a proportional estimate.
 *
 * A line whose alignment confidence is too low falls back to its Smart Split
 * result and is reported through lowConfidenceLineIds.
 */
export function applyAudioSync(
  originalLines: LyricLine[],
  settings: SmartSplitSettings,
  alignment: AlignedWord[],
  confidenceThreshold: number
): AutoArrangeResult {
  const log: AutoArrangeLogEntry[] = [];
  const lowConfidenceLineIds: string[] = [];
  const { cues } = resolveCueTimings(originalLines, settings);

  // Fallback result, used verbatim for any line we cannot trust.
  const fallback = smartSplitLyrics(originalLines, settings);
  log.push(...fallback.log);
  const fallbackBySource = new Map<string, LyricLine[]>();
  for (const l of fallback.lines) {
    const key = l.sourceLineId ?? l.id;
    if (!fallbackBySource.has(key)) fallbackBySource.set(key, []);
    fallbackBySource.get(key)!.push(l);
  }

  const out: LyricLine[] = [];
  const handled = new Set(cues.map((c) => c.line.id));

  for (const cue of cues) {
    const line = cue.line;
    const text = (line.text || '').trim();
    if (text.length === 0) continue;

    const words = alignment
      .filter((w) => w.sourceLineId === line.id)
      .sort((a, b) => a.startTime - b.startTime);

    const avgConfidence =
      words.length > 0 ? words.reduce((s, w) => s + w.confidence, 0) / words.length : 0;

    const emitFallback = (): void => {
      lowConfidenceLineIds.push(line.id);
      out.push(
        ...(fallbackBySource.get(line.id) ?? []).map((l) => ({
          ...l,
          generatedBy: 'audio-sync' as GeneratedBy,
        }))
      );
    };

    if (words.length === 0 || avgConfidence < confidenceThreshold) {
      emitFallback();
      continue;
    }

    const start = Math.max(cue.start, words[0].startTime);
    const end = Math.min(cue.end, words[words.length - 1].endTime);
    if (end <= start) {
      emitFallback();
      continue;
    }

    // Identical segmentation to Smart Split for this cue.
    const segTokens = tokenize(text);
    const totalWords = countTokens(segTokens);
    const target = computeTargetWords(totalWords, end - start, settings);
    const chunks = segmentForAudioSync(segTokens, target, end - start, settings);

    // Distribute the recognised words across the chunks in proportion to the
    // chunk word counts, then take each chunk's real start/end from its words.
    let wordCursor = 0;
    const timings: Array<{ start: number; end: number }> = [];

    for (let i = 0; i < chunks.length; i++) {
      const from = wordCursor;
      wordCursor += chunks[i].wordCount;
      const to = i === chunks.length - 1 ? words.length : Math.min(words.length, wordCursor);

      const firstWord = words[Math.min(from, words.length - 1)];
      const lastWord = words[Math.min(Math.max(to - 1, from), words.length - 1)];

      timings.push({
        start: i === 0 ? start : Math.max(start, firstWord.startTime),
        end: i === chunks.length - 1 ? end : Math.max(start, lastWord.endTime),
      });
    }

    // Guarantee contiguity even when recognition timings are noisy.
    for (let i = 1; i < timings.length; i++) {
      timings[i].start = Math.max(timings[i].start, timings[i - 1].end);
    }
    timings[timings.length - 1].end = end;

    for (let i = 0; i < chunks.length; i++) {
      const visibleText = joinChunk(chunks[i].tokens, settings);
      if (visibleText.length === 0) continue;
      out.push({
        id: `${line.id}#${i}`,
        text: visibleText,
        startTime: timings[i].start,
        endTime: timings[i].end,
        confidence: avgConfidence,
        type: line.type,
        customStyleSeed: line.customStyleSeed,
        source: line.source,
        words: undefined,
        sourceLineId: line.id,
        generatedBy: 'audio-sync',
        visualLines: wrapText(visibleText, settings),
      });
    }
  }

  // Untimed lines pass through, exactly as in Smart Split.
  for (const l of originalLines) {
    if (!handled.has(l.id)) out.push({ ...l, generatedBy: 'original' as GeneratedBy });
  }

  out.sort(
    (a, b) => (a.startTime ?? Number.MAX_SAFE_INTEGER) - (b.startTime ?? Number.MAX_SAFE_INTEGER)
  );

  return { processedLines: out, log, lowConfidenceLineIds };
}

/**
 * AUTO ARRANGE — the single entry point for the whole non-destructive stage.
 *
 * Dispatches to Wrap Only / Smart Split / Audio Sync. Every mode returns a NEW
 * array; `originalLines` is never mutated.
 */
export function autoArrange(
  originalLines: LyricLine[],
  settings: ArrangeSettings = DEFAULT_ARRANGE_SETTINGS,
  options: AutoArrangeOptions = {}
): AutoArrangeResult {
  const log: AutoArrangeLogEntry[] = [];
  const lowConfidenceLineIds: string[] = [];

  if (settings.mode === 'wrap-only') {
    const result = wrapOnlyLyrics(originalLines, settings);
    log.push(...result.log);
    return { processedLines: result.lines, log, lowConfidenceLineIds };
  }

  // Smart Split is the baseline for every mode, including Audio Sync.
  const baseline = smartSplitLyrics(originalLines, settings);
  log.push(...baseline.log);

  if (settings.mode === 'audio-sync') {
    if (options.alignment && options.alignment.length > 0) {
      return applyAudioSync(
        originalLines,
        settings,
        options.alignment,
        options.alignmentConfidenceThreshold ?? 0.55
      );
    }
    log.push({
      level: 'warning',
      message: 'Audio Sync needs an audio file. Fell back to Smart Split results.',
    });
  }

  return { processedLines: baseline.lines, log, lowConfidenceLineIds };
}

/**
 * THE single resolution point for "which lines should be displayed".
 *
 * Timeline, Preview, Export, validation and manual editing all call this.
 * No component may read originalLines or processedLines directly.
 */
export function resolveActiveLines(
  originalLines: LyricLine[],
  processedLines: LyricLine[],
  viewMode: LyricsViewMode
): LyricLine[] {
  return viewMode === 'processed' && processedLines.length > 0 ? processedLines : originalLines;
}

/** "12 cues -> 31 cues" style stat for the UI. */
export function describeArrangeStats(originalCount: number, processedCount: number): string {
  return `${originalCount} ${originalCount === 1 ? 'cue' : 'cues'} \u2192 ${processedCount} ${
    processedCount === 1 ? 'cue' : 'cues'
  }`;
}

export { DEFAULT_SMART_SPLIT_SETTINGS, MOBILE_READABILITY_SETTINGS };
export type { SmartSplitSettings, AutoArrangeLogEntry };
