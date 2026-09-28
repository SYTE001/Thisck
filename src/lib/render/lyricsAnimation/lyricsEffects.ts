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
 * Applies visual motion effect to the resolved units of a lyric block.
 * When effect is 'none', returns completely static units with 0 transform and full stability.
 */
export function applyLyricsEffect(
  effect: LyricsEffect,
  units: UnitAnimationState[],
  block: VisualLyricBlock,
  currentTime: number,
  config: LyricsEffectConfig = {}
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
  const durationSec = Math.max(0.05, cfg.duration / 1000);
  const intensity = Math.max(0, Math.min(2.0, cfg.intensity));
  const staggerSec = (cfg.stagger || 0) / 1000;

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
        // Subtle rhythmic typographic wave (2-3px)
        const wavePhase = (currentTime - block.startTime) * 3.5 + index * 0.55;
        finalTranslateY = Math.sin(wavePhase) * 3.0 * intensity;
        finalOpacity = unit.opacity * Math.min(1, eased + 0.3);
        break;
      }

      case 'kinetic': {
        // Crisp modern kinetic micro-slide (4-5px with swift ease-out decelerate)
        finalOpacity = unit.opacity * eased;
        finalTranslateY = (1 - eased) * 5.0 * intensity;
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
        finalBlur = (1 - eased) * 6.0 * intensity;
        break;
      }

      case 'slide': {
        // Directional slide
        finalOpacity = unit.opacity * eased;
        const dir = cfg.direction || 'up';
        const dist = 8.0 * intensity * (1 - eased);
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
        const bounceOffset = Math.sin(eased * Math.PI * 1.5) * (1 - eased) * 4.0 * intensity;
        finalTranslateY = -bounceOffset;
        break;
      }

      case 'glow': {
        // Luminous soft bloom on active unit
        finalOpacity = unit.opacity;
        if (unit.isActive) {
          finalGlow = 8.0 * intensity;
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
