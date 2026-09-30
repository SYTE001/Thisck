import type { LyricLine } from '../../types/lyrics';
import { prepareAudioForWhisper, WHISPER_SAMPLE_RATE } from '../audio/audio-resampler';
import { recognizeWords, type AlignerEngine, type ApiProvider } from './ai-aligner';
import { alignLyricsWithTranscription } from './text-matcher';

/**
 * FORCED ALIGNMENT ORCHESTRATOR (PRD Section 5)
 *
 * The single entry point the UI calls for full-auto lyrics sync. It chains the
 * three functional modules end to end:
 *
 *   [1/3] Audio Preprocessor  -> 16 kHz mono PCM
 *   [2/3] AI Alignment Engine -> word-level transcription (local worker or API)
 *   [3/3] Fuzzy Text Matcher  -> original lyric lines with per-word timestamps
 *
 * The user's original line ids and per-line metadata are preserved so the rest
 * of the app (selection, styling, export) keeps working against stable ids.
 */

export interface ForcedAlignmentProgress {
  /** 0..1 overall progress across all three stages. */
  percent: number;
  stage: string;
}

export interface ForcedAlignmentParams {
  /** Source lyric lines; only their text is used, timing is recomputed. */
  lines: LyricLine[];
  audioBuffer: AudioBuffer;
  /** Original encoded file — required only for API mode. */
  audioFile?: Blob | null;
  fileName?: string;
  engine?: AlignerEngine;
  apiProvider?: ApiProvider;
  apiKey?: string;
  language?: string;
  onProgress?: (p: ForcedAlignmentProgress) => void;
  signal?: AbortSignal;
}

export interface ForcedAlignmentResult {
  lines: LyricLine[];
  averageConfidence: number;
  lowConfidenceLineIds: string[];
  recognizedWordCount: number;
}

const LOW_CONFIDENCE = 0.5;

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
    onProgress,
    signal,
  } = params;

  const throwIfAborted = () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  };

  // ── [1/3] Preparing audio (16 kHz) ──────────────────────────────────────────
  throwIfAborted();
  onProgress?.({ percent: 0.02, stage: '[1/3] Preparing audio (16kHz)...' });
  const pcm = await prepareAudioForWhisper(audioBuffer);
  throwIfAborted();
  onProgress?.({ percent: 0.1, stage: '[2/3] Analyzing vocal waveforms & AI Alignment...' });

  // ── [2/3] AI alignment ──────────────────────────────────────────────────────
  const mapStage2 = (p: { progress: number; stage: string }) => {
    // Map the engine's 0..1 onto the 0.10..0.85 slice of the overall bar.
    onProgress?.({
      percent: 0.1 + Math.min(1, Math.max(0, p.progress)) * 0.75,
      stage: `[2/3] ${p.stage}`,
    });
  };

  let recognized;
  if (engine === 'api') {
    if (!audioFile) throw new Error('API mode needs the original audio file. Re-link the audio.');
    recognized = await recognizeWords({
      engine: 'api',
      provider: apiProvider,
      apiKey: apiKey ?? '',
      audioFile,
      fileName,
      language,
      onProgress: mapStage2,
      signal,
    });
  } else {
    recognized = await recognizeWords({
      engine: 'local',
      pcm,
      sampleRate: WHISPER_SAMPLE_RATE,
      language,
      onProgress: mapStage2,
      signal,
    });
  }
  throwIfAborted();

  // ── [3/3] Matching lyrics & building word timestamps ────────────────────────
  onProgress?.({ percent: 0.9, stage: '[3/3] Matching lyrics & building word timestamps...' });

  const rawLines = lines.map((l) => l.text ?? '');
  const aligned = alignLyricsWithTranscription(rawLines, recognized);

  // Preserve original line ids and per-line metadata; adopt the new timing.
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

  const timed = merged.filter((l) => l.startTime !== null);
  const averageConfidence =
    timed.length > 0
      ? Number(
          (timed.reduce((s, l) => s + (l.confidence ?? 0), 0) / timed.length).toFixed(2)
        )
      : 0;
  const lowConfidenceLineIds = timed
    .filter((l) => (l.confidence ?? 0) < LOW_CONFIDENCE)
    .map((l) => l.id);

  onProgress?.({ percent: 1, stage: 'Done' });
  return {
    lines: merged,
    averageConfidence,
    lowConfidenceLineIds,
    recognizedWordCount: recognized.length,
  };
}
