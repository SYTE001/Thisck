import type { LyricLine, VisualLyricBlock } from '../../types/lyrics';

export interface MotionFrameState {
  isActive: boolean;
  opacity: number;
  translateY: number; // in pixels relative to base layout (-5 to +8px)
  scale: number; // 0.985 to 1.0
  phase: 'before' | 'enter' | 'hold' | 'exit' | 'after';
  phaseProgress: number; // 0..1 in current phase
  totalProgress: number; // 0..1 across [startTime, endTime]
  activeWordIndex: number;
}

/**
 * High-precision cubic-bezier solver for smooth editorial easing
 * Entrance: cubic-bezier(0.22, 1, 0.36, 1) — smooth, expensive ease-out
 * Exit: cubic-bezier(0.4, 0, 1, 1) — clean acceleration into exit
 */
export function createCubicBezier(x1: number, y1: number, x2: number, y2: number) {
  return function solve(t: number): number {
    if (t <= 0) return 0;
    if (t >= 1) return 1;

    let u = t;
    for (let i = 0; i < 5; i++) {
      const currentX = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
      const dx = 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
      if (Math.abs(dx) < 1e-6) break;
      u -= (currentX - t) / dx;
      u = Math.max(0, Math.min(1, u));
    }

    return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
  };
}

export const easeEditorialEntrance = createCubicBezier(0.22, 1, 0.36, 1);
export const easeEditorialExit = createCubicBezier(0.4, 0, 1, 1);

// Backward-compatible easing helpers
export function easeOutCubic(t: number): number {
  return easeEditorialEntrance(t);
}

export function easeInCubic(t: number): number {
  return easeEditorialExit(t);
}

export function easeInOutSine(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return -(Math.cos(Math.PI * clamped) - 1) / 2;
}

/**
 * Calculates adaptive animation parameters for a given segment duration
 * adhering strictly to Section 13: Motion must scale with timing.
 *
 * duration >= 2.0s: normal entrance/exit (180-260ms)
 * duration 1.0-2.0s: compressed entrance/exit (120-180ms)
 * duration < 1.0s: micro-animation (60-100ms)
 * duration < 0.45s: opacity-only / ultra subtle (40-60ms)
 */
export function getAdaptiveMotionTimings(duration: number): {
  enterSec: number;
  exitSec: number;
  holdSec: number;
  isMinimal: boolean;
} {
  if (duration <= 0) {
    return { enterSec: 0, exitSec: 0, holdSec: 0, isMinimal: true };
  }

  const isMinimal = duration < 0.45;
  let enterSec: number;
  let exitSec: number;

  if (duration < 0.45) {
    enterSec = 0.05;
    exitSec = 0.05;
  } else if (duration < 1.0) {
    // Fast segment: compressed entrance/exit (60-120ms)
    enterSec = Math.min(0.12, Math.max(0.06, duration * 0.14));
    exitSec = Math.min(0.12, Math.max(0.06, duration * 0.14));
  } else if (duration < 2.0) {
    enterSec = 0.16;
    exitSec = 0.16;
  } else {
    // Normal / long segment (180-240ms)
    enterSec = 0.22;
    exitSec = 0.22;
  }

  if (enterSec + exitSec > duration * 0.6) {
    enterSec = duration * 0.25;
    exitSec = duration * 0.25;
  }

  const holdSec = Math.max(0, duration - enterSec - exitSec);
  return { enterSec, exitSec, holdSec, isMinimal };
}

/**
 * Calculates continuous, frame-independent motion state for a visual lyric block
 * Micro-motion specs (Section 12):
 * Entrance: opacity 0 -> 1, translateY +8px -> 0px, scale 0.985 -> 1.0
 * Exit: opacity 1 -> 0, translateY 0px -> -5px, scale 1.0 -> 0.995
 * Absolute zero residue outside [startTime, endTime].
 */
