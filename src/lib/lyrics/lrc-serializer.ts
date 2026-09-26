import type { LyricLine } from '../../types/lyrics';
import type { TrackMetadata } from '../../types/lyrics';
import { formatSecondsToTimecode } from './lrc-parser';

export function serializeToLrc(
  lines: LyricLine[],
  metadata?: Partial<TrackMetadata>,
  offsetMs: number = 0
): string {
  const result: string[] = [];

  if (metadata?.title) result.push(`[ti:${metadata.title}]`);
  if (metadata?.artist) result.push(`[ar:${metadata.artist}]`);
  if (metadata?.album) result.push(`[al:${metadata.album}]`);
  if (offsetMs !== 0) result.push(`[offset:${offsetMs}]`);

  for (const line of lines) {
    if (line.startTime === null) continue;
    const timecode = `[${formatSecondsToTimecode(line.startTime)}]`;

    if (line.words && line.words.length > 0) {
      // Enhanced word format: word<mm:ss.xx>
      const wordString = line.words
        .map((w) => `${w.text}<${formatSecondsToTimecode(w.endTime)}>`)
        .join(' ');
      result.push(`${timecode} ${wordString}`);
    } else {
      result.push(`${timecode} ${line.text}`);
    }
  }

  return result.join('\n');
}
