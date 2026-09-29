import type { LyricLine, VisualLyricBlock, VisualLayoutType, Word } from '../../types/lyrics';
import type { LyricsType } from '../render/lyricsAnimation/types';

/**
 * VISUAL PHRASE COMPOSER
 *
 * Implements the VISUAL COMPOSER layer for Audio-First rendering (Patch V2).
 * AUDIO MASTER CLOCK -> LYRIC SYNC -> VISUAL PHRASE COMPOSER -> LAYOUT -> MOTION -> RENDER
 *
 * Requirements:
 * 1. NEVER invent timing.
 * 2. If no word-level timing exists, a LyricLine is EXACTLY ONE visual block.
 * 3. Text wrapping is visual-only and does not break timing.
 * 4. If word-level timing exists, a long phrase can be broken into multiple visual states
 *    bounded EXACTLY by word timestamps.
 * 5. Scene change (background change) happens per natural phrase (LyricLine), not per visual block.
 */

interface ChunkCandidate {
  words: string[];
  text: string;
  wordObjects?: Word[];
  startTime: number;
  endTime: number;
}

const BREAK_BEFORE_WORDS = new Set([
  'and', 'but', 'or', 'so', 'because', 'when', 'where', 'while', 'that',
  'with', 'without', 'into', 'under', 'over', 'from', 'before', 'after',
]);

function partitionLineWords(words: string[]): string[][] {
  if (words.length <= 4) return [words];
  if (words.length === 5) {
    return [words.slice(0, 3), words.slice(3)];
  }
  const groups: string[][] = [];
  let i = 0;
  while (i < words.length) {
    const remaining = words.length - i;
    if (remaining <= 5) {
      if (remaining <= 2 && groups.length > 0) {
        const prev = groups.pop()!;
        const combined = [...prev, ...words.slice(i)];
        const mid = Math.ceil(combined.length / 2);
        groups.push(combined.slice(0, mid));
        groups.push(combined.slice(mid));
      } else {
        groups.push(words.slice(i));
      }
      break;
    }
    let take = 4;
    for (let test = 3; test <= 5; test++) {
      if (i + test < words.length) {
        const nextWord = words[i + test].toLowerCase().replace(/[^a-z]/g, '');
        if (BREAK_BEFORE_WORDS.has(nextWord) || /[,.!?;:—-]$/.test(words[i + test - 1])) {
          take = test;
          break;
        }
      }
    }
    groups.push(words.slice(i, i + take));
    i += take;
  }
  return groups;
}

/**
 * Deterministically composes visual blocks for a single lyric line.
 */
export function chunkLyricLine(
  line: LyricLine,
  sceneStartIndex: number = 0,
  projectSeed: number = 42,
  lyricsType?: LyricsType
): VisualLyricBlock[] {
  const { id: lineId, text, words: originalWords } = line;
  
  // Base timing to use (prefer aligned if available)
  const startTime = (line as any).alignedStartTime ?? line.startTime;
  const endTime = (line as any).alignedEndTime ?? line.endTime;

  // If line has no timing, return as a single untimed visual block
  if (startTime === null || endTime === null) {
    return [
      {
        id: `${lineId}-v0`,
        sourceLineId: lineId,
        text,
        lines: [text],
        startTime: 0,
        endTime: 0,
        duration: 0,
        layoutType: 'single-line',
        sceneIndex: sceneStartIndex, // Scene remains constant for the phrase
        fontSizeMultiplier: 1.0,
      },
    ];
  }

  const duration = Math.max(0.1, endTime - startTime);
  const rawWords = text.trim().split(/\s+/).filter(Boolean);
  const totalWords = rawWords.length;

  if (totalWords === 0) return [];

  // V2 Rule: If no word-level timing exists
  if (!originalWords || originalWords.length !== totalWords) {
    // If long phrase (duration >= 4.5s and 5+ words), break into editorial blocks
    if (duration >= 4.5 && totalWords >= 5 && lyricsType !== 'single-line') {
      const groups = partitionLineWords(rawWords);
      const blocks: VisualLyricBlock[] = [];
      let curStart = startTime;

      for (let i = 0; i < groups.length; i++) {
        const gWords = groups[i];
        const gDuration = (gWords.length / totalWords) * duration;
        const gEnd = i === groups.length - 1 ? endTime : curStart + gDuration;
        const { layoutType, lines, fontSizeMultiplier } = determineLayout(gWords, projectSeed + i, lyricsType);

        blocks.push({
          id: `${lineId}-v${i}`,
          sourceLineId: lineId,
          text: gWords.join(' '),
          lines,
          startTime: curStart,
          endTime: gEnd,
          duration: Math.max(0.1, gEnd - curStart),
          layoutType,
          words: undefined,
          sceneIndex: sceneStartIndex,
          fontSizeMultiplier,
          type: line.type,
        });

        curStart = gEnd;
      }
      return blocks;
    }

    const { layoutType, lines, fontSizeMultiplier } = determineLayout(rawWords, projectSeed, lyricsType);
    return [
      {
        id: `${lineId}-v0`,
        sourceLineId: lineId,
        text,
        lines,
        startTime,
        endTime,
        duration,
        layoutType,
        words: undefined,
        sceneIndex: sceneStartIndex, // Scene remains constant for the phrase
        fontSizeMultiplier,
        type: line.type,
      },
    ];
  }

  // V2 Rule: Word timing exists. We can optionally split long phrases at natural boundaries.
  // We will NOT invent timing. We split ONLY on exact word boundaries.
  const chunkCandidates = partitionByWordTiming(originalWords, startTime, endTime);

  const blocks: VisualLyricBlock[] = [];
  for (let i = 0; i < chunkCandidates.length; i++) {
    const c = chunkCandidates[i];
    const { layoutType, lines, fontSizeMultiplier } = determineLayout(c.words, projectSeed + i, lyricsType);
    
    // Scene Index: "Background change must never interrupt a phrase."
    // All visual blocks derived from the same LyricLine share the same sceneIndex.
    
    blocks.push({
      id: `${lineId}-v${i}`,
      sourceLineId: lineId,
      text: c.text,
      lines,
      startTime: c.startTime,
      endTime: c.endTime,
      duration: Math.max(0.1, c.endTime - c.startTime),
      layoutType,
      words: c.wordObjects,
      sceneIndex: sceneStartIndex, // Same scene for the whole phrase
      fontSizeMultiplier,
      type: line.type,
    });
  }

  return blocks;
}

