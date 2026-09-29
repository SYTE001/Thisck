import type { LyricLine, LyricType, SrtBlockError } from '../../types/lyrics';

/**
 * SRT PARSER
 *
 * Converts a standard SubRip (.srt) file into the SAME normalized LyricLine
 * model that the LRC parser produces. There is deliberately no SRT-specific
 * rendering path anywhere in the app: the format is only responsible for
 * parsing source data.
 *
 *   LRC parser ─┐
 *               ├─> Normalized Lyrics Model ─> Auto Arrange ─> Renderer
 *   SRT parser ─┘
 *
 * Guarantees:
 *  - Millisecond precision is preserved (1006 ms -> 1.006 s, no rounding).
 *  - The subtitle index is NEVER used for timing.
 *  - The original block text (including line breaks and styling tags) is
 *    preserved verbatim in `originalText`.
 *  - Malformed files raise a single SrtParseError naming every bad block
 *    instead of crashing or importing garbage.
 */

export interface SrtParseWarning {
  /** 1-based block number as it appears in the file. */
  block: number;
  message: string;
}

export interface ParsedSrtResult {
  lines: LyricLine[];
  warnings: SrtParseWarning[];
  /** Every timestamp already converted to milliseconds, for debugging/tests. */
  timingsMs: Array<{ startMs: number; endMs: number }>;
}

/**
 * A fatal SRT import error.
 *
 * `blockErrors` lists every offending block so the UI can report all problems in
 * one pass rather than making the user fix them one at a time.
 */
export class SrtParseError extends Error {
  readonly blockErrors: SrtBlockError[];

  constructor(blockErrors: SrtBlockError[]) {
    const body = blockErrors.map((e) => e.message).join('\n');
    super(`SRT Import Error\n${body}`);
    this.name = 'SrtParseError';
    this.blockErrors = blockErrors;
  }
}

const TIMESTAMP_RE = /^(\d{1,3}):(\d{1,2}):(\d{1,2})([^\d])(\d{1,3})$/;
const ARROW_RE = /-->/;
const STYLING_TAG_RE = /<\/?[a-z][^>]*>/gi;
const INDEX_ONLY_RE = /^\d+$/;

export type TimestampResult =
  | { ok: true; ms: number; nonStandardSeparator: boolean }
  | { ok: false; reason: 'invalid timestamp' | 'invalid timestamp separator' };

/**
 * Parses `HH:MM:SS,mmm` into MILLISECONDS.
 *
 * Accepts 1-3 digit hours/minutes/seconds and 1-3 digit milliseconds (right
 * padded: `,06` means 60 ms). A dot is tolerated as the millisecond separator
 * because it is common in the wild, but it is reported as a warning. Any other
 * separator is a hard error.
 */
export function parseSrtTimestampToMs(raw: string): TimestampResult {
  const ts = raw.trim();
  const m = ts.match(TIMESTAMP_RE);
  if (!m) return { ok: false, reason: 'invalid timestamp' };

  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  const seconds = Number(m[3]);
  const separator = m[4];
  const fraction = m[5];

  if (minutes > 59 || seconds > 59) return { ok: false, reason: 'invalid timestamp' };
  if (separator !== ',' && separator !== '.') {
    return { ok: false, reason: 'invalid timestamp separator' };
  }

  // `,06` means 60ms; `,6` means 600ms. Pad on the RIGHT.
  const millis = Number(fraction.padEnd(3, '0'));

  return {
    ok: true,
    ms: hours * 3_600_000 + minutes * 60_000 + seconds * 1000 + millis,
    nonStandardSeparator: separator === '.',
  };
}

/** Convenience helper: milliseconds or null. */
export function srtTimestampToMs(raw: string): number | null {
  const r = parseSrtTimestampToMs(raw);
  return r.ok ? r.ms : null;
}

/** Whitespace-safe split into subtitle blocks separated by blank lines. */
function splitIntoRawBlocks(content: string): string[] {
  // Strip a UTF-8 BOM, normalize CRLF/CR to LF, then split on blank lines.
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

  return normalized
    .split(/\n[ \t]*\n/)
    .map((b) => b.replace(/\n+$/, '').replace(/^\n+/, ''))
    .filter((b) => b.trim().length > 0);
}

function describeTsError(
  block: number,
  reason: 'invalid timestamp' | 'invalid timestamp separator'
): string {
  return reason === 'invalid timestamp separator'
    ? `Block ${block} contains an invalid timestamp separator.`
    : `Block ${block} contains an invalid timestamp.`;
}

/**
 * Parses SRT content into the normalized lyric model.
 *
 * @throws SrtParseError when any block is structurally invalid.
 */
