import type { VisualLyricBlock } from '../../../../types/lyrics';
import type { LyricsAnimationState, WordAnimationState, LineAnimationState } from '../animationConfig';
import { type MotionFrameState, easeEditorialEntrance, easeEditorialExit } from '../../../motion/adaptive-motion';

export function calculateKineticState(
  block: VisualLyricBlock, 
  currentTime: number, 
  motion: MotionFrameState
): LyricsAnimationState {
  const line: LineAnimationState = {
    opacity: 1, // Let word level handle opacity
    scale: 1,
    translateY: 0, // Words handle their own Y
    blur: 0
  };

  if (!block.words || block.words.length === 0) {
    // Fallback if no word timings
    line.opacity = motion.opacity;
    line.scale = motion.scale;
    line.translateY = motion.translateY;
    return { line, words: [] };
  }

  const staggerMs = 0.04; // 40ms stagger per word
  const enterDuration = 0.25;
  const exitDuration = 0.2;

  const words: WordAnimationState[] = block.words.map((w, idx) => {
    // Determine word-specific enter/exit timings based on block bounds but staggered
    const wordEnterStart = block.startTime + (idx * staggerMs);
    let opacity = 1;
    let scale = 1;
    let translateY = 0;

    // Enter
    if (currentTime < wordEnterStart + enterDuration) {
      const elapsed = Math.max(0, currentTime - wordEnterStart);
      const progress = Math.min(1, elapsed / enterDuration);
      const eased = easeEditorialEntrance(progress);
      
      opacity = eased;
      scale = 0.88 + (0.12 * eased);
      translateY = (1 - eased) * 12; // slight Y movement up
    }
    
    // Exit
    const wordExitStart = block.endTime - exitDuration - ((block.words!.length - 1 - idx) * staggerMs * 0.5);
    if (currentTime > wordExitStart) {
      const elapsed = Math.max(0, currentTime - wordExitStart);
      const progress = Math.min(1, elapsed / exitDuration);
      const eased = easeEditorialExit(progress);
      
      opacity = 1 - eased;
      scale = 1.0 - (0.04 * eased); // 1.00 -> 0.96
    }

    // Active Emphasis
    const isActive = idx === motion.activeWordIndex;
    if (isActive) {
      const wDuration = Math.max(0.1, (w.endTime || w.startTime + 0.3) - w.startTime);
      const wElapsed = currentTime - w.startTime;
      const wProgress = Math.max(0, Math.min(1, wElapsed / wDuration));
      
      // 1.00 -> 1.08 -> 1.00
      const emphasis = Math.sin(wProgress * Math.PI) * 0.08;
      // Add emphasis on top of current scale
      scale += emphasis;
    }

    // Bounds check to ensure 0 outside block
    if (currentTime < wordEnterStart) opacity = 0;
    if (currentTime > block.endTime) opacity = 0;

    return { opacity, scale, translateY };
  });

  return { line, words };
}
