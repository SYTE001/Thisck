import type { VisualLyricBlock } from '../../../types/lyrics';
import type { LyricsAnimationState } from './animationConfig';
import type { MotionFrameState } from '../../motion/adaptive-motion';
import { calculateKaraokeState } from './presets/karaoke';
import { calculateKineticState } from './presets/kinetic';
import { calculateCinematicState } from './presets/cinematic';
import { calculateTextAnimationState, type TextAnimationPreset } from '../text-animation';

export function getAnimationState(
  preset: TextAnimationPreset,
  block: VisualLyricBlock,
  currentTime: number,
  motion: MotionFrameState,
  config?: any
): LyricsAnimationState {
  switch (preset) {
    case 'karaoke':
      return calculateKaraokeState(block, currentTime, motion, config);
    case 'kinetic':
      return calculateKineticState(block, currentTime, motion, config);
    case 'cinematic':
      return calculateCinematicState(block, currentTime, motion, config);
    default: {
      // Fallback to legacy presets
      const legacyState = calculateTextAnimationState(block, currentTime, preset);
      return {
        line: {
          opacity: legacyState.opacity,
          scale: legacyState.scale,
          translateY: legacyState.translateY,
          blur: legacyState.blur,
          letterSpacing: legacyState.letterSpacing,
        },
        words: []
      };
    }
  }
}
