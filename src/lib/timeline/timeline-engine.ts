import type { LyricLine } from '../../types/lyrics';

/**
 * Timeline Engine
 * Deterministic calculations for line timing, offsets, splitting, merging, and active frame inspection.
 */

export function sortLinesChronologically(lines: LyricLine[]): LyricLine[] {
  return [...lines].sort((a, b) => {
    if (a.startTime === null && b.startTime === null) return 0;
    if (a.startTime === null) return 1;
    if (b.startTime === null) return -1;
    return a.startTime - b.startTime;
  });
}

export function applyGlobalOffset(lines: LyricLine[], offsetMs: number): LyricLine[] {
  const deltaSec = offsetMs / 1000;
  return lines.map((line) => {
    if (line.startTime === null || line.endTime === null) return line;
    const newStart = Math.max(0, Number((line.startTime + deltaSec).toFixed(3)));
    const newEnd = Math.max(newStart + 0.1, Number((line.endTime + deltaSec).toFixed(3)));
    return {
      ...line,
      startTime: newStart,
      endTime: newEnd,
      words: line.words?.map((w) => ({
        ...w,
        startTime: Math.max(0, Number((w.startTime + deltaSec).toFixed(3))),
        endTime: Math.max(0, Number((w.endTime + deltaSec).toFixed(3))),
      })),
      source: line.source === 'SOURCE_LRC' || line.source === 'SOURCE_ENHANCED_LRC' ? line.source : 'SOURCE_MANUAL',
    };
  });
}

export function nudgeLine(lines: LyricLine[], lineId: string, deltaMs: number): LyricLine[] {
  const deltaSec = deltaMs / 1000;
  const updated: LyricLine[] = lines.map((line) => {
    if (line.id !== lineId || line.startTime === null || line.endTime === null) return line;
    const newStart = Math.max(0, Number((line.startTime + deltaSec).toFixed(3)));
    const duration = line.endTime - line.startTime;
    const newEnd = Number((newStart + duration).toFixed(3));
    return {
      ...line,
      startTime: newStart,
      endTime: newEnd,
      words: line.words?.map((w) => ({
        ...w,
        startTime: Math.max(0, Number((w.startTime + deltaSec).toFixed(3))),
        endTime: Math.max(0, Number((w.endTime + deltaSec).toFixed(3))),
      })),
      source: 'SOURCE_MANUAL' as const,
    };
  });
  return sortLinesChronologically(updated);
}

export function updateLineTiming(
  lines: LyricLine[],
  lineId: string,
  newStartSec: number,
  newEndSec: number
): LyricLine[] {
  if (newEndSec <= newStartSec) {
    newEndSec = newStartSec + 0.2;
  }
  const updated: LyricLine[] = lines.map((line) => {
    if (line.id !== lineId) return line;
    return {
      ...line,
      startTime: Math.max(0, Number(newStartSec.toFixed(3))),
      endTime: Math.max(0.1, Number(newEndSec.toFixed(3))),
      source: 'SOURCE_MANUAL' as const,
    };
  });
  return sortLinesChronologically(updated);
}

export function splitLine(
  lines: LyricLine[],
  lineId: string,
  wordSplitIndex?: number
): LyricLine[] {
  const targetIndex = lines.findIndex((l) => l.id === lineId);
  if (targetIndex === -1) return lines;
  const target = lines[targetIndex];
  if (!target.text || target.startTime === null || target.endTime === null) return lines;

  const words = target.text.split(' ');
  if (words.length <= 1) return lines;

  const mid = wordSplitIndex ?? Math.ceil(words.length / 2);
  const text1 = words.slice(0, mid).join(' ');
  const text2 = words.slice(mid).join(' ');

  const totalDuration = target.endTime - target.startTime;
  const splitRatio = mid / words.length;
  const splitTime = Number((target.startTime + totalDuration * splitRatio).toFixed(3));

  const line1: LyricLine = {
    ...target,
    id: `${target.id}-part1`,
    text: text1,
    endTime: splitTime,
    source: 'SOURCE_MANUAL',
  };

  const line2: LyricLine = {
    ...target,
    id: `${target.id}-part2`,
    text: text2,
    startTime: splitTime,
    source: 'SOURCE_MANUAL',
    customStyleSeed: (target.customStyleSeed ? target.customStyleSeed + 29 : 53) % 100,
  };

  const nextLines = [...lines];
  nextLines.splice(targetIndex, 1, line1, line2);
  return nextLines;
}

export function mergeLines(lines: LyricLine[], lineId1: string, lineId2: string): LyricLine[] {
  const idx1 = lines.findIndex((l) => l.id === lineId1);
  const idx2 = lines.findIndex((l) => l.id === lineId2);
  if (idx1 === -1 || idx2 === -1) return lines;

  const first = lines[Math.min(idx1, idx2)];
  const second = lines[Math.max(idx1, idx2)];

  const mergedLine: LyricLine = {
    id: `${first.id}-merged`,
    text: `${first.text} ${second.text}`,
    startTime: first.startTime,
    endTime: second.endTime ?? first.endTime,
    source: 'SOURCE_MANUAL',
    confidence: Math.min(first.confidence ?? 1.0, second.confidence ?? 1.0),
    customStyleSeed: first.customStyleSeed,
  };

  const nextLines = lines.filter((l) => l.id !== first.id && l.id !== second.id);
  nextLines.splice(Math.min(idx1, idx2), 0, mergedLine);
  return sortLinesChronologically(nextLines);
}

export function getTotalDuration(lines: LyricLine[], audioDuration?: number | null): number {
  let maxLyricTime = 0;
  for (const l of lines) {
    if (l.endTime !== null && l.endTime > maxLyricTime) {
      maxLyricTime = l.endTime;
    }
  }
  if (audioDuration && audioDuration > 0) {
    return Math.max(maxLyricTime, audioDuration);
  }
  return maxLyricTime > 0 ? maxLyricTime + 1.5 : 10;
}

export function getActiveLinesAt(
  lines: LyricLine[],
  currentTime: number,
  _maxLines: number = 2
): {
  currentLine: LyricLine | null;
  previousLine: LyricLine | null;
  nextLine: LyricLine | null;
  currentIndex: number;
} {
  let currentIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startTime === null || l.endTime === null) continue;
    if (currentTime >= l.startTime && currentTime < l.endTime) {
      currentIdx = i;
      break;
    }
  }

  // If between lines, find nearest previous or upcoming
  if (currentIdx === -1) {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.startTime !== null && l.startTime > currentTime) {
        // We are before line i
        const prev = i > 0 ? lines[i - 1] : null;
        return {
          currentLine: null,
          previousLine: prev,
          nextLine: l,
          currentIndex: -1,
        };
      }
    }
  }

  if (currentIdx !== -1) {
    return {
      currentLine: lines[currentIdx],
      previousLine: currentIdx > 0 ? lines[currentIdx - 1] : null,
      nextLine: currentIdx < lines.length - 1 ? lines[currentIdx + 1] : null,
      currentIndex: currentIdx,
    };
  }

  return {
    currentLine: null,
    previousLine: lines.length > 0 ? lines[lines.length - 1] : null,
    nextLine: null,
    currentIndex: -1,
  };
}
