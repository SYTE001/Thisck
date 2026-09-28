/**
 * ANIMATION ENGINE
 * Master orchestrator connecting Layer 1 (LYRICS TYPE) and Layer 2 (LYRICS EFFECT).
 */

import type { VisualLyricBlock } from '../../../types/lyrics';
import type { LyricsAnimationState } from './animationConfig';
import type { MotionFrameState } from '../../motion/adaptive-motion';
import type { TextAnimationPreset } from '../text-animation';
import type { LyricsType, LyricsEffect, LyricsEffectConfig } from './types';
import { resolveLyricsTypeState } from './lyricsTypes';
import { applyLyricsEffect } from './lyricsEffects';

/**
 * Resolves the complete animation and layout state for any (LyricsType + LyricsEffect) combination.
 * Both layers operate independently with 100% determinism.
 */
export function getLyricsAnimationState(
  lyricsType: LyricsType = 'word-by-word',
  lyricsEffect: LyricsEffect = 'none',
  block: VisualLyricBlock,
  currentTime: number,
  config?: LyricsEffectConfig,
  accentColor: string = '#E6C280'
): LyricsAnimationState {
  // Layer 1: Resolve content and display behavior
  const typeResult = resolveLyricsTypeState(lyricsType, block, currentTime, accentColor);

  // Layer 2: Resolve visual motion and transforms
  const effectResult = applyLyricsEffect(
    lyricsEffect,
    typeResult.units,
    block,
    currentTime,
    config
  );

  return {
    line: {
      opacity: effectResult.lineTransform.opacity,
      scale: effectResult.lineTransform.scale,
      translateY: effectResult.lineTransform.translateY,
      translateX: effectResult.lineTransform.translateX,
      blur: effectResult.lineTransform.blur,
      letterSpacing: effectResult.lineTransform.letterSpacing,
    },
    words: effectResult.units.map((u) => ({
      opacity: u.opacity,
      scale: u.scale,
      translateY: u.translateY,
      translateX: u.translateX,
      blur: u.blur,
      glow: u.glow,
      colorOverride: u.colorOverride,
    })),
    revealProgress: typeResult.revealProgress,
    lyricsType,
    lyricsEffect,
  };
}

/**
 * Legacy adapter for backward compatibility with PRD Section 21 textAnimationPreset.
 */
export function getAnimationState(
  preset: TextAnimationPreset | string,
  block: VisualLyricBlock,
  currentTime: number,
  _motion: MotionFrameState,
  config?: any
): LyricsAnimationState {
  let lyricsType: LyricsType = 'single-line';
  let lyricsEffect: LyricsEffect = 'none';

  switch (preset) {
    case 'word-by-word':
      lyricsType = 'word-by-word';
      lyricsEffect = 'fade';
      break;
    case 'character-by-character':
      lyricsType = 'character';
      lyricsEffect = 'none';
      break;
    case 'karaoke':
      lyricsType = 'karaoke';
      lyricsEffect = 'none';
      break;
    case 'kinetic':
      lyricsType = 'word-by-word';
      lyricsEffect = 'kinetic';
      break;
    case 'cinematic':
    case 'blur-to-sharp':
      lyricsType = 'single-line';
      lyricsEffect = 'blur';
      break;
    case 'fade':
      lyricsType = 'single-line';
      lyricsEffect = 'fade';
      break;
    case 'slide-up':
      lyricsType = 'single-line';
      lyricsEffect = 'slide';
      break;
    case 'slide-down':
      lyricsType = 'single-line';
      lyricsEffect = 'slide';
      break;
    case 'scale-in':
      lyricsType = 'single-line';
      lyricsEffect = 'scale';
      break;
    default:
      lyricsType = 'single-line';
      lyricsEffect = 'none';
      break;
  }

  const effectConfig: LyricsEffectConfig = {
    duration: config?.enterDuration ?? 200,
    intensity: config?.intensity ?? 1.0,
    easing: config?.easing ?? 'ease-out',
    direction: config?.direction === 'down' ? 'down' : 'up',
    stagger: config?.wordStagger ? config.wordStagger * 1000 : 40,
  };

  return getLyricsAnimationState(
    lyricsType,
    lyricsEffect,
    block,
    currentTime,
    effectConfig,
    '#E6C280'
  );
}
