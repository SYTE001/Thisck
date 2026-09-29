import type { LyricLine } from '../../types/lyrics';
import { formatSrtTimestamp } from './lyric-format';

/**
 * SRT SERIALIZER
 *
 * Produces a valid SubRip file from the UNIFIED lyric model. Identical input
 * shape to the LRC serializer, so exporting either format is the same call with
 * a different writer.
 *
 * Numbering is sequential from 1 and is regenerated on write: subtitle indices
 * are never used for timing, so they carry no information we need to preserve.
 */

/** Maximum characters per SRT text line before it is wrapped. */
const SRT_WRAP_AT = 42;

export interface SerializeSrtOptions {
  /** Wrap long text into at most this many lines (default 2). */
  maxLines?: number;
  /** Characters per line when wrapping (default 42). */
  maxCharsPerLine?: number;
}

/**
 * Wraps text into balanced lines so the exported subtitles stay readable.
 * Honours the cue's stored visualLines when present.
 */
function wrapForSrt(
  line: LyricLine,
  maxLines: number,
  maxCharsPerLine: number
): string[] {
  if (line.visualLines && line.visualLines.length > 0) {
    return line.visualLines.map((l) => l.trim()).filter((l) => l.length > 0);
  }

  const text = (line.text || '').trim();
  if (text.length <= maxCharsPerLine || maxLines <= 1) return [text];

  const words = text.split(/\s+/).filter(Boolean);
  const targetLines = Math.min(maxLines, Math.ceil(text.length / maxCharsPerLine));
  const targetChars = Math.ceil(text.length / targetLines);

  const out: string[] = [];
  let current: string[] = [];
  let len = 0;

  for (const w of words) {
    const projected = len === 0 ? w.length : len + 1 + w.length;
    if (current.length > 0 && projected > targetChars && out.length < targetLines - 1) {
      out.push(current.join(' '));
      current = [w];
      len = w.length;
    } else {
      current.push(w);
      len = projected;
    }
  }
  if (current.length > 0) out.push(current.join(' '));
  return out;
}

/**
 * Serializes lyric lines to valid SRT.
 *
 * When Auto Arrange has generated extra cues, each generated cue becomes its own
 * SRT block — the caller simply passes the processed lines.
 */
export function serializeToSrt(
  lines: LyricLine[],
  options: SerializeSrtOptions = {}
): string {
  const maxLines = options.maxLines ?? 2;
  const maxCharsPerLine = options.maxCharsPerLine ?? SRT_WRAP_AT;

  const blocks: string[] = [];
  let n = 0;

  for (const line of lines) {
    // Untimed lines cannot be represented in SRT; skip rather than invent timing.
    if (line.startTime === null || line.endTime === null) continue;
    const text = (line.text || '').trim();
    if (!text) continue;

    const wrapped = wrapForSrt(line, maxLines, maxCharsPerLine);
    if (wrapped.length === 0) continue;

    // Guarantee a valid block: end must be after start.
    const end = line.endTime > line.startTime ? line.endTime : line.startTime + 0.001;

    n += 1;
    blocks.push(
      [
        String(n),
        `${formatSrtTimestamp(line.startTime)} --> ${formatSrtTimestamp(end)}`,
        ...wrapped,
      ].join('\n')
    );
  }

  // A trailing newline keeps the file POSIX-clean.
  return blocks.length > 0 ? `${blocks.join('\n\n')}\n` : '';
}
