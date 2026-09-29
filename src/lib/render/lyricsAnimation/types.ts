/**
 * LYRICS ANIMATION SYSTEM - TYPES
 * PRD & Specification: Complete separation of LYRICS TYPE and LYRICS EFFECT.
 *
 * 1. LYRICS TYPE: Defines HOW TEXT IS DISPLAYED (Content / Layout / Reveal Behavior).
 * 2. LYRICS EFFECT: Defines HOW TEXT IS ANIMATED (Visual Motion / Transform Layer).
 */


/**
 * Lyrics Type determines HOW TEXT IS DISPLAYED, not how it is animated.
 * Crucial behavior: Typography remains solid, stable, crisp, and predictable.
 * Layout positions are completely fixed and do not bounce or jump.
 */
export type LyricsType =
  | 'single-line'        // 1 line per block
  | 'multi-line'         // 2 balanced lines
  | 'paragraph'          // 3+ lines stacked
  | 'word-by-word'       // Words revealed sequentially at fixed positions (zero movement)
  | 'character'          // Characters revealed sequentially at fixed positions
  | 'highlighted-word'   // All words visible; active word highlighted with accent color/full opacity
  | 'karaoke'            // All words visible; words transition from dim to active/sung state
  | 'progressive';       // Continuous progressive reveal without position displacement

/**
 * Lyrics Effect is the visual animation layer applied ON TOP of Lyrics Type.
 * Can be combined with ANY Lyrics Type without altering layout or text geometry.
 */
export type LyricsEffect =
  | 'none'          // Completely static, crisp, zero movement, pure solid typography
  | 'fade'          // Smooth opacity transition
  | 'fade-in-out'   // Opacity fade in at start, fade out at end
  | 'wave'          // Subtle typographic vertical sine wave
  | 'kinetic'       // Crisp modern kinetic micro-slide (4-6px with snappy ease-out)
  | 'scale'         // Subtle scale micro-settle (0.95 -> 1.00)
  | 'pop'           // Clean snappy pop-in micro-scale
  | 'blur'          // Soft blur-in to crystal sharp
  | 'slide'         // Directional slide
  | 'typewriter'    // Cadenced step reveal
  | 'bounce'        // Subtle gentle bounce
  | 'glow'          // Soft typographic bloom on active elements
  | 'highlight'     // Vivid color highlight sweep / flash
  | 'pulse';        // Gentle rhythmic breathing pulse

export type EffectEasing = 'ease-out' | 'ease-in-out' | 'linear' | 'spring';
export type EffectDirection = 'up' | 'down' | 'left' | 'right';

export interface LyricsEffectConfig {
  /**
   * Animation duration in milliseconds (default: 400ms).
   * Omit it to let each effect pick its own sensible default
   * (motion/enter effects 350-450ms, pure opacity fades shorter).
   */
  duration?: number;
  /** Animation delay in milliseconds (default: 0ms) */
  delay?: number;
  /** Easing curve (default: 'ease-out') */
  easing?: EffectEasing;
  /** Intensity multiplier 0.0 - 2.0 (default: 1.0). 100% is already clearly visible; 200% is strong. */
  intensity?: number;
  /** Direction for directional effects like slide (default: 'up') */
  direction?: EffectDirection;
  /** Stagger between units in milliseconds (default: 40ms) */
  stagger?: number;
  /** Loop animation when applicable (default: false) */
  loop?: boolean;
}

export const DEFAULT_LYRICS_EFFECT_CONFIG: Required<LyricsEffectConfig> = {
  duration: 400,
  delay: 0,
  easing: 'ease-out',
  intensity: 1.0,
  direction: 'up',
  stagger: 40,
  loop: false,
};

/** State of an individual animated unit (word or character) */
export interface UnitAnimationState {
  id: string;
  text: string;
  isRevealed: boolean;
  isActive: boolean;
  isPast: boolean;
  opacity: number;
  translateX: number;
  translateY: number;
  scale: number;
  blur: number;
  glow: number;
  /** Custom highlight color override (null uses default text color) */
  colorOverride: string | null;
}

/** Resolved dynamic animation state for the entire lyric block */
export interface ResolvedLyricsAnimationState {
  lyricsType: LyricsType;
  lyricsEffect: LyricsEffect;
  /** Block-level transform */
  line: {
    opacity: number;
    translateX: number;
    translateY: number;
    scale: number;
    blur: number;
    letterSpacing?: number | null;
  };
  /** Word-level animation states */
  words: UnitAnimationState[];
  /** Progressive reveal percentage (0.0 to 1.0) for progressive mode */
  revealProgress: number;
}