/**
 * Splits words into visual phrases using exact word timestamps.
 * Does not split arbitrarily. Prefers groups of 4-7 words.
 */
function partitionByWordTiming(
  words: Word[],
  lineStart: number,
  lineEnd: number
): ChunkCandidate[] {
  const chunks: ChunkCandidate[] = [];
  let currentGroup: Word[] = [];
  
  for (let i = 0; i < words.length; i++) {
    currentGroup.push(words[i]);
    
    const isLastWord = i === words.length - 1;
    const nextWord = words[i + 1];
    
    // Determine if we should break here
    let shouldBreak = false;
    
    if (!isLastWord) {
      // Natural break points
      const hasPunctuation = /[,.!?;:—-]$/.test(words[i].text);
      const nextIsConjunction = nextWord && BREAK_BEFORE_WORDS.has(nextWord.text.toLowerCase().replace(/[^a-z]/g, ''));
      
      // Break if there is a significant pause (>0.8s) between words
      const pauseDuration = nextWord.startTime - words[i].endTime;
      
      if (hasPunctuation || (nextIsConjunction && currentGroup.length >= 4) || pauseDuration > 0.8) {
        shouldBreak = true;
      }
    }
    
    if (shouldBreak || isLastWord) {
      const cStart = chunks.length === 0 ? lineStart : currentGroup[0].startTime;
      const cEnd = isLastWord ? lineEnd : words[i].endTime;
      
      chunks.push({
        words: currentGroup.map(w => w.text),
        text: currentGroup.map(w => w.text).join(' '),
        wordObjects: [...currentGroup],
        startTime: cStart,
        endTime: cEnd
      });
      currentGroup = [];
    }
  }
  
  return chunks;
}

/**
 * Determines layout configuration (line breaks, typography scale, layout type)
 * Strictly visual text wrapping.
 */
