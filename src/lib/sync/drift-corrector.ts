import type { LyricLine, Word } from '../../types/lyrics';

/**
 * DRIFT CORRECTOR (PRD Module I)
 *
 * A global offset ("shift everything +100ms") cannot fix cumulative drift:
 * the error at 0:10 may be +80ms while at 1:00 it is +410ms. This module
 * builds a *local* correction from anchor evidence and warps the timeline
 * piecewise-linearly so the whole song stays glued to the audio.
 *
 * What counts as an anchor (an `expected → detected` time pair):
 *   1. PRIOR TIMING — when the original lyrics already carry line timings
 *      (an imported LRC/SRT), every newly aligned line that confidently
 *      matched the audio contributes the pair (prior line start, aligned
 *      line start). This is the common Thisck flow: rough LRC in, word-level
 *      precision out, with the ASR's progressive bias removed.
 *   2. USER ANCHORS — pairs supplied by a review/anchor UI (future "Drift /
 *      Anchor Review"), trusted exactly as given.
 *
 * What is corrected, precisely (PRD Rule 7 — documented method):
 *   The error series e_i = detected_i − expected_i is decomposed into a
 *   constant component (the median) and a progressive component (the spread
 *   around the median). The warp removes ONLY the progressive component —
 *   a constant residual is left for the user's Global Offset fine-tune, so
 *   cumulative drift is never "solved" with a global offset alone. When no
 *   progressive component exists (max spread below threshold) the correction
 *   is a no-op.
 *
 * Guarantees: the piecewise warp is monotone by construction, never produces
 * negative times, never reorders or overlaps lines, is bounded per anchor,
 * and leaves repeated choruses intact because every occurrence contributes
 * its own anchor.
 */

export interface DriftAnchor {
  /** Time the line SHOULD sit at according to the reference, in seconds. */
  expected: number;
  /** Time the alignment actually produced, in seconds. */
  detected: number;
  /** Relative trust of this anchor (0..1). */
  weight: number;
}

export interface DriftCorrectionOptions {
  /** Min progressive spread before warping is worth applying (sec). */
  minProgressiveSpreadSec?: number;
  /** Anchor trust threshold for prior-timing anchors (line confidence). */
  anchorConfidenceThreshold?: number;
  /** Upper bound on the correction applied to any single timestamp (sec). */
  maxCorrectionSec?: number;
  /** User-supplied anchors; when present they take precedence over auto ones. */
  extraAnchors?: DriftAnchor[];
}

const DEFAULTS: Required<Omit<DriftCorrectionOptions, 'extraAnchors'>> = {
  minProgressiveSpreadSec: 0.3,
  anchorConfidenceThreshold: 0.6,
  maxCorrectionSec: 2,
};

/** A monotone piecewise-linear time mapping (uncorrected → corrected). */
export interface TimeWarp {
  from: number[];
  to: number[];
}

export interface DriftCorrectionResult {
  lines: LyricLine[];
  /** Anchors that were actually used to build the warp. */
  anchors: DriftAnchor[];
  /** Max |correction| applied across the timeline, in seconds. */
  maxAppliedCorrectionSec: number;
  /** The constant component that was deliberately left in place (sec). */
  residualConstantSec: number;
  /** Whether any timestamp actually moved. */
  applied: boolean;
  /** Human-readable reason when `applied` is false. */
  skippedReason?: 'no-reference' | 'too-few-anchors' | 'no-progressive-drift';
}

/**
 * Builds auto anchors by pairing prior line timings with the new alignment.
 * Only lines that confidently matched the audio participate; interpolated or
 * low-confidence lines would inject noise into the drift model.
 */
export function extractAnchors(
  alignedLines: LyricLine[],
  priorLines: LyricLine[],
  confidenceThreshold = DEFAULTS.anchorConfidenceThreshold
): DriftAnchor[] {
  const priorById = new Map(priorLines.map((l) => [l.id, l]));
  const anchors: DriftAnchor[] = [];
  for (const line of alignedLines) {
    if (line.startTime === null) continue;
    if ((line.confidence ?? 0) < confidenceThreshold) continue;
    const prior = priorById.get(line.id);
    if (!prior || prior.startTime === null) continue;
    anchors.push({ expected: prior.startTime, detected: line.startTime, weight: line.confidence ?? 0.6 });
  }
  return anchors;
}

/**
 * Applies drift correction to a fully aligned draft.
 * Returns the same line objects when there is nothing to correct.
 *
 * @param alignedLines  Draft produced by the aligner.
 * @param priorLines    The original lines as they were BEFORE alignment
 *                      (their startTime is the prior reference; text/timing
 *                      are never modified — only read).
 */