export function calculateBlockMotion(
  block: VisualLyricBlock | LyricLine | null,
  currentTime: number,
  baseShiftY: number = 8
): MotionFrameState {
  if (!block || block.startTime === null || block.endTime === null) {
    return {
      isActive: false,
      opacity: 0,
      translateY: 0,
      scale: 1,
      phase: 'before',
      phaseProgress: 0,
      totalProgress: 0,
      activeWordIndex: -1,
    };
  }

  const { startTime, endTime } = block;
  const duration = Math.max(0.01, endTime - startTime);

  // Before entrance: strictly 0 opacity, zero residue
  if (currentTime < startTime) {
    return {
      isActive: false,
      opacity: 0,
      translateY: baseShiftY,
      scale: 0.985,
      phase: 'before',
      phaseProgress: 0,
      totalProgress: 0,
      activeWordIndex: -1,
    };
  }

  // After exit: strictly 0 opacity, zero residue
  if (currentTime >= endTime) {
    return {
      isActive: false,
      opacity: 0,
      translateY: -5,
      scale: 0.995,
      phase: 'after',
      phaseProgress: 1,
      totalProgress: 1,
      activeWordIndex: -1,
    };
  }

  const elapsed = currentTime - startTime;
  const totalProgress = Math.max(0, Math.min(1, elapsed / duration));
  const timings = getAdaptiveMotionTimings(duration);

  let opacity = 1.0;
  let translateY = 0;
  let scale = 1.0;
  let phase: MotionFrameState['phase'] = 'hold';
  let phaseProgress = 0;

  if (timings.isMinimal) {
    // Ultra short (<0.45s): subtle opacity fade only (Section 13)
    if (elapsed < timings.enterSec) {
      phase = 'enter';
      phaseProgress = elapsed / timings.enterSec;
      const eased = easeEditorialEntrance(phaseProgress);
      opacity = eased;
      translateY = (1 - eased) * 2;
      scale = 0.995 + 0.005 * eased;
    } else if (elapsed > duration - timings.exitSec) {
      phase = 'exit';
      const exitElapsed = elapsed - (duration - timings.exitSec);
      phaseProgress = exitElapsed / timings.exitSec;
      const eased = easeEditorialExit(phaseProgress);
      opacity = 1 - eased;
      translateY = -eased * 2;
      scale = 1.0 - 0.005 * eased;
    } else {
      phase = 'hold';
      phaseProgress = 1;
      opacity = 1.0;
      translateY = 0;
      scale = 1.0;
    }
  } else {
    // Standard Micro-Motion (Section 12):
    // Entrance: opacity 0 -> 1, translateY +8px -> 0, scale 0.985 -> 1.0
    // Exit: opacity 1 -> 0, translateY 0 -> -5px, scale 1.0 -> 0.995
    if (elapsed < timings.enterSec) {
      phase = 'enter';
      phaseProgress = elapsed / timings.enterSec;
      const eased = easeEditorialEntrance(phaseProgress);
      opacity = eased;
      translateY = (1 - eased) * baseShiftY;
      scale = 0.985 + 0.015 * eased;
    } else if (elapsed < timings.enterSec + timings.holdSec) {
      phase = 'hold';
      phaseProgress = (elapsed - timings.enterSec) / Math.max(0.001, timings.holdSec);
      translateY = 0;
      scale = 1.0;
      opacity = 1.0;
    } else {
      phase = 'exit';
      const exitElapsed = elapsed - (timings.enterSec + timings.holdSec);
      phaseProgress = exitElapsed / timings.exitSec;
      const eased = easeEditorialExit(phaseProgress);
      opacity = 1 - eased;
      translateY = -eased * 5;
      scale = 1.0 - 0.005 * eased;
    }
  }

  // Active word index tracking if word objects exist
  let activeWordIndex = -1;
  if (block.words && block.words.length > 0) {
    for (let wIdx = 0; wIdx < block.words.length; wIdx++) {
      const w = block.words[wIdx];
      if (currentTime >= w.startTime && currentTime <= w.endTime) {
        activeWordIndex = wIdx;
        break;
      }
    }
    if (activeWordIndex === -1 && currentTime >= block.words[0].startTime) {
      for (let wIdx = block.words.length - 1; wIdx >= 0; wIdx--) {
        if (currentTime >= block.words[wIdx].startTime) {
          activeWordIndex = wIdx;
          break;
        }
      }
    }
  }

  return {
    isActive: true,
    opacity: Math.max(0, Math.min(1, opacity)),
    translateY,
    scale,
    phase,
    phaseProgress,
    totalProgress,
    activeWordIndex,
  };
}

// Backward-compatible alias for existing tests
export const calculateLineMotion = calculateBlockMotion;
