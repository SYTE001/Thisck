import type { VisualLyricBlock } from '../../../../types/lyrics';
import type { LyricsAnimationState, LineAnimationState } from '../animationConfig';
import type { MotionFrameState } from '../../../motion/adaptive-motion';

export function calculateCinematicState(
  _block: VisualLyricBlock, 
  _currentTime: number, 
  motion: MotionFrameState,
  config: any = {}
): LyricsAnimationState {
  const pp = motion.phaseProgress;
  const phase = motion.phase;

  const line: LineAnimationState = {
    opacity: motion.opacity,
    scale: 1,
    translateY: 0,
    blur: 0
  };

  const blurAmount = config.blurAmount ?? 4;
  const verticalMovement = config.verticalMovement ?? 10;

  if (phase === 'enter') {
    // translateY verticalMovement -> 0, scale 0.98 -> 1, blur blurAmount -> 0
    line.translateY = (1 - pp) * verticalMovement;
    line.scale = 0.98 + (0.02 * pp);
    line.blur = (1 - pp) * blurAmount;
  } else if (phase === 'exit') {
    // translateY 0 -> -verticalMovement * 0.8, blur 0 -> blurAmount * 0.75
    line.translateY = -(verticalMovement * 0.8) * pp;
    line.scale = 1.0;
    line.blur = pp * (blurAmount * 0.75);
  } else if (phase === 'before' || phase === 'after') {
    line.opacity = 0;
  } else {
    // hold
    line.scale = 1.0;
  }

  // Cinematic is line-level only, no word-level transforms
  return { line, words: [] };
}
