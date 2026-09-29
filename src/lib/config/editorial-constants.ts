/**
 * Editorial constants — PRD Section 8 & 30.
 *
 * Single home for the "magic numbers" that were previously duplicated across
 * the chunker, renderer, timeline and export code. Importing from here keeps a
 * change in one place instead of scattered literals such as 42, 4.5, 0.8, 0.70.
 *
 * These are deliberately `as const` so consumers get literal types and cannot
 * accidentally mutate shared configuration at runtime.
 */
export const EDITORIAL = {
  /** Max seconds a line without an explicit end time is held on screen. */
  defaultMaxHoldSec: 4.5,
  /** Chunking word bounds. */
  chunkMinWords: 3,
  chunkTargetWords: 4,
  chunkMaxWords: 5,
  /** A pause longer than this (seconds) is treated as a natural break. */
  pauseBreakSec: 0.8,
  /** Fraction of the safe canvas width a single visual line may occupy. */
  maxSafeTextRatio: 0.7,
  /** Character threshold used by the visual chunker for line wrapping. */
  chunkCharThreshold: 42,
} as const;

/**
 * Timeline / export numeric defaults — PRD Section 30.
 */
export const TIMELINE = {
  /** Horizontal timeline scale in pixels per second. */
  pxPerSecond: 64,
  /** Padding added after the last lyric when no audio bounds the duration. */
  trailingPadSec: 1.5,
} as const;

export const EXPORT_DEFAULTS = {
  /** Default video bitrate in kbps. */
  bitrateKbps: 8000,
  /** Default frames per second. */
  fps: 30,
  width: 1080,
  height: 1920,
  /** Encoder queue high-watermark before we apply backpressure (PRD 13.5). */
  encoderQueueHighWatermark: 12,
} as const;
