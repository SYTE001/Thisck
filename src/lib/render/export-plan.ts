import type { ExportSettings } from '../../types/project';
import { resolveOutputRangeFrom } from '../timeline/output-range';
import { EXPORT_DEFAULTS } from '../config/editorial-constants';

/**
 * Export plan — PRD Section 13.1 & 13.2.
 *
 * A single, immutable description of an export, generated once and threaded
 * through the whole pipeline so every stage (render, encode, mux, progress)
 * agrees on resolution, fps, range and frame count. This removes the scattered
 * "recompute duration/frames here" logic that let stages disagree.
 */
export interface ExportPlan {
  width: number;
  height: number;
  fps: number;
  bitrateKbps: number;
  startTimeSec: number;
  endTimeSec: number;
  durationSec: number;
  totalFrames: number;
  includeAudio: boolean;
  format: 'mp4' | 'webm';
}

export interface CreateExportPlanInput {
  exportSettings: ExportSettings;
  /** Resolved lyric timeline duration (same value the app/preview use). */
  lyricDuration: number;
  /** Decoded media duration in seconds, or null when no audio. */
  mediaDuration: number | null;
  /** Whether audio is actually available AND requested. */
  hasAudio: boolean;
}

export function createExportPlan(input: CreateExportPlanInput): ExportPlan {
  const { exportSettings, lyricDuration, mediaDuration, hasAudio } = input;

  const width = exportSettings.width || EXPORT_DEFAULTS.width;
  const height = exportSettings.height || EXPORT_DEFAULTS.height;
  const fps = exportSettings.fps || EXPORT_DEFAULTS.fps;
  const bitrateKbps = exportSettings.bitrateKbps || EXPORT_DEFAULTS.bitrateKbps;

  const resolved = resolveOutputRangeFrom(exportSettings.outputRange, lyricDuration, mediaDuration);

  const durationSec = resolved.duration;
  const totalFrames = Math.max(0, Math.ceil(durationSec * fps));

  return {
    width,
    height,
    fps,
    bitrateKbps,
    startTimeSec: resolved.startTime,
    endTimeSec: resolved.endTime,
    durationSec,
    totalFrames,
    includeAudio: hasAudio,
    format: exportSettings.format || 'mp4',
  };
}

/**
 * Integer-based frame timestamp in microseconds — PRD Section 13.2.
 *
 * Derive each timestamp from the integer frame index rather than accumulating a
 * float, so timestamps never drift over a long export.
 */
export function frameTimestampUs(frameIndex: number, fps: number): number {
  return Math.round((frameIndex * 1_000_000) / fps);
}

/** The wall-clock time (seconds) a given frame renders at, within the plan. */
export function frameTimeSec(plan: ExportPlan, frameIndex: number): number {
  return plan.startTimeSec + frameIndex / plan.fps;
}
