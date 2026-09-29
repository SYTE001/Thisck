/**
 * Timeline snapping — PRD Section 6.2.
 *
 * Configurable snap resolution, replacing the hardcoded 100ms/50ms behaviour.
 * Pure and deterministic.
 */

export type SnapMode = 'off' | 'frame' | '50ms' | '100ms' | 'beat';

export interface SnapContext {
  /** Frames per second, used by 'frame' mode. */
  fps?: number;
  /** Beat length in seconds, used by 'beat' mode (e.g. 60 / bpm). */
  beatSec?: number;
}

/** The default snap resolution (PRD 6.2: default 50ms). */
export const DEFAULT_SNAP_MODE: SnapMode = '50ms';

/**
 * Snap a time (seconds) to the given mode. 'off' returns the time unchanged so
 * snapping can be fully disabled (acceptance criteria).
 */
export function snapTime(time: number, mode: SnapMode, ctx: SnapContext = {}): number {
  if (mode === 'off') return time;

  let stepSec: number;
  switch (mode) {
    case 'frame':
      stepSec = ctx.fps && ctx.fps > 0 ? 1 / ctx.fps : 1 / 30;
      break;
    case '50ms':
      stepSec = 0.05;
      break;
    case '100ms':
      stepSec = 0.1;
      break;
    case 'beat':
      stepSec = ctx.beatSec && ctx.beatSec > 0 ? ctx.beatSec : 0.5;
      break;
    default:
      return time;
  }

  return Math.round(time / stepSec) * stepSec;
}
