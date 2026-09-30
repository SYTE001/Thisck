import type { AlignerWorkerRequest, AlignerWorkerResponse } from './aligner-protocol';
import type { RecognizedWord } from './text-matcher';

/**
 * AI ALIGNMENT PROVIDER (PRD Module 2)
 *
 * Manages the two ways to obtain word-level timestamps:
 *
 *   • Local Worker Mode (default, on-device, zero-backend): Whisper via
 *     transformers.js inside a Web Worker.
 *   • API Mode (optional, fast, bring-your-own-key): OpenAI / Groq
 *     `v1/audio/transcriptions` with `timestamp_granularities=word`.
 *
 * Both return the same normalised `RecognizedWord[]`.
 */

export type AlignerEngine = 'local' | 'api';
export type ApiProvider = 'openai' | 'groq';

export interface AlignerProgress {
  /** 0..1 */
  progress: number;
  stage: string;
}

export interface LocalAlignerParams {
  engine: 'local';
  /** 16 kHz mono PCM. */
  pcm: Float32Array;
  sampleRate: number;
  language?: string;
}

export interface ApiAlignerParams {
  engine: 'api';
  provider: ApiProvider;
  apiKey: string;
  /** The original encoded audio file/blob to upload. */
  audioFile: Blob;
  fileName?: string;
  language?: string;
}

export type AlignerParams = (LocalAlignerParams | ApiAlignerParams) & {
  onProgress?: (p: AlignerProgress) => void;
  signal?: AbortSignal;
};

// transformers.js runtime + model used by the local worker.
export const TRANSFORMERS_RUNTIME_URL =
  'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.0';
export const LOCAL_MODEL_ID = 'onnx-community/whisper-base';

const API_ENDPOINTS: Record<ApiProvider, { url: string; model: string }> = {
  openai: { url: 'https://api.openai.com/v1/audio/transcriptions', model: 'whisper-1' },
  groq: { url: 'https://api.groq.com/openai/v1/audio/transcriptions', model: 'whisper-large-v3' },
};

/** Top-level entry: recognise word-level timestamps with the chosen engine. */
export async function recognizeWords(params: AlignerParams): Promise<RecognizedWord[]> {
  if (params.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return params.engine === 'api' ? recognizeViaApi(params) : recognizeViaWorker(params);
}

// ─── Local Worker Mode ───────────────────────────────────────────────────────

function recognizeViaWorker(params: LocalAlignerParams & AlignerParams): Promise<RecognizedWord[]> {
  const { pcm, sampleRate, language, onProgress, signal } = params;

  return new Promise<RecognizedWord[]>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./worker/aligner.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }

    const cleanup = () => {
      worker.terminate();
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };
    if (signal) {
      if (signal.aborted) {
        worker.terminate();
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', onAbort);
    }

    worker.onmessage = (event: MessageEvent<AlignerWorkerResponse>) => {
      const msg = event.data;
      if (msg.type === 'progress') {
        onProgress?.({ progress: msg.progress, stage: msg.stage });
      } else if (msg.type === 'result') {
        cleanup();
        resolve(msg.words);
      } else if (msg.type === 'error') {
        cleanup();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = (e) => {
      cleanup();
      reject(new Error(e.message || 'Speech worker crashed.'));
    };

    const req: AlignerWorkerRequest = {
      type: 'transcribe',
      pcm,
      sampleRate,
      model: LOCAL_MODEL_ID,
      runtimeUrl: TRANSFORMERS_RUNTIME_URL,
      language,
    };
    // Transfer the PCM buffer to avoid copying megabytes of audio.
    worker.postMessage(req, [pcm.buffer]);
  });
}

// ─── API Mode (Bring-Your-Own-Key) ───────────────────────────────────────────

interface VerboseJsonWord {
  word: string;
  start: number;
  end: number;
}

async function recognizeViaApi(params: ApiAlignerParams & AlignerParams): Promise<RecognizedWord[]> {
  const { provider, apiKey, audioFile, fileName, language, onProgress, signal } = params;
  const endpoint = API_ENDPOINTS[provider];
  if (!apiKey) throw new Error(`An API key is required for ${provider} transcription.`);

  onProgress?.({ progress: 0.2, stage: 'Uploading audio to transcription API...' });

  const form = new FormData();
  form.append('file', audioFile, fileName || 'audio.mp3');
  form.append('model', endpoint.model);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  if (language) form.append('language', language);

  let response: Response;
  try {
    response = await fetch(endpoint.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw new Error(`Could not reach the transcription API: ${(err as Error).message}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Transcription API returned ${response.status}. ${detail.slice(0, 200)}`);
  }

  onProgress?.({ progress: 0.8, stage: 'Parsing transcription...' });
  const data = (await response.json()) as { words?: VerboseJsonWord[] };
  const words = data.words ?? [];
  if (words.length === 0) {
    throw new Error('The API response contained no word-level timestamps.');
  }

  return words
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end))
    .map((w) => ({ word: String(w.word).trim(), start: w.start, end: w.end }))
    .filter((w) => w.word.length > 0);
}
