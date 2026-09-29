/**
 * LYRICS EFFECT ENGINE
 * PRD & Specification: Layer 2 — LYRICS EFFECT
 *
 * Lyrics Effect is the visual animation layer applied ON TOP of Lyrics Type.
 * Effect can be applied to whole lyric, line, word, or character WITHOUT altering
 * the underlying text layout or geometry.
 *
 * Requirements:
 * - Effect must be modular and independent of Lyrics Type.
 * - 'none' must produce strictly static, solid, stable, crisp typography with ZERO unwanted movement.
 * - Predictable timeline system with sensible defaults: duration, delay, easing, intensity, direction, stagger.
 * - Readability has priority over animation.
 * - ALL displacements are expressed as EM RATIOS relative to the rendered font size,
 *   so an effect looks identical in scale on a 1080x1920 export and on a small preview,
 *   and it stays clearly visible regardless of the chosen font size.
 */

import type { VisualLyricBlock } from '../../../types/lyrics';
import type { LyricsEffect, LyricsEffectConfig, UnitAnimationState } from './types';
import { DEFAULT_LYRICS_EFFECT_CONFIG } from './types';

/**
 * Easing functions
 */
function easeOutCubic(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - c, 3);
}

function easeInOutQuad(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
}

function easeSpring(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  // Subtle critically damped spring, zero excessive bounce
  return 1 - Math.exp(-6 * c) * Math.cos(c * Math.PI * 2);
}

function applyEasing(t: number, easing: string = 'ease-out'): number {
  switch (easing) {
    case 'linear':
      return Math.max(0, Math.min(1, t));
    case 'ease-in-out':
      return easeInOutQuad(t);
    case 'spring':
      return easeSpring(t);
    case 'ease-out':
    default:
      return easeOutCubic(t);
  }
}

/**
 * Em ratios: every displacement is `ratio * fontSize * intensity`.
 * Chosen so that at a typical 1080x1920 render (font ~88px) a 100% intensity
 * effect is clearly visible, while 200% is a strong accent.
 */
const EM = {
  wave: 0.16,
  kinetic: 0.18,
  slide: 0.26,
  bounce: 0.22,
  blur: 0.14,
  glow: 0.22,
} as const;

/** Wave oscillation speed in Hz (1.2 - 1.6 Hz reads as a calm travelling ripple). */
export const WAVE_FREQUENCY_HZ = 1.4;
/** Phase offset per unit (radians) so the wave visibly travels left to right. */
export const WAVE_PHASE_STEP = 0.6;
/** Fallback font size (px) used when the caller does not provide one. */
export const FALLBACK_FONT_SIZE = 88;

/**
 * Per-effect default duration (ms).
 * Enter/motion effects get 350-450ms so the movement is actually perceivable;
 * pure opacity fades stay short on purpose.
 */
const EFFECT_DEFAULT_DURATION: Partial<Record<LyricsEffect, number>> = {
  fade: 220,
  'fade-in-out': 260,
  typewriter: 320,
  wave: 400,
  glow: 400,
  highlight: 400,
  pulse: 400,
};

/**
 * Vertical offset of the travelling wave for a given unit/character index.
 * Shared by the effect engine (word level) and the canvas renderer (character level)
 * so both layers stay perfectly in sync.
 */
export function getWaveOffsetY(
  unitIndex: number,
  currentTime: number,
  blockStartTime: number,
  fontSize: number = FALLBACK_FONT_SIZE,
  intensity: number = 1
): number {
  const em = EM.wave * (fontSize > 0 ? fontSize : FALLBACK_FONT_SIZE);
  const omega = Math.PI * 2 * WAVE_FREQUENCY_HZ;
  const phase = (currentTime - blockStartTime) * omega + unitIndex * WAVE_PHASE_STEP;
  return Math.sin(phase) * em * Math.max(0, Math.min(2, intensity));
}

/**
 * Applies visual motion effect to the resolved units of a lyric block.
 * When effect is 'none', returns completely static units with 0 transform and full stability.
 */
