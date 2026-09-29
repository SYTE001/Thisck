import type { LyricLine, TrackMetadata } from '../../types/lyrics';
import { serializeToSrt, type SerializeSrtOptions } from './srt-serializer';
import { serializeToLrc } from './lrc-serializer';
import { toast } from '../ui/toast-bus';

/**
 * EXPORT / CONVERSION UTILITIES
 *
 * Provides a unified interface to export active/processed lyrics as either
 * SubRip (.srt) or Synced LRC (.lrc) files.
 */

export function serializeLyrics(
  lines: LyricLine[],
  format: 'srt' | 'lrc',
  metadata?: Partial<TrackMetadata>,
  srtOptions?: SerializeSrtOptions
): string {
  if (format === 'srt') {
    return serializeToSrt(lines, srtOptions);
  }
  return serializeToLrc(lines, metadata);
}

/**
 * Triggers a browser download of the active lyrics in the requested format (.srt or .lrc).
 */
export function downloadLyricsFile(
  lines: LyricLine[],
  format: 'srt' | 'lrc',
  metadata?: Partial<TrackMetadata>,
  srtOptions?: SerializeSrtOptions
): void {
  const content = serializeLyrics(lines, format, metadata, srtOptions);
  if (!content) {
    toast.warning(`Nothing to export as .${format}.`, 'No timed lyrics are available yet.');
    return;
  }

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const baseName = (metadata?.title || 'lyrics')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .trim() || 'lyrics';

  link.href = url;
  link.download = `${baseName}.${format}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
