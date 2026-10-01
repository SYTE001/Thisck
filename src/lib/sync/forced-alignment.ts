import type { LyricLine } from '../../types/lyrics';
import { prepareAudioForWhisper, WHISPER_SAMPLE_RATE } from '../audio/audio-resampler';
import {
  recognizeWords,
  type AlignerEngine,
  type ApiProvider,
  type LocalAlignerParams,
  type ApiAlignerParams,
  LOCAL_MODEL_ID,
} from './ai-aligner';
import { alignLyricsWithTranscription } from './text-matcher';
import { correctDrift, type DriftAnchor } from './drift-corrector';
import { validateSyncDraft, type SyncValidationResult } from './sync-validator';
import {
  getCachedTranscription,
  setCachedTranscription,
  transcriptionCacheKey,
} from './sync-cache';

/**
 * FORCED ALIGNMENT ORCHESTRATOR (PRD Sections 7, 18, 19)
 *
 * The single entry point the UI calls for full-auto lyrics sync. Produces a
 * SYNC DRAFT — it never mutates the project timeline; the user reviews the
 * draft and applies it explicitly (PRD §18).
 *
 *   [1/5] Audio Preparation   → 16 kHz mono PCM        (preparing)
 *   [2/5] ASR                 → word-level timestamps  (transcribing)
 *                                   ↑ transcription cache (PRD §21)
 *   [3/5] Sequence Alignment  → original text + timings (aligning)
 *   [4/5] Drift Correction    → piecewise time warp     (correcting_drift)
 *   [5/5] Validation          → actionable issues       (validating)
 *
 * Cancellation is honoured at every await boundary via AbortSignal; nothing is
 * written to project state on abort, so the previous timeline is untouched.
 */

export type SyncStage =
  | 'preparing'
  | 'transcribing'
  | 'aligning'
  | 'correcting_drift'
  | 'validating'
  | 'ready'
  | 'cancelled'
  | 'error';

export interface ForcedAlignmentProgress {
  /** 0..1 overall progress across all five stages. */
  percent: number;
  /** Stable machine-readable stage (PRD §19 state names). */
  stage: SyncStage;
  /** Human-readable stage description for the progress dialog. */
  message: string;
}

export interface ForcedAlignmentParams {
  /** Source lyric lines; only their text + prior timing are used. */
  lines: LyricLine[];
  audioBuffer: AudioBuffer;
  /** Original encoded file — required only for API mode. */
  audioFile?: Blob | null;
  fileName?: string;
  engine?: AlignerEngine;
  apiProvider?: ApiProvider;
  apiKey?: string;
  language?: string;
  /** Global offset fine-tune applied on top of the aligned times (seconds). */
  globalOffsetSec?: number;
  /** Set false to skip the transcription cache (default true). */
  useCache?: boolean;
  onProgress?: (p: ForcedAlignmentProgress) => void;
  signal?: AbortSignal;
}

export interface SyncDraftStats {
  lineCount: number;
  timedLineCount: number;
  recognizedWordCount: number;
  matchedWordCount: number;
  matchRate: number;
  highConfidenceLines: number;
  needsReviewLineCount: number;
}

export interface SyncDraft {
  lines: LyricLine[];
  overallConfidence: number;
  stats: SyncDraftStats;
  validation: SyncValidationResult;
  warnings: string[];
  /** 'word_alignment' | 'word_alignment+drift' | 'distributed'. */
  method: string;
  engine: AlignerEngine;
  cached: boolean;
  /** Max |correction| the drift warp applied (0 when skipped). */
  driftCorrectionSec: number;
  createdAt: number;
}

export interface ForcedAlignmentResult extends SyncDraft {
  lowConfidenceLineIds: string[];
  /** Auto-extracted anchors (prior↔aligned pairs) used by drift correction. */
  anchors: DriftAnchor[];
}

const LOW_CONFIDENCE_THRESHOLD = 0.5;

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
}

