import type { OutputRange, OutputRangeMode } from '../../types/project';

/**
 * Output-range resolver — PRD Section 0.2 / 4 / 16.
 *
 * THE single authoritative function that turns an output-range configuration
 * plus the current lyric / media durations into a concrete { start, end,
 * duration }. App, Timeline, Preview, Export and the validator must all call
 * this instead of reconstructing the range independently, which was the source
 * of preview/export duration disagreement (P0.2).
 *
 * The function is pure and deterministic: identical inputs always produce
 * identical output, with no reads of clocks, randomness or global state.
 */

export type OutputRangeSource = 'LYRICS' | 'AUDIO' | 'MANUAL';

export interface ResolveOutputRangeInput {
  mode: OutputRangeMode;
  /**
   * The resolved lyric timeline duration (already includes any trailing
   * padding the app applies to un-bounded projects). Callers should pass the
   * same value everywhere — see getTimelineDuration / getTotalDuration.
   */
  lyricDuration: number;
  /** Decoded media duration in seconds, or null when no audio is loaded. */
  mediaDuration: number | null;
  /** Manual/custom start, in seconds. Ignored unless mode is MANUAL/CUSTOM. */
  startTime?: number;
  /** Manual/custom end, in seconds. Ignored unless mode is MANUAL/CUSTOM. */
  endTime?: number;
}

export interface ResolvedOutputRange {
  startTime: number;
  endTime: number;
  duration: number;
  source: OutputRangeSource;
  /** Echoed back so consumers can keep displaying the requested mode. */
  mode: OutputRangeMode;
}

function clampNonNegative(value: number): number {
  return value > 0 ? value : 0;
}

export function resolveOutputRange(input: ResolveOutputRangeInput): ResolvedOutputRange {
  const { mode, lyricDuration, mediaDuration } = input;
  const lyric = clampNonNegative(lyricDuration);
  const media = mediaDuration && mediaDuration > 0 ? mediaDuration : null;

  let startTime = 0;
  let endTime = lyric;
  let source: OutputRangeSource = 'LYRICS';

  switch (mode) {
    case 'AUDIO': {
      if (media !== null) {
        endTime = media;
        source = 'AUDIO';
      } else {
        endTime = lyric;
        source = 'LYRICS';
      }
      break;
    }
    case 'LYRICS': {
      endTime = lyric;
      source = 'LYRICS';
      break;
    }
    case 'MANUAL':
    case 'CUSTOM': {
      const fallbackEnd = media ?? lyric;
      startTime = clampNonNegative(input.startTime ?? 0);
      endTime = input.endTime && input.endTime > 0 ? input.endTime : fallbackEnd;
      source = 'MANUAL';
      break;
    }
    case 'VIDEO':
    case 'AUTO':
    default: {
      // AUTO: audio bounds the export when present, otherwise lyric timeline.
      if (media !== null) {
        endTime = media;
        source = 'AUDIO';
      } else {
        endTime = lyric;
        source = 'LYRICS';
      }
      break;
    }
  }

  // Guarantee a valid, non-inverted range.
  if (endTime < startTime) {
    endTime = startTime;
  }

  return {
    startTime,
    endTime,
    duration: clampNonNegative(endTime - startTime),
    source,
    mode,
  };
}

/**
 * Convenience overload that resolves directly from an ExportSettings-style
 * OutputRange object (or undefined => AUTO).
 */
export function resolveOutputRangeFrom(
  outputRange: OutputRange | undefined,
  lyricDuration: number,
  mediaDuration: number | null
): ResolvedOutputRange {
  return resolveOutputRange({
    mode: outputRange?.mode ?? 'AUTO',
    lyricDuration,
    mediaDuration,
    startTime: outputRange?.startTime,
    endTime: outputRange?.endTime,
  });
}
