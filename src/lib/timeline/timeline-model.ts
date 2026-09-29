import type { LyricLine, VisualLyricBlock } from '../../types/lyrics';
import { TIMELINE } from '../config/editorial-constants';
import { resolveOutputRange, type ResolvedOutputRange } from './output-range';
import type { OutputRange } from '../../types/project';

/**
 * Timeline model — PRD Section 4.
 *
 * Pure, deterministic selectors for timeline semantics. No UI code should
 * recompute "which line is active", "how long is the timeline" or "do these
 * lines overlap" on its own; it should call these functions so every page
 * agrees by construction.
 *
 * Nothing here mutates its input. Functions that "change" the timeline return
 * a new array.
 */

/** Lines sorted chronologically; untimed lines (startTime === null) sort last. */
export function getSortedLines(lines: LyricLine[]): LyricLine[] {
  return [...lines].sort((a, b) => {
    if (a.startTime === null && b.startTime === null) return 0;
    if (a.startTime === null) return 1;
    if (b.startTime === null) return -1;
    return a.startTime - b.startTime;
  });
}

/**
 * The lyric timeline duration in seconds. Mirrors the existing
 * getTotalDuration(lines, null) behaviour so the resolver stays consistent:
 * the last end time, plus a trailing pad when nothing else bounds it.
 */
export function getTimelineDuration(lines: LyricLine[], mediaDuration?: number | null): number {
  let maxEnd = 0;
  for (const l of lines) {
    if (l.endTime !== null && l.endTime > maxEnd) maxEnd = l.endTime;
    else if (l.startTime !== null && l.startTime > maxEnd) maxEnd = l.startTime;
  }
  if (mediaDuration && mediaDuration > 0) {
    return Math.max(maxEnd, mediaDuration);
  }
  return maxEnd > 0 ? maxEnd + TIMELINE.trailingPadSec : 10;
}

/** Index of the line active at `time`, or -1 when between/outside lines. */
export function getLineIndexAt(lines: LyricLine[], time: number): number {
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startTime === null) continue;
    const end = l.endTime ?? l.startTime;
    if (time >= l.startTime && time < end) return i;
  }
  return -1;
}

/** The line active at `time`, or null when between/outside lines. */
export function getActiveLineAt(lines: LyricLine[], time: number): LyricLine | null {
  const idx = getLineIndexAt(lines, time);
  return idx === -1 ? null : lines[idx];
}

/** The visual block active at `time`, or null. */
export function getActiveBlockAt(
  blocks: VisualLyricBlock[],
  time: number
): VisualLyricBlock | null {
  for (const b of blocks) {
    if (time >= b.startTime && time < b.endTime) return b;
  }
  return null;
}

export interface TimelineOverlap {
  firstId: string;
  secondId: string;
  /** Overlap in seconds (positive means the lines overlap). */
  overlapSec: number;
}

/**
 * Detect overlaps between adjacent timed lines. Only overlaps beyond
 * `toleranceSec` are reported, so sub-millisecond float noise is ignored.
 */
export function detectOverlaps(lines: LyricLine[], toleranceSec = 0): TimelineOverlap[] {
  const sorted = getSortedLines(lines).filter(
    (l) => l.startTime !== null && l.endTime !== null
  );
  const overlaps: TimelineOverlap[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const overlap = (a.endTime as number) - (b.startTime as number);
    if (overlap > toleranceSec) {
      overlaps.push({ firstId: a.id, secondId: b.id, overlapSec: overlap });
    }
  }
  return overlaps;
}

export interface TimelineGap {
  beforeId: string;
  afterId: string;
  gapSec: number;
}

/** Detect gaps larger than `minGapSec` between adjacent timed lines. */
export function detectGaps(lines: LyricLine[], minGapSec = 0): TimelineGap[] {
  const sorted = getSortedLines(lines).filter(
    (l) => l.startTime !== null && l.endTime !== null
  );
  const gaps: TimelineGap[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const gap = (b.startTime as number) - (a.endTime as number);
    if (gap > minGapSec) {
      gaps.push({ beforeId: a.id, afterId: b.id, gapSec: gap });
    }
  }
  return gaps;
}

/**
 * Resolve the output range from the timeline. Thin wrapper that keeps the
 * resolver import in one module for consumers that already have `lines`.
 */
export function getOutputRange(
  lines: LyricLine[],
  outputRange: OutputRange | undefined,
  mediaDuration: number | null
): ResolvedOutputRange {
  return resolveOutputRange({
    mode: outputRange?.mode ?? 'AUTO',
    lyricDuration: getTimelineDuration(lines, null),
    mediaDuration,
    startTime: outputRange?.startTime,
    endTime: outputRange?.endTime,
  });
}