export async function runForcedAlignment(
  params: ForcedAlignmentParams
): Promise<ForcedAlignmentResult> {
  const {
    lines,
    audioBuffer,
    audioFile,
    fileName,
    engine = 'local',
    apiProvider = 'openai',
    apiKey,
    language,
    globalOffsetSec = 0,
    useCache = true,
    onProgress,
    signal,
  } = params;

  const progress = (percent: number, stage: SyncStage, message: string) =>
    onProgress?.({ percent, stage, message });

  const warnings: string[] = [];

  // ── [1/5] Preparing audio (16 kHz) ──────────────────────────────────────────
  assertNotAborted(signal);
  progress(0.02, 'preparing', 'Preparing audio (16 kHz mono)...');
  const pcm = await prepareAudioForWhisper(audioBuffer);
  assertNotAborted(signal);

  // ── [2/5] Transcribing (cached when possible) ───────────────────────────────
  progress(0.1, 'transcribing', 'Analyzing vocals...');
  const cacheKey = useCache
    ? transcriptionCacheKey({
        pcm,
        sampleRate: WHISPER_SAMPLE_RATE,
        provider: engine,
        model: engine === 'api' ? `${apiProvider}` : LOCAL_MODEL_ID,
        language,
      })
    : null;
  let cached = false;
  let recognized;
  if (cacheKey) recognized = getCachedTranscription(cacheKey);
  if (recognized) {
    cached = true;
    progress(0.6, 'transcribing', 'Using cached transcription...');
  } else {
    // Map the engine's 0..1 onto the 0.10..0.70 slice of the overall bar.
    const mapStage2 = (p: { progress: number; stage: string }) => {
      progress(
        0.1 + Math.min(1, Math.max(0, p.progress)) * 0.6,
        'transcribing',
        p.stage
      );
    };

    const asrParams: LocalAlignerParams | ApiAlignerParams =
      engine === 'api'
      ? (() => {
          if (!audioFile)
            throw new Error('API mode needs the original audio file. Re-link the audio.');
          return {
            engine: 'api',
            provider: apiProvider,
            apiKey: apiKey ?? '',
            audioFile,
            fileName,
            language,
          };
        })()
      : { engine: 'local', pcm, sampleRate: WHISPER_SAMPLE_RATE, language };

    recognized = await recognizeWords({ ...asrParams, onProgress: mapStage2, signal });
    if (cacheKey) setCachedTranscription(cacheKey, recognized);
  }
  assertNotAborted(signal);

  // ── [3/5] Aligning lyrics ───────────────────────────────────────────────────
  progress(0.72, 'aligning', 'Matching lyrics to the audio...');
  const rawLines = lines.map((l) => l.text ?? '');
  const aligned = alignLyricsWithTranscription(rawLines, recognized, {
    audioDurationSec: audioBuffer.duration,
  });

  if (recognized.length === 0) {
    warnings.push('No words were recognised in the audio — timing was estimated by distribution.');
  }
  assertNotAborted(signal);

  // ── [4/5] Correcting drift ──────────────────────────────────────────────────
  progress(0.85, 'correcting_drift', 'Correcting timing drift...');
  // Preserve original line ids FIRST so drift anchors can pair the aligned
  // lines with their prior (LRC) timings.
  const merged: LyricLine[] = aligned.map((a, i) => {
    const src = lines[i];
    if (!src) return a;
    return {
      ...a,
      id: src.id,
      customStyleSeed: src.customStyleSeed,
      sourceFormat: src.sourceFormat,
      originalText: src.originalText ?? a.originalText,
      type: src.type ?? a.type,
    };
  });

  let driftCorrectionSec = 0;
  let anchors: DriftAnchor[] = [];
  let corrected = merged;
  try {
    const drift = correctDrift(merged, lines);
    corrected = drift.lines;
    anchors = drift.anchors;
    if (drift.applied) {
      driftCorrectionSec = drift.maxAppliedCorrectionSec;
    } else if (drift.skippedReason === 'no-progressive-drift' && drift.residualConstantSec !== 0) {
      warnings.push(
        `Timing shows a constant offset of about ${Math.round(drift.residualConstantSec * 1000)} ms — use Global Offset to fine-tune.`
      );
    }
  } catch {
    warnings.push('Drift correction was skipped (internal error); timings are uncorrected.');
  }

  // Global offset is a fine-tune, never the drift solution (PRD §15): it is
  // applied AFTER the warp and only when the user asked for it.
  if (globalOffsetSec !== 0) {
    corrected = applyGlobalOffset(corrected, globalOffsetSec);
  }
  assertNotAborted(signal);

  // ── [5/5] Validating ────────────────────────────────────────────────────────
  progress(0.93, 'validating', 'Validating the sync result...');
  const validation = validateSyncDraft({
    lines: corrected,
    originalLines: lines,
    audioDurationSec: audioBuffer.duration,
  });
  validation.errors.forEach((e) => warnings.push(e.message));
  validation.warnings.slice(0, 5).forEach((w) => warnings.push(w.message));

  // ── Draft assembly ──────────────────────────────────────────────────────────
  const timed = corrected.filter((l) => l.startTime !== null);
  const overallConfidence =
    timed.length > 0
      ? Number((timed.reduce((s, l) => s + (l.confidence ?? 0), 0) / timed.length).toFixed(2))
      : 0;
  const lowConfidenceLineIds = timed
    .filter((l) => (l.confidence ?? 0) < LOW_CONFIDENCE_THRESHOLD)
    .map((l) => l.id);

  const matchedWordCount = timed.reduce(
    (s, l) => s + (l.words?.filter((w) => w.timingSource === 'matched').length ?? 0),
    0
  );
  const totalWords = timed.reduce((s, l) => s + (l.words?.length ?? 0), 0);
  const highConfidenceLines = timed.filter((l) => (l.confidence ?? 0) >= LOW_CONFIDENCE_THRESHOLD).length;

  const method =
    recognized.length === 0
      ? 'distributed'
      : driftCorrectionSec > 0
        ? 'word_alignment+drift'
        : 'word_alignment';

  progress(1, 'ready', 'Sync draft ready for review.');
  return {
    lines: corrected,
    overallConfidence,
    stats: {
      lineCount: lines.length,
      timedLineCount: timed.length,
      recognizedWordCount: recognized.length,
      matchedWordCount,
      matchRate: totalWords > 0 ? Number((matchedWordCount / totalWords).toFixed(3)) : 0,
      highConfidenceLines,
      needsReviewLineCount: lowConfidenceLineIds.length,
    },
    validation,
    warnings,
    method,
    engine,
    cached,
    driftCorrectionSec,
    createdAt: Date.now(),
    lowConfidenceLineIds,
    anchors,
  };
}

/** Applies a global offset (seconds) to all line and word timestamps. */
export function applyGlobalOffset(lines: LyricLine[], offsetSec: number): LyricLine[] {
  let prevEnd = 0;
  return lines.map((line) => {
    const words = line.words?.map((w) => {
      let start = Math.max(0, w.startTime + offsetSec);
      let end = Math.max(0, w.endTime + offsetSec);
      if (end <= start) end = start + 0.05;
      if (start < prevEnd) start = prevEnd;
      if (end <= start) end = start + 0.05;
      return { ...w, startTime: Number(start.toFixed(3)), endTime: Number(end.toFixed(3)) };
    });
    let start = line.startTime;
    let end = line.endTime;
    if (start !== null) start = Math.max(0, start + offsetSec);
    if (end !== null) end = Math.max(0, end + offsetSec);
    if (start !== null && start < prevEnd) start = prevEnd;
    if (end !== null && start !== null && end <= start) end = start + 0.05;
    prevEnd = end ?? start ?? prevEnd;
    return { ...line, startTime: start, endTime: end, words };
  });
}
