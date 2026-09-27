import type { VisualLyricBlock, Word } from '../../../../types/lyrics';
import type { LyricsAnimationState, WordAnimationState, LineAnimationState } from '../animationConfig';
import type { MotionFrameState } from '../../../motion/adaptive-motion';

/**
 * Returns words for the visual block.
 * If word-level timestamps exist, uses them.
 * If word-level timestamps do not exist, distributes the words naturally across the lyric line duration.
 *
 * Example:
 * "we are falling tonight"
 * 0.00 -> "we"
 * 0.25 -> "are"
 * 0.50 -> "falling"
 * 0.80 -> "tonight"
 */
export function getDistributedWords(block: VisualLyricBlock): Word[] {
  if (block.words && block.words.length > 0) {
    return block.words;
  }

  const rawWords = block.text.trim().split(/\s+/).filter(Boolean);
  if (rawWords.length === 0) return [];

  const duration = Math.max(0.1, block.endTime - block.startTime);
  if (rawWords.length === 1) {
    return [
      {
        id: `${block.id}-w0`,
        text: rawWords[0],
        startTime: block.startTime,
        endTime: block.endTime,
      },
    ];
  }

  // Target revealing all words by ~80% of the line duration (like the 0.00, 0.25, 0.50, 0.80 pattern)
  // This leaves the remaining ~20% of duration for the complete phrase to be read together before transition.
  const revealDuration = Math.min(duration * 0.80, Math.max(0.1, duration - 0.35));

  // Weight words by length with a baseline (so short words still get a natural beat)
  const weights = rawWords.map((w) => Math.max(2, Math.min(8, w.length)));
  const weightsExceptLast = weights.slice(0, -1);
  const sumWeights = weightsExceptLast.reduce((acc, val) => acc + val, 0) || 1;

  let currentStart = block.startTime;
  const words: Word[] = [];

  for (let i = 0; i < rawWords.length; i++) {
    const text = rawWords[i];
    const wStart = currentStart;
    let wEnd = block.endTime;

    if (i < rawWords.length - 1) {
      const step = (weights[i] / sumWeights) * revealDuration;
      currentStart += step;
      wEnd = currentStart;
    }

    words.push({
      id: `${block.id}-w${i}`,
      text,
      startTime: wStart,
      endTime: wEnd,
    });
  }

  return words;
}

/**
 * Smooth cubic ease-out: monotonic, decelerates gently, zero bounce or overshoot.
 */
function easeOutCubic(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - clamped, 3);
}

/**
 * WORD-BY-WORD Lyrics Text Animation Preset
 *
 * Requirements:
 * - The lyric line appears word-by-word from left to right.
 * - Each word starts slightly smaller (0.90) and transparent (0).
 * - When its timing begins, the word smoothly becomes visible and reaches normal size (1.00).
 * - translateY: 6px -> 0
 * - duration: approx 180-250ms (default 210ms)
 * - smooth ease-out (no bounce, no rotation, no excessive blur)
 * - Previously displayed words remain visible.
 * - The active word can receive a subtle emphasis (e.g. scale 1.03).
 * - Never animate the entire line as one block.
 */
export function calculateWordByWordState(
  block: VisualLyricBlock,
  currentTime: number,
  motion: MotionFrameState,
  config: any = {}
): LyricsAnimationState {
  // Never animate the entire line as one block
  const line: LineAnimationState = {
    opacity: 1,
    scale: 1,
    translateY: 0,
    blur: 0,
  };

  const wordsList = getDistributedWords(block);
  if (wordsList.length === 0) {
    line.opacity = motion.opacity;
    line.scale = motion.scale;
    line.translateY = motion.translateY;
    return { line, words: [] };
  }

  // Animation duration: 180–250ms (default 210ms / 0.21s)
  const enterDuration = config.enterDuration ? config.enterDuration / 1000 : 0.21;
  const intensity = config.intensity ?? 1.0;
  const targetScale = config.activeWordScale ?? 1.03;

  const words: WordAnimationState[] = wordsList.map((w) => {
    // Before line startTime or after line endTime: strictly 0 opacity
    if (currentTime < block.startTime || currentTime >= block.endTime) {
      return { opacity: 0, scale: 0.90, translateY: 6 * intensity };
    }

    // Word timing has not arrived yet
    if (currentTime < w.startTime) {
      return { opacity: 0, scale: 0.90, translateY: 6 * intensity };
    }

    // Word has arrived!
    const elapsed = currentTime - w.startTime;
    const enterProgress = Math.min(1, elapsed / enterDuration);
    const eased = easeOutCubic(enterProgress);

    // Incoming transition: opacity 0 -> 1, scale 0.90 -> 1.00, translateY 6px -> 0px
    let opacity = eased;
    let scale = 0.90 + 0.10 * eased;
    let translateY = 6 * (1 - eased) * intensity;

    // Previously revealed words remain visible (when enterProgress === 1, opacity is 1, scale is 1, translateY is 0)

    // Active word subtle emphasis
    const isActive = currentTime >= w.startTime && currentTime < w.endTime;
    if (isActive) {
      const wDuration = Math.max(0.12, w.endTime - w.startTime);
      const activeProgress = Math.min(1, elapsed / wDuration);
      const emphasis = Math.sin(activeProgress * Math.PI) * (targetScale - 1.0) * intensity;
      scale += emphasis;
    }

    // Line exit: when the whole block is exiting, fade out words gracefully
    if (motion.phase === 'exit') {
      opacity *= motion.opacity;
    }

    return {
      opacity: Math.max(0, Math.min(1, opacity)),
      scale,
      translateY,
    };
  });

  return { line, words };
}