export function correctDrift(
  alignedLines: LyricLine[],
  priorLines: LyricLine[],
  options: DriftCorrectionOptions = {}
): DriftCorrectionResult {
  const opts = { ...DEFAULTS, ...options };
  const useAuto = !options.extraAnchors || options.extraAnchors.length === 0;
  const anchors = useAuto
    ? extractAnchors(alignedLines, priorLines, opts.anchorConfidenceThreshold)
    : options.extraAnchors!;

  if (anchors.length === 0) {
    return {
      lines: alignedLines,
      anchors: [],
      maxAppliedCorrectionSec: 0,
      residualConstantSec: 0,
      applied: false,
      skippedReason: 'no-reference',
    };
  }
  if (anchors.length < 3) {
    return {
      lines: alignedLines,
      anchors,
      maxAppliedCorrectionSec: 0,
      residualConstantSec: 0,
      applied: false,
      skippedReason: 'too-few-anchors',
    };
  }

  // Decompose the error into constant + progressive components.
  const errors = anchors.map((a) => a.detected - a.expected);
  const sorted = [...errors].sort((x, y) => x - y);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  const spread = sorted[sorted.length - 1] - sorted[0];

  // Auto anchors only fire when a PROGRESSIVE component exists — a pure
  // constant offset is Global Offset territory (PRD §15). User anchors are
  // honoured unconditionally: supplying one is an explicit correction request.
  if (useAuto && spread < opts.minProgressiveSpreadSec) {
    return {
      lines: alignedLines,
      anchors,
      maxAppliedCorrectionSec: 0,
      residualConstantSec: Number(median.toFixed(3)),
      applied: false,
      skippedReason: 'no-progressive-drift',
    };
  }

  // Auto anchors keep the constant component (Global Offset territory): the
  // anchor moves to its prior expected time plus the median residual offset.
  // User anchors are honoured exactly as supplied.
  const warp = buildTimeWarp(
    anchors.map((a) => ({ ...a, target: useAuto ? a.expected + median : a.expected })),
    opts
  );

  const out = applyWarp(alignedLines, warp);
  let maxCorrection = 0;
  for (let i = 0; i < warp.from.length; i++) {
    maxCorrection = Math.max(maxCorrection, Math.abs(warp.to[i] - warp.from[i]));
  }

  return {
    lines: out,
    anchors,
    maxAppliedCorrectionSec: round3(maxCorrection),
    residualConstantSec: Number(median.toFixed(3)),
    applied: true,
  };
}

/** Builds a strictly monotone piecewise-linear warp from detected→target pairs. */
export function buildTimeWarp(
  anchors: Array<{ detected: number; target: number }>,
  opts: Pick<DriftCorrectionOptions, 'maxCorrectionSec'> = {}
): TimeWarp {
  const maxShift = opts.maxCorrectionSec ?? DEFAULTS.maxCorrectionSec;
  const from: number[] = [0];
  const to: number[] = [0];

  for (const a of anchors) {
    const shift = a.target - a.detected;
    if (Math.abs(shift) < 1e-6) continue;
    const clamped = Math.max(-maxShift, Math.min(maxShift, shift));
    from.push(a.detected);
    to.push(a.detected + clamped);
  }

  for (let i = 1; i < from.length; i++) {
    if (from[i] <= from[i - 1]) from[i] = from[i - 1] + 0.001;
    if (to[i] <= to[i - 1]) to[i] = to[i - 1] + 0.001;
  }

  return { from, to };
}

/** Maps one timestamp through the warp; the tail continues at slope 1 so the
 * mapping stays monotone and the shift stays bounded by the last anchor's. */
export function warpTime(warp: TimeWarp, t: number): number {
  if (warp.from.length < 2) return t;
  const last = warp.from.length - 1;
  if (t >= warp.from[last]) return warp.to[last] + (t - warp.from[last]);
  if (t <= warp.from[0]) {
    return Math.max(0, t + (warp.to[0] - warp.from[0]));
  }
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (warp.from[mid] <= t) lo = mid;
    else hi = mid;
  }
  const f0 = warp.from[lo];
  const f1 = warp.from[hi];
  const alpha = f1 === f0 ? 0 : (t - f0) / (f1 - f0);
  return warp.to[lo] + alpha * (warp.to[hi] - warp.to[lo]);
}

/** Applies a warp to every line and word, re-enforcing monotonicity. */
export function applyWarp(lines: LyricLine[], warp: TimeWarp): LyricLine[] {
  let prevEnd = 0;
  return lines.map((line) => {
    const words = line.words?.map<Word>((w) => {
      let start = Math.max(0, warpTime(warp, w.startTime));
      let end = warpTime(warp, w.endTime);
      if (end <= start) end = start + 0.05;
      if (start < prevEnd) start = prevEnd;
      if (end <= start) end = start + 0.05;
      return { ...w, startTime: round3(start), endTime: round3(end) };
    });

    let start = line.startTime;
    let end = line.endTime;
    if (start !== null) start = Math.max(0, warpTime(warp, start));
    if (end !== null) end = Math.max(0, warpTime(warp, end));
    if (start !== null && start < prevEnd) start = round3(prevEnd);
    if (end !== null && start !== null && end <= start) end = round3(start + 0.05);
    if (words && words.length > 0 && start === null) start = round3(words[0].startTime);
    if (words && words.length > 0 && end === null) end = round3(words[words.length - 1].endTime);
    prevEnd = end ?? start ?? prevEnd;

    return { ...line, startTime: start, endTime: end, words };
  });
}

function round3(n: number): number {
  return Number(n.toFixed(3));
}
