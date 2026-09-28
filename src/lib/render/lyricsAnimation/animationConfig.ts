import type { LyricsType, LyricsEffect } from './types';

export interface WordAnimationState {
  opacity: number;
  scale: number;
  translateY: number;
  translateX?: number;
  blur?: number;
  glow?: number;
  colorOverride?: string | null;
}

export interface LineAnimationState {
  opacity: number;
  scale: number;
  translateY: number;
  translateX?: number;
  blur: number;
  letterSpacing?: number | null;
}

export interface LyricsAnimationState {
  line: LineAnimationState;
  words: WordAnimationState[];
  revealProgress?: number;
  lyricsType?: LyricsType;
  lyricsEffect?: LyricsEffect;
}

export interface AnimationPresetConfig {
  enterDuration?: number;
  exitDuration?: number;
  easing?: string;
  intensity?: number;
  stagger?: number;
  activeScale?: number;
  activeOpacity?: number;
  blurAmount?: number;
  direction?: 'up' | 'down' | 'none';
}
