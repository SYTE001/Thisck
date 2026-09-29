import type { LyricLine } from '../../types/lyrics';
import type { AlignedWord } from './auto-arrange';

/**
 * AUDIO SYNC — optional, advanced, OFFLINE-FIRST.
 *
 * Uses a Whisper-class model via transformers.js, loaded lazily on first use so
 * neither the model weights nor the runtime ever enter the main bundle.
 *
 * IMPORTANT: this is entirely optional. Smart Split works with no audio at all,
 * and the existing energy-based auto-sync in audioManager is left untouched.
 */

export interface AudioSyncProgress {
  /** 0..1 */
  progress: number;
  status: string;
}

export interface AudioSyncOptions {
  lines: LyricLine[];
  audioBuffer: AudioBuffer;
  onProgress?: (p: AudioSyncProgress) => void;
  signal?: AbortSignal;
}

const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0';
const MODEL_ID = 'onnx-community/whisper-base';

/** Downmixes and resamples an AudioBuffer to the 16kHz mono the model expects. */
export function toMono16k(buffer: AudioBuffer): Float32Array {
  const targetRate = 16000;
  const channels = buffer.numberOfChannels;
  const srcRate = buffer.sampleRate;
  const frames = buffer.length;

  // Downmix to mono.
  const mono = new Float32Array(frames);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < frames; i++) mono[i] += data[i] / channels;
  }

  if (srcRate === targetRate) return mono;

  // Linear resample.
  const ratio = srcRate / targetRate;
  const outLength = Math.floor(frames / ratio);
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    out[i] = mono[idx] * (1 - frac) + (mono[idx + 1] ?? mono[idx]) * frac;
  }
  return out;
}

function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9']/g, '');
}

export interface RawWord {
  text: string;
  start: number;
  end: number;
  confidence?: number;
}

/**
 * Aligns recognised words to LRC cues.
 *
 * Recognition rarely matches the LRC character-for-character, so each word is
 * placed by TIME rather than by text: it is assigned to the cue whose window
 * contains its midpoint. A cue that receives no words cannot be aligned, so it
 * is reported for fallback to the plain Smart Split result.
 */
export function alignWordsToLines(rawWords: RawWord[], lines: LyricLine[]): {
  words: AlignedWord[];
  lowConfidenceLineIds: string[];
} {
  const timed = lines.filter((l) => l.startTime !== null);
  const words: AlignedWord[] = [];
  const lowConfidenceLineIds: string[] = [];

  for (const rw of rawWords) {
    if (!normalizeWord(rw.text)) continue;
    const mid = (rw.start + rw.end) / 2;

    const host = timed.find(
      (l) => mid >= (l.startTime as number) && mid <= (l.endTime ?? (l.startTime as number) + 4.5)
    );
    if (!host) continue;

    words.push({
      text: rw.text,
      startTime: rw.start,
      endTime: rw.end,
      confidence: rw.confidence ?? 0.8,
      sourceLineId: host.id,
    });
  }

  for (const l of timed) {
    if (!words.some((w) => w.sourceLineId === l.id)) lowConfidenceLineIds.push(l.id);
  }

  words.sort((a, b) => a.startTime - b.startTime);
  return { words, lowConfidenceLineIds };
}

/**
 * Transcribes with word-level timestamps.
 *
 * The heavy runtime is pulled in through a dynamic CDN import, so it is fetched
 * only when the user actually runs Audio Sync and never lands in the app bundle.
 */
export async function transcribeWords(
  audioBuffer: AudioBuffer,
  options: { onProgress?: (p: AudioSyncProgress) => void; signal?: AbortSignal } = {}
): Promise<RawWord[]> {
  const { onProgress, signal } = options;
  if (signal?.aborted) throw new Error('cancelled');

  onProgress?.({ progress: 0.05, status: 'Preparing audio...' });
  const pcm = toMono16k(audioBuffer);

  onProgress?.({ progress: 0.15, status: 'Loading model (first run downloads it)...' });

  let pipeline: (audio: Float32Array, opts?: unknown) => Promise<any>;
  try {
    const mod: any = await import(/* @vite-ignore */ `${TRANSFORMERS_CDN}`);
    if (signal?.aborted) throw new Error('cancelled');
    pipeline = await mod.pipeline('automatic-speech-recognition', MODEL_ID, {
      dtype: 'q8',
      progress_callback: (p: any) => {
        if (p?.status === 'progress' && typeof p.progress === 'number') {
          onProgress?.({
            progress: 0.15 + (p.progress / 100) * 0.35,
            status: 'Downloading model...',
          });
        }
      },
    });
  } catch (err: any) {
    if (signal?.aborted) throw err;
    throw new Error(
      `Could not load the speech model (you may be offline). ${err?.message ?? ''}`.trim()
    );
  }

  if (signal?.aborted) throw new Error('cancelled');
  onProgress?.({ progress: 0.55, status: 'Transcribing...' });

  const result: any = await pipeline(pcm, { return_timestamps: 'word', chunk_length_s: 30 });
  if (signal?.aborted) throw new Error('cancelled');

  onProgress?.({ progress: 0.95, status: 'Aligning to lyrics...' });

  const chunks: any[] = result?.chunks ?? [];
  return chunks
    .filter((c) => Array.isArray(c.timestamp) && c.timestamp[0] != null)
    .map((c) => ({
      text: String(c.text ?? '').trim(),
      start: Number(c.timestamp[0]) || 0,
      end: Number(c.timestamp[1] ?? c.timestamp[0]) || 0,
    }))
    .filter((w) => w.text.length > 0);
}

/** Full Audio Sync stage: transcribe, align, then let the caller run Auto Arrange. */
export async function runAudioSync(
  options: AudioSyncOptions
): Promise<{ words: AlignedWord[]; lowConfidenceLineIds: string[] }> {
  const { lines, audioBuffer, onProgress, signal } = options;
  const raw = await transcribeWords(audioBuffer, { onProgress, signal });
  onProgress?.({ progress: 1, status: 'Done' });
  return alignWordsToLines(raw, lines);
}