export function parseSrt(content: string): ParsedSrtResult {
  const warnings: SrtParseWarning[] = [];
  const errors: SrtBlockError[] = [];
  const lines: LyricLine[] = [];
  const timingsMs: Array<{ startMs: number; endMs: number }> = [];

  if (!content || content.trim().length === 0) {
    throw new SrtParseError([{ block: 0, message: 'The file is empty.' }]);
  }

  const rawBlocks = splitIntoRawBlocks(content);
  if (rawBlocks.length === 0) {
    throw new SrtParseError([{ block: 0, message: 'No subtitle blocks were found in the file.' }]);
  }

  const seenIndices = new Set<number>();

  for (let b = 0; b < rawBlocks.length; b++) {
    const blockNumber = b + 1;
    const rawLines = rawBlocks[b].split('\n').map((l) => l.trim());
    if (rawLines.length === 0) continue;

    // ── Optional subtitle index. Timing NEVER depends on this. ──
    let originalIndex: number | null = null;
    let cursor = 0;
    if (INDEX_ONLY_RE.test(rawLines[0])) {
      originalIndex = Number(rawLines[0]);
      cursor = 1;
      if (seenIndices.has(originalIndex)) {
        warnings.push({
          block: blockNumber,
          message: `Block ${blockNumber} reuses subtitle index ${originalIndex}; the index is ignored for timing.`,
        });
      }
      seenIndices.add(originalIndex);
    } else {
      warnings.push({
        block: blockNumber,
        message: `Block ${blockNumber} is missing its subtitle index; it was imported using its timestamps.`,
      });
    }

    // ── Timestamp line, e.g. 00:00:01,006 --> 00:00:03,004 ──
    // The arrow may sit on the first or second line of the block.
    let arrowLineIndex = -1;
    for (let i = cursor; i < Math.min(cursor + 2, rawLines.length); i++) {
      if (ARROW_RE.test(rawLines[i])) {
        arrowLineIndex = i;
        break;
      }
    }

    if (arrowLineIndex === -1) {
      errors.push({
        block: blockNumber,
        message: `Block ${blockNumber} is missing the timecode arrow (-->).`,
        reason: 'missing arrow',
      });
      continue;
    }

    const arrowParts = rawLines[arrowLineIndex].split(ARROW_RE);
    if (arrowParts.length < 2 || !arrowParts[0].trim() || !arrowParts[1].trim()) {
      errors.push({
        block: blockNumber,
        message: `Block ${blockNumber} contains an invalid timestamp.`,
        reason: 'invalid timestamp',
      });
      continue;
    }

    // Trailing positioning coordinates (X1:.. Y1:..) are ignored.
    const startRaw = arrowParts[0].trim().split(/\s+/)[0];
    const endRaw = arrowParts[1].trim().split(/\s+/)[0];

    const startRes = parseSrtTimestampToMs(startRaw);
    if (!startRes.ok) {
      errors.push({
        block: blockNumber,
        message: describeTsError(blockNumber, startRes.reason),
        reason: startRes.reason,
      });
      continue;
    }

    const endRes = parseSrtTimestampToMs(endRaw);
    if (!endRes.ok) {
      errors.push({
        block: blockNumber,
        message: describeTsError(blockNumber, endRes.reason),
        reason: endRes.reason,
      });
      continue;
    }

    if (startRes.nonStandardSeparator || endRes.nonStandardSeparator) {
      warnings.push({
        block: blockNumber,
        message: `Block ${blockNumber} uses "." instead of "," before the milliseconds; it was imported as milliseconds.`,
      });
    }

    if (endRes.ms < startRes.ms) {
      errors.push({
        block: blockNumber,
        message: `Block ${blockNumber} has an end time before its start time.`,
        reason: 'end before start',
      });
      continue;
    }

    // ── Text lines (a block may contain several). ──
    const textLines = rawLines
      .slice(arrowLineIndex + 1)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (textLines.length === 0) {
      errors.push({
        block: blockNumber,
        message: `Block ${blockNumber} contains no lyric text.`,
        reason: 'missing text',
      });
      continue;
    }

    // Preserve the EXACT source text, including line breaks and inline tags.
    const originalText = textLines.join('\n');

    const hasStylingTags = STYLING_TAG_RE.test(originalText);
    STYLING_TAG_RE.lastIndex = 0;
    if (hasStylingTags) {
      warnings.push({
        block: blockNumber,
        message: `Block ${blockNumber} contains inline styling tags; they were removed from the visible text and kept in the source text.`,
      });
    }

    // Normalized single-line form. Multi-line SRT text becomes ONE logical
    // phrase; the original breaks are retained in `visualLines` so the existing
    // formatting system can still honour them.
    const visibleLines = textLines
      .map((l) => l.replace(STYLING_TAG_RE, '').replace(/\s+/g, ' ').trim())
      .filter((l) => l.length > 0);
    STYLING_TAG_RE.lastIndex = 0;

    if (visibleLines.length === 0) {
      errors.push({
        block: blockNumber,
        message: `Block ${blockNumber} contains no lyric text.`,
        reason: 'missing text',
      });
      continue;
    }

    const text = visibleLines.join(' ');
    const resolvedIndex = originalIndex ?? blockNumber;
    const isSupporting = /^[([{].*[)\]}][.,;?!]*$/.test(text);

    lines.push({
      id: `srt-${resolvedIndex}-${startRes.ms}`,
      text,
      originalText,
      originalIndex: resolvedIndex,
      sourceFormat: 'srt',
      // Millisecond precision preserved exactly: 1006 ms -> 1.006 s.
      startTime: startRes.ms / 1000,
      endTime: endRes.ms / 1000,
      source: 'SOURCE_SRT',
      confidence: 1.0,
      customStyleSeed: (resolvedIndex * 17 + 23) % 100,
      type: (isSupporting ? 'SUPPORTING' : 'PRIMARY') as LyricType,
      visualLines: visibleLines.length > 1 ? visibleLines : [text],
    });

    timingsMs.push({ startMs: startRes.ms, endMs: endRes.ms });
  }

  if (errors.length > 0) throw new SrtParseError(errors);

  if (lines.length === 0) {
    throw new SrtParseError([
      { block: 0, message: 'No valid subtitle blocks were found in the file.' },
    ]);
  }

  return { lines, warnings, timingsMs };
}

