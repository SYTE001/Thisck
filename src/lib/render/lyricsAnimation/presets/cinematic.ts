import type { VisualLyricBlock } from '../../../../types/lyrics';
import type { LyricsAnimationState, LineAnimationState } from '../animationConfig';
import type { MotionFrameState } from '../../../motion/adaptive-motion';

export function calculateCinematicState(
  _block: VisualLyricBlock, 
  _currentTime: number, 
  motion: MotionFrameState
): LyricsAnimationState {
  const pp = motion.phaseProgress;
  const phase = motion.phase;

  const line: LineAnimationState = {
    opacity: motion.opacity,
    scale: 1,
    translateY: 0,
    blur: 0
  };

  if (phase === 'enter') {
    // translateY 10px -> 0, scale 0.98 -> 1, blur 4px -> 0
    line.translateY = (1 - pp) * 10;
    line.scale = 0.98 + (0.02 * pp);
    line.blur = (1 - pp) * 4;
  } else if (phase === 'exit') {
    // translateY 0 -> -8px, blur 0 -> 3px
    line.translateY = -8 * pp;
    line.scale = 1.0;
    line.blur = pp * 3;
  } else if (phase === 'before' || phase === 'after') {
    line.opacity = 0;
  } else {
    // hold
    line.scale = 1.0;
  }

  // Cinematic is line-level only, no word-level transforms
  return { line, words: [] };
}
