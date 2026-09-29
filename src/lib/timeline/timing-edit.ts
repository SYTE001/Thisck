/**
 * Timeline timing edit helpers — PRD Section 6.1.
 *
 * Keyboard nudge amounts and timecode field parsing/formatting for manual
 * numeric timing editing. Pure and deterministic.
 *
 *   arrow keys            = ±10 ms
 *   Shift + arrow keys    = ±100 ms
 *   Ctrl/Cmd + arrow keys = ±1000 ms
 */

export interface NudgeModifiers {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

/** Magnitude (ms) of a nudge for the given modifier keys. */
export function nudgeMagnitudeMs(mods: NudgeModifiers): number {
  if (mods.ctrlKey || mods.metaKey) return 1000;
  if (mods.shiftKey) return 100;
  return 10;
}

/**
 * Signed nudge (ms) for an arrow key press, or null if the key is not an
 * up/down/left/right arrow. Up/Right increase time; Down/Left decrease.
 */
export function nudgeDeltaMsForKey(key: string, mods: NudgeModifiers): number | null {
  const mag = nudgeMagnitudeMs(mods);
  switch (key) {
    case 'ArrowUp':
    case 'ArrowRight':
      return mag;
    case 'ArrowDown':
    case 'ArrowLeft':
      return -mag;
    default:
      return null;
  }
}

/**
 * Format seconds as MM:SS.mmm for the numeric timing fields
 * (e.g. 12.35 -> "00:12.350").
 */
export function formatTimingField(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const totalMs = Math.round(clamped * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60);
  const pad = (n: number, w: number) => n.toString().padStart(w, '0');
  return `${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`;
}

/**
 * Parse a timing field back to seconds. Accepts MM:SS.mmm, SS.mmm, or a plain
 * seconds number. Returns null when the input cannot be parsed.
 */
export function parseTimingField(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  // MM:SS(.mmm)
  const colon = trimmed.match(/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (colon) {
    const m = parseInt(colon[1], 10);
    const s = parseInt(colon[2], 10);
    const ms = colon[3] ? parseInt(colon[3].padEnd(3, '0'), 10) : 0;
    if (s >= 60) return null;
    return m * 60 + s + ms / 1000;
  }

  // Plain seconds (optionally fractional)
  const num = Number(trimmed);
  if (Number.isFinite(num) && num >= 0) return num;

  return null;
}
