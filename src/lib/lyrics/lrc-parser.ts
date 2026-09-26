import type { LyricLine, Word, TimingSource, LyricType } from '../../types/lyrics';

export interface ParsedLrcResult {
  lines: LyricLine[];
  metadata: {
    title?: string;
    artist?: string;
    album?: string;
    offsetMs?: number;
  };
  isEnhanced: boolean;
  timingSource: TimingSource;
}

// Convert "mm:ss.xx" or "mm:ss.xxx" or "hh:mm:ss.xx" to seconds
export function parseTimestampToSeconds(ts: string): number | null {
  const parts = ts.trim().split(':');
  if (parts.length === 2) {
    const mins = parseFloat(parts[0]);
    const secs = parseFloat(parts[1]);
    if (isNaN(mins) || isNaN(secs)) return null;
    return mins * 60 + secs;
  } else if (parts.length === 3) {
    const hours = parseFloat(parts[0]);
    const mins = parseFloat(parts[1]);
    const secs = parseFloat(parts[2]);
    if (isNaN(hours) || isNaN(mins) || isNaN(secs)) return null;
    return hours * 3600 + mins * 60 + secs;
  }
  return null;
}

export function formatSecondsToTimecode(secs: number, includeMs: boolean = true): string {
  if (isNaN(secs) || secs < 0) secs = 0;
  const mins = Math.floor(secs / 60);
  const remainingSecs = secs % 60;
  const wholeSecs = Math.floor(remainingSecs);
  const ms = Math.floor((remainingSecs - wholeSecs) * 100);

  const pad = (n: number, z = 2) => String(n).padStart(z, '0');
  if (includeMs) {
    return `${pad(mins)}:${pad(wholeSecs)}.${pad(ms)}`;
  }
  return `${pad(mins)}:${pad(wholeSecs)}`;
}

