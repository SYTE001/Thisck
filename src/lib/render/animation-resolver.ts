import type { TextAnimationPreset } from './text-animation';
import type { LyricsType, LyricsEffect, LyricsEffectConfig } from './lyricsAnimation/types';

/**
 * Animation resolver — PRD Section 9.
 *
 * The renderer must consume ONLY the canonical animation model
 * (lyricsType + lyricsEffect + config). Legacy `textAnimationPreset` /
 * `textAnimationConfig` values are translated to canonical form here, at the
 * boundary, so the renderer no longer branches on legacy preset names.
 *
 * Pure and deterministic: identical input always yields identical output, and
 * it never depends on whether the frame is a preview or an export.
 */

export interface LegacyTextAnimationConfig {
  intensity?: number;
  enterDuration?: number;
  exitDuration?: number;
  highlightIntensity?: number;
  activeWordScale?: number;
  wordStagger?: number;
  blurAmount?: number;
  verticalMovement?: number;
}

export interface AnimationResolverInput {
  lyricsType?: LyricsType;
  lyricsEffect?: LyricsEffect;
  lyricsEffectConfig?: LyricsEffectConfig;
  /** Legacy inputs, only consulted when canonical fields are missing. */
  textAnimationPreset?: TextAnimationPreset;
  textAnimationConfig?: LegacyTextAnimationConfig;
}

export interface CanonicalAnimation {
  type: LyricsType;
  effect: LyricsEffect;
  config?: LyricsEffectConfig;
}

/** Map a legacy preset name to its canonical (type, effect) default pair. */
function resolveLegacyPreset(
  preset: TextAnimationPreset,
  explicitType?: LyricsType,
  explicitEffect?: LyricsEffect
): { type: LyricsType; effect: LyricsEffect } {
  switch (preset) {
    case 'word-by-word':
      return { type: explicitType || 'word-by-word', effect: explicitEffect || 'fade' };
    case 'karaoke':
      return { type: explicitType || 'karaoke', effect: explicitEffect || 'none' };
    case 'kinetic':
      return { type: explicitType || 'word-by-word', effect: explicitEffect || 'kinetic' };
    case 'cinematic':
    case 'blur-to-sharp':
      return { type: explicitType || 'single-line', effect: explicitEffect || 'blur' };
    case 'fade':
      return { type: explicitType || 'single-line', effect: explicitEffect || 'fade' };
    case 'slide-up':
    case 'slide-down':
      return { type: explicitType || 'single-line', effect: explicitEffect || 'slide' };
    case 'scale-in':
      return { type: explicitType || 'single-line', effect: explicitEffect || 'scale' };
    default:
      return { type: explicitType || 'word-by-word', effect: explicitEffect || 'none' };
  }
}

export function resolveAnimationConfig(input: AnimationResolverInput): CanonicalAnimation {
  let type: LyricsType = input.lyricsType || 'word-by-word';
  let effect: LyricsEffect = input.lyricsEffect || 'none';

  // Only fall back to legacy preset mapping when a canonical field is missing.
  if (!input.lyricsType || !input.lyricsEffect) {
    const preset = input.textAnimationPreset || 'karaoke';
    const resolved = resolveLegacyPreset(preset, input.lyricsType, input.lyricsEffect);
    type = resolved.type;
    effect = resolved.effect;
  }

  let config = input.lyricsEffectConfig;
  if (!config && input.textAnimationConfig) {
    const legacy = input.textAnimationConfig;
    config = {
      duration: legacy.enterDuration ?? 200,
      intensity: legacy.intensity ?? 1.0,
      direction: 'up',
      stagger: legacy.wordStagger ? legacy.wordStagger * 1000 : 40,
    };
  }

  return { type, effect, config };
}
