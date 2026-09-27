/**
 * Text Animation System
 * PRD Section 21: Dedicated text-animation abstraction.
 * PRD Section 22: Split text animation into static preparation and dynamic frame state.
 */

import type { VisualLyricBlock } from '../../types/lyrics';
import { calculateBlockMotion } from '../motion/adaptive-motion';

/**
 * PRD Section 21: Text animation presets.
 * Preset list can expand later.
 */
export type TextAnimationPreset =
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'scale-in'
  | 'blur-to-sharp'
  | 'tracking-reveal'
  | 'mask-reveal'
  | 'word-by-word'
  | 'character-by-character';

/**
 * PRD Section 22: Static preparation data (cached per block).
 * Expensive to compute; cache and reuse across frames.
 */
export interface TextLayoutCache {
  blockId: string;
  /** Resolved lines of text after wrapping */
  lines: string[];
  /** Font specification string */
  font: string;
  /** Resolved font size in pixels */
  fontSize: number;
  /** Width of the widest line */
  maxLineWidth: number;
  /** Line height in pixels */
  lineHeightPx: number;
  /** Whether the block is a supporting lyric */
  isSupporting: boolean;
}

/**
 * PRD Section 22: Dynamic frame state (calculated cheaply per frame).
 * Derived from MotionFrameState but text-animation specific.
 */
export interface TextAnimationFrameState {
  opacity: number;
  translateY: number;
  scale: number;
  /** Blur amount in pixels (0 = sharp) */
  blur: number;
  /** Active word index for word-by-word animations */
  activeWordIndex: number;
  /** Letter spacing override in pixels (null = use style default) */
  letterSpacing: number | null;
}

/**
 * Calculate the dynamic per-frame animation state for a given preset.
 * PRD Section 21: Animation duration must always adapt to available lyric duration.
 */
export function calculateTextAnimationState(
  block: VisualLyricBlock,
  currentTime: number,
  preset: TextAnimationPreset
): TextAnimationFrameState {
  const motion = calculateBlockMotion(block, currentTime, 8);

  // Base values derived from the existing adaptive motion system
  const base: TextAnimationFrameState = {
    opacity: motion.opacity,
    translateY: motion.translateY,
    scale: motion.scale,
    blur: 0,
    activeWordIndex: motion.activeWordIndex,
    letterSpacing: null,
  };

  if (!motion.isActive && motion.phase === 'before') {
    return { ...base, opacity: 0 };
  }
  if (!motion.isActive && motion.phase === 'after') {
    return { ...base, opacity: 0 };
  }

  const phase = motion.phase;
  const pp = motion.phaseProgress;


  switch (preset) {
    case 'fade': {
      // Pure opacity, no translate
      return { ...base, translateY: 0, scale: 1 };
    }

    case 'slide-up': {
      // Enhanced upward slide (default behavior, slightly exaggerated)
      return base;
    }

    case 'slide-down': {
      // Slide from below instead of above
      let translateY = 0;
      if (phase === 'enter') {
        translateY = (1 - pp) * -14; // comes from below
      } else if (phase === 'exit') {
        translateY = pp * 8; // exits upward
      }
      return { ...base, translateY };
    }

    case 'scale-in': {
      let scale = base.scale;
      if (phase === 'enter') {
        scale = 0.92 + 0.08 * pp;
      } else if (phase === 'exit') {
        scale = 1.0 - 0.05 * pp;
      }
      return { ...base, scale, translateY: 0 };
    }

    case 'blur-to-sharp': {
      // Blurred entry, sharpens as it enters
      let blur = 0;
      if (phase === 'enter') {
        blur = (1 - pp) * 8;
      } else if (phase === 'exit') {
        blur = pp * 6;
      }
      return { ...base, blur, translateY: 0 };
    }

    case 'tracking-reveal': {
      // Wide letter spacing on entry, collapses to normal
      let letterSpacing: number | null = null;
      if (phase === 'enter') {
        letterSpacing = (1 - pp) * 12; // wider at start
      } else if (phase === 'exit') {
        letterSpacing = pp * 6;
      }
      return { ...base, letterSpacing, translateY: 0 };
    }

    case 'mask-reveal':
    case 'word-by-word': {
      // Word-by-word progressive reveal; uses activeWordIndex
      return base;
    }

    case 'character-by-character': {
      // Treated as word-by-word for now; character-level would need
      // per-glyph layout which is more complex. Falls back to word-by-word.
      return base;
    }

    default: {
      // 'fade' is the safe fallback
      return { ...base, translateY: 0, scale: 1 };
    }
  }
}


/**
 * Apply a text animation frame state to a canvas context.
 * Must be called inside a ctx.save() / ctx.restore() pair.
 * PRD Section 22: Separate static geometry from dynamic transform.
 */
export function applyTextAnimationTransform(
  ctx: CanvasRenderingContext2D,
  state: TextAnimationFrameState,
  cx: number,
  cy: number
): void {
  ctx.globalAlpha = Math.max(0, Math.min(1, state.opacity));
  ctx.translate(cx, cy);
  ctx.scale(state.scale, state.scale);
  ctx.translate(-cx, -cy);

  if (state.blur > 0) {
    ctx.filter = `blur(${state.blur.toFixed(1)}px)`;
  }
}