export function parseLrc(content: string, defaultMaxHoldSec: number = 4.5): ParsedLrcResult {
  const rawLines = content.split(/\r?\n/);
  const metadata: ParsedLrcResult['metadata'] = {};
  const parsedLineEntries: Array<{
    timeSec: number;
    rawText: string;
  }> = [];

  let isEnhanced = false;

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check ID metadata tags
    const metaMatch = trimmed.match(/^\[(ti|ar|al|offset|by):(.*)\]$/i);
    if (metaMatch) {
      const tag = metaMatch[1].toLowerCase();
      const val = metaMatch[2].trim();
      if (tag === 'ti') metadata.title = val;
      else if (tag === 'ar') metadata.artist = val;
      else if (tag === 'al') metadata.album = val;
      else if (tag === 'offset') {
        const parsedOffset = parseInt(val, 10);
        if (!isNaN(parsedOffset)) metadata.offsetMs = parsedOffset;
      }
      continue;
    }

    // Match leading timestamps: e.g. [00:12.30][00:15.20] Lyric text
    const tsRegex = /\[(\d{1,2}:\d{2}(?:\.\d{1,3})?)\]/g;
    const matches = Array.from(trimmed.matchAll(tsRegex));

    if (matches.length > 0) {
      // Find the end of the last leading timestamp
      const lastMatch = matches[matches.length - 1];
      const textStartIndex = (lastMatch.index ?? 0) + lastMatch[0].length;
      const textPart = trimmed.substring(textStartIndex).trim();

      for (const m of matches) {
        const timeSec = parseTimestampToSeconds(m[1]);
        if (timeSec !== null) {
          parsedLineEntries.push({
            timeSec,
            rawText: textPart,
          });
        }
      }
    }
  }

  // Sort chronologically by start timestamp
  parsedLineEntries.sort((a, b) => a.timeSec - b.timeSec);

  // Apply metadata offset if present (in milliseconds, positive or negative)
  const offsetSeconds = (metadata.offsetMs ?? 0) / 1000;

  const resultLines: LyricLine[] = [];

  for (let i = 0; i < parsedLineEntries.length; i++) {
    const entry = parsedLineEntries[i];
    const startTime = Math.max(0, entry.timeSec + offsetSeconds);

    // Look ahead to next line's start time for endTime inference
    let endTime: number;
    if (i < parsedLineEntries.length - 1) {
      const nextStartTime = Math.max(0, parsedLineEntries[i + 1].timeSec + offsetSeconds);
      // End time is either the next line's start time, or capped by max hold duration if there's a long gap
      endTime = Math.min(nextStartTime, startTime + defaultMaxHoldSec);
      if (endTime <= startTime) {
        endTime = startTime + 0.1; // minimum fallback if lines have identical timestamps
      }
    } else {
      endTime = startTime + Math.min(defaultMaxHoldSec, 3.5);
    }

    // Check for enhanced word-level timestamps inside rawText:
    // Format A: word<00:12.30> word<00:13.10>
    // Format B: [00:12.30] word [00:12.80] word
    const words: Word[] = [];
    const wordPattern = /([^\s<\[]+)(?:<(\d{1,2}:\d{2}(?:\.\d{1,3})?)>|\[(\d{1,2}:\d{2}(?:\.\d{1,3})?)\])?/g;
    const wordMatches = Array.from(entry.rawText.matchAll(wordPattern));

    let hasWordTimestamps = false;
    let currentWordStart = startTime;
    let inParentheses = false;

    for (let wIdx = 0; wIdx < wordMatches.length; wIdx++) {
      const wm = wordMatches[wIdx];
      let wordText = wm[1].trim();
      if (!wordText) continue;

      if (/^[\(\[\{]/.test(wordText)) inParentheses = true;
      let type: LyricType = inParentheses ? 'SUPPORTING' : 'PRIMARY';
      if (/[\)\]\}][.,;?!]*$/.test(wordText)) inParentheses = false;

      const innerTs = wm[2] || wm[3];
      if (innerTs) {
        const parsedInnerSec = parseTimestampToSeconds(innerTs);
        if (parsedInnerSec !== null) {
          hasWordTimestamps = true;
          isEnhanced = true;
          const adjustedInner = Math.max(0, parsedInnerSec + offsetSeconds);
          words.push({
            id: `word-${i}-${wIdx}`,
            text: wordText,
            startTime: currentWordStart,
            endTime: adjustedInner,
            confidence: 1.0,
            type
          });
          currentWordStart = adjustedInner;
          continue;
        }
      }

      // Default word timing without explicit tag
      words.push({
        id: `word-${i}-${wIdx}`,
        text: wordText,
        startTime: currentWordStart,
        endTime: endTime,
        confidence: 0.9,
        type
      });
    }

    if (words.length > 0) {
      let currentGroupWords: Word[] = [];
      let currentType: LyricType = words[0].type || 'PRIMARY';

      const pushGroup = () => {
        if (currentGroupWords.length === 0) return;
        const text = currentGroupWords.map(w => w.text).join(' ');
        let grpStart = currentGroupWords[0].startTime;
        let grpEnd = currentGroupWords[currentGroupWords.length - 1].endTime;

        if (!hasWordTimestamps) {
          // Proportionally distribute the total line duration if no word timestamps exist
          const totalWords = words.length;
          const groupWordCount = currentGroupWords.length;
          const startIndex = words.indexOf(currentGroupWords[0]);
          const totalDuration = endTime - startTime;
          grpStart = startTime + (startIndex / totalWords) * totalDuration;
          grpEnd = grpStart + (groupWordCount / totalWords) * totalDuration;
        }
        
        let finalText = text
          .replace(/\(\s+/g, '(')
          .replace(/\s+\)/g, ')')
          .replace(/\[\s+/g, '[')
          .replace(/\s+\]/g, ']')
          .replace(/\{\s+/g, '{')
          .replace(/\s+\}/g, '}')
          .replace(/\s+/g, ' ')
          .trim();

        if (finalText.length > 0) {
          resultLines.push({
            id: `line-${i + 1}-${Math.round(grpStart * 100)}-${resultLines.length}`,
            text: finalText,
            startTime: grpStart,
            endTime: grpEnd,
            words: hasWordTimestamps ? currentGroupWords : undefined,
            confidence: 1.0,
            source: hasWordTimestamps ? 'SOURCE_ENHANCED_LRC' : 'SOURCE_LRC',
            customStyleSeed: (i * 17 + 23 + resultLines.length) % 100,
            type: currentType,
          });
        }
        currentGroupWords = [];
      };

      for (const w of words) {
        if (w.type !== currentType) {
          pushGroup();
          currentType = w.type || 'PRIMARY';
        }
        currentGroupWords.push(w);
      }
      pushGroup();
    } else {
      let finalCleanText = entry.rawText.replace(/<[^>]+>|\[[^\]]+\]/g, '').trim();
      if (finalCleanText.length > 0) {
        let type: LyricType = 'PRIMARY';
        if (/^[\(\[\{].*[\)\]\}][.,;?!]*$/.test(finalCleanText)) {
          type = 'SUPPORTING';
        }

        finalCleanText = finalCleanText
          .replace(/\(\s+/g, '(')
          .replace(/\s+\)/g, ')')
          .replace(/\[\s+/g, '[')
          .replace(/\s+\]/g, ']')
          .replace(/\{\s+/g, '{')
          .replace(/\s+\}/g, '}')
          .replace(/\s+/g, ' ')
          .trim();

        resultLines.push({
          id: `line-${i + 1}-${Math.round(startTime * 100)}`,
          text: finalCleanText,
          startTime,
          endTime,
          words: undefined,
          confidence: 1.0,
          source: 'SOURCE_LRC',
          customStyleSeed: (i * 17 + 23) % 100,
          type,
        });
      }
    }
  }

  const timingSource: TimingSource = isEnhanced
    ? 'SOURCE_ENHANCED_LRC'
    : resultLines.length > 0
    ? 'SOURCE_LRC'
    : 'SOURCE_UNKNOWN';

  return {
    lines: resultLines,
    metadata,
    isEnhanced,
    timingSource,
  };
}
