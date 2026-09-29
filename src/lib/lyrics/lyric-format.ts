import type { LyricLine, SourceFormat } from '../../types/lyrics';

/**
 * FORMAT UTILITIES — shared by LRC, SRT, TXT and JSON.
 *
 * Everything here is format-agnostic plumbing. Display formatting and export
 * formatting live here so no renderer, timeline component or exporter has to
 * hard-code assumptions about a particular lyric format.
 */

export const SUPPORTED_LYRIC_EXTENSIONS = ['.lrc', '.srt', '.txt', '.json'] as const;
export const SUPPORTED_LYRIC_ACCEPT = SUPPORTED_LYRIC_EXTENSIONS.join(',');

/**
 * Detects the lyric format from a filename.
 *
 * Detection is automatic: the user never has to choose LRC vs SRT manually.
 * Unknown extensions fall back to 'txt' (plain, untimed lyrics), matching the
 * existing behaviour.
 */
export function detectLyricFormat(fileName: string): SourceFormat {
  const lower = fileName.toLowerCase().trim();
  if (lower.endsWith('.lrc')) return 'lrc';
  if (lower.endsWith('.srt')) return 'srt';
  if (lower.endsWith('.json')) return 'json';
  return 'txt';
}

/** Human-readable label for the format indicator, e.g. "Format: SRT". */
export function describeSourceFormat(format: SourceFormat | undefined): string {
  if (!format) return 'Format: Unknown';
  return `Format: ${format.toUpperCase()}`;
}

function pad(n: number, width = 2): string {
  return String(Math.floor(Math.abs(n))).padStart(width, '0');
}

/**
 * Format-aware timeline time.
 *
 * - SRT  -> `mm:ss.mmm` (millisecond precision, matching the source file)
 * - others -> `mm:ss.mm` (the existing centisecond display)
 *
 * Millisecond precision is shown for SRT because the source itself carries
 * milliseconds and the editor should reflect the real values.
 */
export function formatTimelineTime(sec: number | null, format: SourceFormat = 'lrc'): string {
  if (sec === null || sec === undefined || isNaN(sec)) {
    return format === 'srt' ? '--:--.---' : '--:--.--';
  }
  const safe = Math.max(0, sec);

  if (format === 'srt') {
    const totalMs = Math.round(safe * 1000);
    const ms = totalMs % 1000;
    const totalSec = Math.floor(totalMs / 1000);
    const s = totalSec % 60;
    const m = Math.floor(totalSec / 60);
    return `${pad(m)}:${pad(s)}.${pad(ms, 3)}`;
  }

  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${pad(m)}:${(s).toFixed(2).padStart(5, '0')}`;
}

/**
 * Format-aware duration label.
 *
 * - SRT -> 3 decimals ("1.998s") so the displayed duration matches the source
 * - others -> 2 decimals, the existing behaviour
 */
export function formatDurationSeconds(
  duration: number | null,
  format: SourceFormat = 'lrc'
): string {
  if (duration === null || duration === undefined || isNaN(duration)) return '--';
  const decimals = format === 'srt' ? 3 : 2;
  return `${duration.toFixed(decimals)}s`;
}

/**
 * The format of a set of lyric lines.
 *
 * Reads the per-line metadata rather than any global flag, so a mixed or
 * migrated list still reports something sensible.
 */
export function resolveSourceFormat(lines: LyricLine[]): SourceFormat {
  for (const l of lines) {
    if (l.sourceFormat) return l.sourceFormat;
  }
  return 'lrc';
}

/** SRT uses an arrow separator with a comma before the milliseconds. */
export function formatSrtTimestamp(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const totalMs = Math.round(safe * 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const m = totalMin % 60;
  const h = Math.floor(totalMin / 60);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}
