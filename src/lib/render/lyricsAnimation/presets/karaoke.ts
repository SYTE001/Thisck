import type { VisualLyricBlock } from '../../../../types/lyrics';
import type { LyricsAnimationState, WordAnimationState, LineAnimationState } from '../animationConfig';
import type { MotionFrameState } from '../../../motion/adaptive-motion';

export function calculateKaraokeState(
  block: VisualLyricBlock, 
  currentTime: number, 
  motion: MotionFrameState
): LyricsAnimationState {
  const line: LineAnimationState = {
    opacity: motion.opacity,
    scale: 1, // Let word level handle emphasis if needed, but line uses block motion
    translateY: motion.translateY,
    blur: 0
  };

  // Graceful fallback to line-level
  if (!block.words || block.words.length === 0) {
    line.scale = motion.scale;
    return { line, words: [] };
  }

  const words: WordAnimationState[] = block.words.map((w, idx) => {
    let opacity = motion.opacity * 0.42;
    let scale = 1.0;

    const isActive = idx === motion.activeWordIndex;
    const isPast = idx < motion.activeWordIndex;
    
    if (isActive) {
      opacity = motion.opacity;
      const wDuration = Math.max(0.1, (w.endTime || w.startTime + 0.3) - w.startTime);
      const wElapsed = currentTime - w.startTime;
      const wProgress = Math.max(0, Math.min(1, wElapsed / wDuration));
      
      // Scale 1.00 -> 1.04 -> 1.00
      const emphasis = Math.sin(wProgress * Math.PI) * 0.04;
      scale = 1.0 + emphasis;
    } else if (isPast) {
      opacity = motion.opacity; // Keep past words fully lit like typical karaoke
    }

    return { opacity, scale, translateY: 0 };
  });

  return { line, words };
}
