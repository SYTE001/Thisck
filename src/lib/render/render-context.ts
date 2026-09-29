import type { LyricLine, VisualLyricBlock } from '../../types/lyrics';
import type { StyleConfig } from '../../types/project';
import type { RenderOptions } from './canvas-renderer';
import type { LyricsType, LyricsEffect, LyricsEffectConfig } from './lyricsAnimation/types';
import type { TextAnimationPreset } from './text-animation';
import { resolveAnimationConfig, type LegacyTextAnimationConfig } from './animation-resolver';

/** Default deterministic project seed when none is supplied. */
const DEFAULT_PROJECT_SEED = 42;

/**
 * Render context — PRD Section 16.
 *
 * ProjectDocument + time -> deterministic RenderContext -> identical visual
 * result. Preview and export are consumers of the SAME builder: they pass the
 * same project data and time and get the same render options. Only quality /
 * backend parameters (resolution, isPreview) may differ between the two — the
 * builder guarantees lyric timing, animation timing, layout and scene selection
 * are identical regardless of target.
 */

export interface RenderTarget {
  width: number;
  height: number;
  /** Preview may render at lower resolution / skip expensive decoration. */
  isPreview: boolean;
}

/** The animation-related subset of motion config the render context needs. */
export interface RenderMotionInput {
  lyricsType?: LyricsType;
  lyricsEffect?: LyricsEffect;
  lyricsEffectConfig?: LyricsEffectConfig;
  textAnimation?: TextAnimationPreset;
  textAnimationConfig?: LegacyTextAnimationConfig;
}

export interface RenderContextInput {
  lines: LyricLine[];
  style: StyleConfig;
  visualBlocks?: VisualLyricBlock[];
  projectSeed?: number;
  trackTitle?: string;
  artistName?: string;
  motion?: RenderMotionInput;
}

/**
 * Build the canonical RenderOptions consumed by renderEditorialFrame. The
 * animation is resolved to canonical form here so both preview and export feed
 * the renderer identical, legacy-free animation config.
 */
export function createRenderContext(
  input: RenderContextInput,
  frameTime: number,
  target: RenderTarget
): RenderOptions {
  const { motion } = input;
  const canonical = resolveAnimationConfig({
    lyricsType: motion?.lyricsType,
    lyricsEffect: motion?.lyricsEffect,
    lyricsEffectConfig: motion?.lyricsEffectConfig,
    textAnimationPreset: motion?.textAnimation,
    textAnimationConfig: motion?.textAnimationConfig,
  });

  return {
    width: target.width,
    height: target.height,
    currentTime: frameTime,
    lines: input.lines,
    style: input.style,
    visualBlocks: input.visualBlocks,
    projectSeed: input.projectSeed ?? DEFAULT_PROJECT_SEED,
    trackTitle: input.trackTitle,
    artistName: input.artistName,
    lyricsType: canonical.type,
    lyricsEffect: canonical.effect,
    lyricsEffectConfig: canonical.config,
    isPreview: target.isPreview,
  };
}
