export interface WordAnimationState {
  opacity: number;
  scale: number;
  translateY: number;
}

export interface LineAnimationState {
  opacity: number;
  scale: number;
  translateY: number;
  blur: number;
  letterSpacing?: number | null;
}

export interface LyricsAnimationState {
  line: LineAnimationState;
  words: WordAnimationState[]; // Length matches block.words
}

export interface AnimationPresetConfig {
  enterDuration?: number;
  exitDuration?: number;
  easing?: (t: number) => number;
  intensity?: number;
  stagger?: number;
  activeScale?: number;
  activeOpacity?: number;
  blurAmount?: number;
  direction?: 'up' | 'down' | 'none';
}
