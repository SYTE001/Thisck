/**
 * LYRICS TYPE ENGINE
 * PRD & Specification: Layer 1 — LYRICS TYPE
 *
 * Lyrics Type defines HOW TEXT IS DISPLAYED, NOT how it is animated.
 * Crucial behavior:
 * - Typography MUST stay solid and stable.
 * - Word by Word means sequential visibility/highlight, NOT position movement.
 * - Text position remains strictly consistent.
 * - Line spacing, alignment, font size, and bounding box NEVER change randomly.
 * - No bounce, shake, floating, elastic movement, or random offset as default behavior.
 */

import type { VisualLyricBlock } from '../../../types/lyrics';
import type { LyricsType, UnitAnimationState } from './types';
import { getDistributedWords } from './presets/wordByWord';

export interface LyricsTypeResult {
  units: UnitAnimationState[];
  revealProgress: number; // For progressive reveal mode (0.0 to 1.0)
  blockActive: boolean;
}

/**
 * Resolves the display state and units for any given LyricsType at the exact currentTime.
 * Layout positions remain 100% static.
 */
export function resolveLyricsTypeState(
  lyricsType: LyricsType,
  block: VisualLyricBlock,
  currentTime: number,
  accentColor: string = '#E6C280'
): LyricsTypeResult {
  const isBefore = currentTime < block.startTime;
  const isAfter = currentTime >= block.endTime;
  const blockActive = !isBefore && !isAfter;

  const duration = Math.max(0.1, block.endTime - block.startTime);
  const blockProgress = isBefore ? 0 : isAfter ? 1 : Math.max(0, Math.min(1, (currentTime - block.startTime) / duration));

  // If outside block timing, all units are hidden
  if (!blockActive) {
    const rawWords = getDistributedWords(block);
    return {
      units: rawWords.map((w) => ({
        id: w.id,
        text: w.text,
        isRevealed: false,
        isActive: false,
        isPast: isAfter,
        opacity: 0,
        translateX: 0,
        translateY: 0,
        scale: 1,
        blur: 0,
        glow: 0,
        colorOverride: null,
      })),
      revealProgress: isAfter ? 1 : 0,
      blockActive: false,
    };
  }

  const words = getDistributedWords(block);

  switch (lyricsType) {
    case 'single-line':
    case 'multi-line':
    case 'paragraph': {
      // Entire block is visible simultaneously. Solid, crisp, static.
      const units: UnitAnimationState[] = words.map((w) => ({
        id: w.id,
        text: w.text,
        isRevealed: true,
        isActive: true,
        isPast: false,
        opacity: 1.0,
        translateX: 0,
        translateY: 0,
        scale: 1.0,
        blur: 0,
        glow: 0,
        colorOverride: null,
      }));
      return { units, revealProgress: 1.0, blockActive: true };
    }

    case 'word-by-word': {
      // Words appear sequentially at their fixed, pre-calculated positions.
      // Zero position shift! Words simply become revealed at their timestamp.
      const units: UnitAnimationState[] = words.map((w) => {
        const isRevealed = currentTime >= w.startTime;
        const isActive = isRevealed && currentTime < w.endTime;
        const isPast = currentTime >= w.endTime;

        return {
          id: w.id,
          text: w.text,
          isRevealed,
          isActive,
          isPast,
          opacity: isRevealed ? 1.0 : 0.0,
          translateX: 0,
          translateY: 0,
          scale: 1.0,
          blur: 0,
          glow: 0,
          colorOverride: null,
        };
      });
      return { units, revealProgress: blockProgress, blockActive: true };
    }

    case 'character': {
      // Characters appear sequentially. At word level, words appear as soon as
      // their first character arrives, and stay solid.
      const units: UnitAnimationState[] = words.map((w) => {
        const isRevealed = currentTime >= w.startTime;
        const isActive = isRevealed && currentTime < w.endTime;
        const isPast = currentTime >= w.endTime;

        return {
          id: w.id,
          text: w.text,
          isRevealed,
          isActive,
          isPast,
          opacity: isRevealed ? 1.0 : 0.0,
          translateX: 0,
          translateY: 0,
          scale: 1.0,
          blur: 0,
          glow: 0,
          colorOverride: null,
        };
      });
      return { units, revealProgress: blockProgress, blockActive: true };
    }

    case 'highlighted-word': {
      // All words are visible throughout the line.
      // The currently active word is highlighted with high contrast / accent color.
      // Other words remain visible but slightly dimmed (0.42 opacity).
      const units: UnitAnimationState[] = words.map((w) => {
        const isActive = currentTime >= w.startTime && currentTime < w.endTime;
        const isPast = currentTime >= w.endTime;

        return {
          id: w.id,
          text: w.text,
          isRevealed: true,
          isActive,
          isPast,
          opacity: isActive ? 1.0 : 0.42,
          translateX: 0,
          translateY: 0,
          scale: 1.0,
          blur: 0,
          glow: 0,
          colorOverride: isActive ? accentColor : null,
        };
      });
      return { units, revealProgress: 1.0, blockActive: true };
    }

    case 'karaoke': {
      // All words visible throughout line duration.
      // Words not yet reached: dimmed (0.45).
      // Active word: illuminated in accent color (1.0).
      // Words already sung: remain visible at full opacity (1.0).
      const units: UnitAnimationState[] = words.map((w) => {
        const notYet = currentTime < w.startTime;
        const isActive = currentTime >= w.startTime && currentTime < w.endTime;
        const isPast = currentTime >= w.endTime;

        return {
          id: w.id,
          text: w.text,
          isRevealed: true,
          isActive,
          isPast,
          opacity: notYet ? 0.45 : 1.0,
          translateX: 0,
          translateY: 0,
          scale: 1.0,
          blur: 0,
          glow: 0,
          colorOverride: isActive ? accentColor : null,
        };
      });
      return { units, revealProgress: blockProgress, blockActive: true };
    }

    case 'progressive': {
      // Progressive reveal: all words exist in layout, revealed by left-to-right wipe
      const units: UnitAnimationState[] = words.map((w) => {
        const isRevealed = currentTime >= w.startTime;
        const isActive = isRevealed && currentTime < w.endTime;
        const isPast = currentTime >= w.endTime;

        return {
          id: w.id,
          text: w.text,
          isRevealed: true, // Word geometry is intact
          isActive,
          isPast,
          opacity: 1.0,
          translateX: 0,
          translateY: 0,
          scale: 1.0,
          blur: 0,
          glow: 0,
          colorOverride: null,
        };
      });
      return { units, revealProgress: blockProgress, blockActive: true };
    }

    default: {
      // Default fallback: single line static behavior
      const units: UnitAnimationState[] = words.map((w) => ({
        id: w.id,
        text: w.text,
        isRevealed: true,
        isActive: true,
        isPast: false,
        opacity: 1.0,
        translateX: 0,
        translateY: 0,
        scale: 1.0,
        blur: 0,
        glow: 0,
        colorOverride: null,
      }));
      return { units, revealProgress: 1.0, blockActive: true };
    }
  }
}