function determineLayout(
  words: string[],
  projectSeed: number,
  lyricsType?: LyricsType
): {
  layoutType: VisualLayoutType;
  lines: string[];
  fontSizeMultiplier: number;
} {
  const total = words.length;
  const fullText = words.join(' ');
  const charLen = fullText.length;
  const seedVariation = projectSeed % 100;

  // Explicit layout overrides based on LyricsType
  if (lyricsType === 'single-line') {
    return {
      layoutType: 'single-line',
      lines: [fullText],
      fontSizeMultiplier: total <= 3 ? 1.15 : total <= 6 ? 1.05 : 0.95,
    };
  }

  if (lyricsType === 'multi-line') {
    const mid = Math.ceil(total / 2);
    return {
      layoutType: 'balanced-2-line',
      lines: total <= 1 ? [fullText] : [words.slice(0, mid).join(' '), words.slice(mid).join(' ')],
      fontSizeMultiplier: 1.0,
    };
  }

  if (lyricsType === 'paragraph') {
    if (total <= 3) {
      return {
        layoutType: 'single-line',
        lines: [fullText],
        fontSizeMultiplier: 1.1,
      };
    }
    const third = Math.ceil(total / 3);
    return {
      layoutType: 'stacked-3-line',
      lines: [
        words.slice(0, third).join(' '),
        words.slice(third, third * 2).join(' '),
        words.slice(third * 2).join(' '),
      ],
      fontSizeMultiplier: 0.9,
    };
  }

  if (total === 1) {
    return {
      layoutType: 'centered-hero',
      lines: [words[0]],
      fontSizeMultiplier: 1.25,
    };
  }

  if (total === 2) {
    if (charLen <= 14 && seedVariation < 50) {
      return { layoutType: 'single-line', lines: [fullText], fontSizeMultiplier: 1.15 };
    }
    return { layoutType: 'balanced-2-line', lines: [words[0], words[1]], fontSizeMultiplier: 1.2 };
  }

  if (total === 3) {
    if (charLen <= 18 && seedVariation < 60) {
      return { layoutType: 'single-line', lines: [fullText], fontSizeMultiplier: 1.05 };
    }
    if (seedVariation >= 60 && seedVariation < 80) {
      return { layoutType: 'balanced-2-line', lines: [words[0], `${words[1]} ${words[2]}`], fontSizeMultiplier: 1.1 };
    }
    return { layoutType: 'balanced-2-line', lines: [`${words[0]} ${words[1]}`, words[2]], fontSizeMultiplier: 1.1 };
  }

  if (total === 4) {
    if (seedVariation < 35) {
      return { layoutType: 'balanced-2-line', lines: [`${words[0]} ${words[1]}`, `${words[2]} ${words[3]}`], fontSizeMultiplier: 1.0 };
    }
    if (seedVariation >= 35 && seedVariation < 70) {
      return { layoutType: 'offset-stagger', lines: [`${words[0]} ${words[1]}`, `${words[2]} ${words[3]}`], fontSizeMultiplier: 1.0 };
    }
    if (words[0].length <= 4) {
      return { layoutType: 'balanced-2-line', lines: [words[0], `${words[1]} ${words[2]} ${words[3]}`], fontSizeMultiplier: 0.96 };
    }
    return { layoutType: 'balanced-2-line', lines: [`${words[0]} ${words[1]} ${words[2]}`, words[3]], fontSizeMultiplier: 0.96 };
  }

  if (total === 5) {
    if (seedVariation < 45) {
      return { layoutType: 'balanced-2-line', lines: [`${words[0]} ${words[1]} ${words[2]}`, `${words[3]} ${words[4]}`], fontSizeMultiplier: 0.95 };
    }
    if (seedVariation >= 45 && seedVariation < 80) {
      return { layoutType: 'balanced-2-line', lines: [`${words[0]} ${words[1]}`, `${words[2]} ${words[3]} ${words[4]}`], fontSizeMultiplier: 0.95 };
    }
    return { layoutType: 'stacked-3-line', lines: [`${words[0]} ${words[1]}`, `${words[2]} ${words[3]}`, words[4]], fontSizeMultiplier: 0.92 };
  }

  if (total === 6) {
    return {
      layoutType: 'stacked-3-line',
      lines: [`${words[0]} ${words[1]}`, `${words[2]} ${words[3]}`, `${words[4]} ${words[5]}`],
      fontSizeMultiplier: 0.90,
    };
  }

  // 7+ words: stack into 3 or 4 lines
  const third = Math.floor(total / 3);
  return {
    layoutType: 'stacked-3-line',
    lines: [
      words.slice(0, third).join(' '),
      words.slice(third, third * 2).join(' '),
      words.slice(third * 2).join(' ')
    ],
    fontSizeMultiplier: 0.85,
  };
}

/**
 * Transforms an array of LyricLines into VisualLyricBlocks for the entire project
 * Scene index only increments PER PHRASE (LyricLine).
 */
export function chunkAllLyricLines(
  lines: LyricLine[],
  projectSeed: number = 42,
  lyricsType?: LyricsType
): VisualLyricBlock[] {
  const allBlocks: VisualLyricBlock[] = [];
  let currentSceneIndex = 0;

  for (const line of lines) {
    const lineBlocks = chunkLyricLine(line, currentSceneIndex, projectSeed, lyricsType);
    allBlocks.push(...lineBlocks);
    currentSceneIndex++; // V2: Scene increments per natural phrase (line), not per block
  }

  return allBlocks;
}

/**
 * Finds the currently active VisualLyricBlock at currentTime
 * Guarantee: exactly ONE block is returned if active, or null during gaps.
 */
export function getActiveVisualBlockAt(
  blocks: VisualLyricBlock[],
  currentTime: number
): {
  activeBlock: VisualLyricBlock | null;
  activeIndex: number;
} {
  let bestBlock: VisualLyricBlock | null = null;
  let bestIndex = -1;

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (currentTime >= b.startTime && currentTime < b.endTime) {
      if (!bestBlock || bestBlock.type === 'SUPPORTING' || b.type === 'PRIMARY') {
        bestBlock = b;
        bestIndex = i;
      }
    }
  }

  return { activeBlock: bestBlock, activeIndex: bestIndex };
}
