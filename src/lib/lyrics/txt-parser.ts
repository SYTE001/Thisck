import type { LyricLine } from '../../types/lyrics';

export interface ParsedTxtResult {
  lines: LyricLine[];
  totalLines: number;
  message: string;
}

export function parseTxtLyrics(content: string): ParsedTxtResult {
  const rawLines = content.split(/\r?\n/);
  const resultLines: LyricLine[] = [];

  let idx = 0;
  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Filter out common header labels like [Chorus], [Verse 1]
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      continue;
    }

    resultLines.push({
      id: `txt-line-${idx + 1}`,
      text: trimmed,
      originalText: trimmed,
      originalIndex: idx + 1,
      sourceFormat: 'txt',
      startTime: null, // Strictly null! Never invent fake timing.
      endTime: null,
      source: 'SOURCE_UNKNOWN',
      confidence: 0,
      customStyleSeed: (idx * 13 + 7) % 100,
    });
    idx++;
  }

  return {
    lines: resultLines,
    totalLines: resultLines.length,
    message: 'Plain TXT lyrics loaded. Timestamp data is required for video synchronization.',
  };
}