export function applyLyricsEffect(
  effect: LyricsEffect,
  units: UnitAnimationState[],
  block: VisualLyricBlock,
  currentTime: number,
  config: LyricsEffectConfig = {},
  fontSize: number = FALLBACK_FONT_SIZE
): {
  units: UnitAnimationState[];
  lineTransform: {
    opacity: number;
    translateX: number;
    translateY: number;
    scale: number;
    blur: number;
    letterSpacing?: number | null;
  };
} {
  const cfg = { ...DEFAULT_LYRICS_EFFECT_CONFIG, ...config };
  // Effect-specific default duration, overridable by the explicit config value.
  const durationMs = config.duration ?? EFFECT_DEFAULT_DURATION[effect] ?? DEFAULT_LYRICS_EFFECT_CONFIG.duration;
  const durationSec = Math.max(0.05, durationMs / 1000);
  const intensity = Math.max(0, Math.min(2.0, cfg.intensity));
  const staggerSec = (cfg.stagger || 0) / 1000;

  // Em-relative unit: 1em == the rendered font size in pixels.
  const emPx = fontSize > 0 ? fontSize : FALLBACK_FONT_SIZE;

  // Base line transform (neutral)
  const lineTransform = {
    opacity: 1.0,
    translateX: 0,
    translateY: 0,
    scale: 1.0,
    blur: 0,
    letterSpacing: null as number | null,
  };

  // If outside block, ensure zero opacity
  if (currentTime < block.startTime || currentTime >= block.endTime) {
    lineTransform.opacity = 0;
    return {
      units: units.map((u) => ({ ...u, opacity: 0 })),
      lineTransform,
    };
  }

  // Effect: 'none' -> Pure Solid & Static Typography
  if (effect === 'none') {
    return {
      units: units.map((u) => ({
        ...u,
        translateX: 0,
        translateY: 0,
        scale: 1.0,
        blur: 0,
        glow: 0,
      })),
      lineTransform,
    };
  }

  const blockRemaining = block.endTime - currentTime;
  const exitDurationSec = Math.min(0.35, durationSec);

  // Line-level exit fade if near block end
  if (blockRemaining < exitDurationSec) {
    const exitProgress = Math.max(0, blockRemaining / exitDurationSec);
    lineTransform.opacity = easeOutCubic(exitProgress);
  }

  const modifiedUnits = units.map((unit, index) => {
    // If unit is not revealed yet by Lyrics Type, keep it hidden
    if (!unit.isRevealed) {
      return { ...unit, opacity: 0 };
    }

    const unitStart = block.words?.[index]?.startTime ?? block.startTime;
    const staggeredStart = unitStart + index * staggerSec;
    const elapsed = Math.max(0, currentTime - staggeredStart);
    const progress = Math.min(1, elapsed / durationSec);
    const eased = applyEasing(progress, cfg.easing);

    let finalOpacity = unit.opacity;
    let finalTranslateX = 0;
    let finalTranslateY = 0;
    let finalScale = 1.0;
    let finalBlur = 0;
    let finalGlow = 0;

    switch (effect) {
      case 'fade': {
        // Smooth monotonic opacity ramp on reveal; zero position offset
        finalOpacity = unit.opacity * eased;
        break;
      }

      case 'fade-in-out': {
        finalOpacity = unit.opacity * eased;
        if (blockRemaining < exitDurationSec) {
          finalOpacity *= easeOutCubic(blockRemaining / exitDurationSec);
        }
        break;
      }

      case 'wave': {
        // Travelling typographic ripple: continuous while the block is active,
        // phase-shifted per unit so it clearly propagates left to right.
        // Opacity is intentionally untouched by the wave.
        finalTranslateY = getWaveOffsetY(index, currentTime, block.startTime, emPx, intensity);
        finalOpacity = unit.opacity;
        break;
      }

      case 'kinetic': {
        // Crisp modern kinetic micro-slide with swift ease-out decelerate
        finalOpacity = unit.opacity * eased;
        finalTranslateY = (1 - eased) * EM.kinetic * emPx * intensity;
        break;
      }

      case 'scale': {
        // Subtle micro-settle (0.95 -> 1.00)
        finalOpacity = unit.opacity * eased;
        finalScale = (0.95 + 0.05 * eased) * (unit.isActive ? 1.03 : 1.0);
        break;
      }

      case 'pop': {
        // Snappy pop-in micro-accent
        finalOpacity = unit.opacity * Math.min(1, eased * 1.3);
        const popScale = eased < 0.6 ? 0.92 + (0.12 * eased) / 0.6 : 1.04 - (0.04 * (eased - 0.6)) / 0.4;
        finalScale = 1.0 + (popScale - 1.0) * intensity;
        break;
      }

      case 'blur': {
        // Soft blur-to-sharp
        finalOpacity = unit.opacity * eased;
        finalBlur = (1 - eased) * EM.blur * emPx * intensity;
        break;
      }

      case 'slide': {
        // Directional slide
        finalOpacity = unit.opacity * eased;
        const dir = cfg.direction || 'up';
        const dist = EM.slide * emPx * intensity * (1 - eased);
        if (dir === 'up') finalTranslateY = dist;
        else if (dir === 'down') finalTranslateY = -dist;
        else if (dir === 'left') finalTranslateX = dist;
        else if (dir === 'right') finalTranslateX = -dist;
        break;
      }

      case 'typewriter': {
        // Crisp, stepped cadence reveal
        finalOpacity = unit.opacity;
        finalScale = 1.0;
        break;
      }

      case 'bounce': {
        // Gentle damped bounce
        finalOpacity = unit.opacity * Math.min(1, eased * 1.5);
        const bounceOffset = Math.sin(eased * Math.PI * 1.5) * (1 - eased) * EM.bounce * emPx * intensity;
        finalTranslateY = -bounceOffset;
        break;
      }

      case 'glow': {
        // Luminous soft bloom on active unit
        finalOpacity = unit.opacity;
        if (unit.isActive) {
          finalGlow = EM.glow * emPx * intensity;
        }
        break;
      }

      case 'highlight': {
        // High contrast sweep
        finalOpacity = unit.opacity * eased;
        if (unit.isActive) {
          finalScale = 1.0 + 0.03 * intensity;
        }
        break;
      }

      case 'pulse': {
        // Gentle rhythmic breathing pulse
        finalOpacity = unit.opacity;
        const pulseProgress = Math.sin((currentTime - block.startTime) * 4) * 0.5 + 0.5;
        finalScale = 1.0 + (unit.isActive ? pulseProgress * 0.035 * intensity : 0);
        break;
      }

      default: {
        // Default: solid static
        finalOpacity = unit.opacity;
        break;
      }
    }

    return {
      ...unit,
      opacity: Math.max(0, Math.min(1, finalOpacity)),
      translateX: finalTranslateX,
      translateY: finalTranslateY,
      scale: finalScale,
      blur: finalBlur,
      glow: finalGlow,
    };
  });

  return {
    units: modifiedUnits,
    lineTransform,
  };
}
