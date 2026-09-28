import type { VisualLyricBlock, Word } from '../../../../types/lyrics';
import type { LyricsAnimationState, WordAnimationState, LineAnimationState } from '../animationConfig';
import type { MotionFrameState } from '../../../motion/adaptive-motion';

/**
 * Returns words for the visual block.
 * If word-level timestamps exist, uses them.
 * If word-level timestamps do not exist, distributes the words naturally across the lyric line duration.
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

  // Target revealing all words by ~80% of the line duration
  const revealDuration = Math.min(duration * 0.80, Math.max(0.1, duration - 0.35));

  // Weight words by length with a baseline
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
 * WORD-BY-WORD Lyrics Text Animation Preset (Refactored for Stability)
 *
 * Requirements:
 * - Solid, stable, clean, typography-focused.
 * - Posisi teks tidak boleh ikut bergeser atau "dancing" hanya karena animasi lyrics.
 * - Words appear sequentially on their fixed positions.
 * - Default behavior is completely stable with zero unwanted movement.
 */
export function calculateWordByWordState(
  block: VisualLyricBlock,
  currentTime: number,
  motion: MotionFrameState,
  config: any = {}
): LyricsAnimationState {
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

  // Animation duration: 150–220ms (default 180ms)
  const enterDuration = config.enterDuration ? config.enterDuration / 1000 : 0.18;
  const verticalMovement = config.verticalMovement ?? 0; // Default 0: no dancing / shaking!
  const targetScale = config.activeWordScale ?? 1.0; // Default 1.0: no scaling wobble!

  const words: WordAnimationState[] = wordsList.map((w) => {
    // Before line startTime or after line endTime: strictly 0 opacity
    if (currentTime < block.startTime || currentTime >= block.endTime) {
      return { opacity: 0, scale: 1.0, translateY: verticalMovement };
    }

    // Word timing has not arrived yet
    if (currentTime < w.startTime) {
      return { opacity: 0, scale: 1.0, translateY: verticalMovement };
    }

    // Word has arrived!
    const elapsed = currentTime - w.startTime;
    const enterProgress = Math.min(1, elapsed / enterDuration);
    const eased = easeOutCubic(enterProgress);

    // Stable transition: opacity 0 -> 1 on fixed position
    let opacity = eased;
    let scale = 1.0;
    let translateY = verticalMovement * (1 - eased);

    // Optional active word scale if configured
    if (targetScale !== 1.0) {
      const isActive = currentTime >= w.startTime && currentTime < w.endTime;
      if (isActive) {
        const wDuration = Math.max(0.12, w.endTime - w.startTime);
        const activeProgress = Math.min(1, elapsed / wDuration);
        scale += Math.sin(activeProgress * Math.PI) * (targetScale - 1.0);
      }
    }

    // Line exit: fade out gracefully
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
