import type { LyricLine, TrackMetadata, TimingSource, SourceFormat } from '../../types/lyrics';
import { parseLrc } from './lrc-parser';
import { parseSrt } from './srt-parser';
import { parseTxtLyrics } from './txt-parser';
import { parseJsonLyrics } from './json-parser';
import { detectLyricFormat } from './lyric-format';

/**
 * UNIFIED LYRIC IMPORT
 *
 * The single entry point for every supported lyric file.
 *
 *   LRC parser ─┐
 *   SRT parser ─┤
 *   TXT parser ─┼─> Normalized Lyrics Model ─> Auto Arrange ─> Renderer
 *   JSON parser ┘
 *
 * The format only decides HOW to parse source data. Everything downstream
 * (Lyrics Type, Lyrics Effect, Smart Split, renderer, exporter) sees the same
 * normalized LyricLine[] and never branches on the file format.
 *
 * Format detection is automatic from the file extension, so the user is never
 * asked to choose LRC vs SRT.
 */

export interface LyricImportResult {
  lines: LyricLine[];
  sourceFormat: SourceFormat;
  timingSource: TimingSource;
  metadata?: Partial<TrackMetadata>;
  /** Non-fatal notices (missing indices, tolerated separators, stripped tags). */
  warnings: string[];
}

/** The TimingSource that corresponds to a parsed lyric format. */
function timingSourceForFormat(format: SourceFormat, lines: LyricLine[]): TimingSource {
  if (format === 'srt') return 'SOURCE_SRT';
  if (format === 'json') return lines[0]?.source ?? 'SOURCE_UNKNOWN';
  if (format === 'txt') return 'SOURCE_UNKNOWN';
  // LRC (and enhanced LRC, which reports itself per line).
  return lines.some((l) => l.source === 'SOURCE_ENHANCED_LRC')
    ? 'SOURCE_ENHANCED_LRC'
    : 'SOURCE_LRC';
}

/**
 * Parses lyric file content into the normalized model.
 *
 * @throws SrtParseError for invalid SRT, and a plain Error for other formats.
 */
export function importLyricsFile(content: string, fileName: string): LyricImportResult {
  const extensionFormat = detectLyricFormat(fileName);
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  const warnings: string[] = [];

  switch (extensionFormat) {
    case 'srt': {
      const parsed = parseSrt(content);
      warnings.push(...parsed.warnings.map((w) => w.message));
      return {
        lines: parsed.lines,
        sourceFormat: 'srt',
        timingSource: 'SOURCE_SRT',
        // SRT carries no title/artist metadata, so the filename is the title.
        metadata: { title: baseName },
        warnings,
      };
    }

    case 'lrc': {
      const parsed = parseLrc(content);
      return {
        lines: parsed.lines,
        sourceFormat: 'lrc',
        timingSource: timingSourceForFormat('lrc', parsed.lines),
        metadata: {
          title: parsed.metadata.title || baseName,
          artist: parsed.metadata.artist,
          album: parsed.metadata.album,
        },
        warnings,
      };
    }

    case 'json': {
      const parsed = parseJsonLyrics(content);
      return {
        lines: parsed.lines,
        sourceFormat: 'json',
        timingSource: timingSourceForFormat('json', parsed.lines),
        metadata: parsed.track ?? { title: baseName },
        warnings,
      };
    }

    default: {
      const parsed = parseTxtLyrics(content);
      return {
        lines: parsed.lines,
        sourceFormat: 'txt',
        timingSource: 'SOURCE_UNKNOWN',
        metadata: { title: baseName },
        warnings,
      };
    }
  }
}

/**
 * Turns an import failure into a message that is safe to show the user.
 * The app must never crash on a malformed file.
 */
export function describeImportError(err: unknown, fileName: string): string {
  if (err instanceof Error) {
    // SrtParseError already composes a "SRT Import Error / Block N ..." body.
    return err.message;
  }
  return `Failed to import "${fileName}". The file could not be parsed.`;
}
