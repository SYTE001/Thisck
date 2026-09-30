/// <reference lib="webworker" />
import type { AlignerWorkerRequest, AlignerWorkerResponse } from '../aligner-protocol';
import type { RecognizedWord } from '../text-matcher';

/**
 * WHISPER ALIGNMENT WEB WORKER (PRD Module 2, Local Worker Mode)
 *
 * Runs Automatic Speech Recognition with word-level timestamps entirely
 * off the UI thread. The transformers.js runtime is imported at runtime from
 * a CDN URL supplied by the caller, so the heavy weights and runtime never
 * enter the app bundle and are fetched only when the user runs Auto Sync.
 */

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function post(msg: AlignerWorkerResponse, transfer?: Transferable[]): void {
  if (transfer) ctx.postMessage(msg, transfer);
  else ctx.postMessage(msg);
}

interface AsrChunk {
  text?: string;
  timestamp?: [number | null, number | null];
}

let asrPipeline: ((audio: Float32Array, opts?: unknown) => Promise<unknown>) | null = null;

async function loadPipeline(runtimeUrl: string, model: string): Promise<void> {
  if (asrPipeline) return;
  post({ type: 'progress', progress: 0.15, stage: 'Loading speech model...' });

  const mod = (await import(/* @vite-ignore */ runtimeUrl)) as {
    pipeline: (task: string, model: string, opts?: unknown) => Promise<unknown>;
  };

  asrPipeline = (await mod.pipeline('automatic-speech-recognition', model, {
    dtype: 'q8',
    progress_callback: (p: { status?: string; progress?: number }) => {
      if (p?.status === 'progress' && typeof p.progress === 'number') {
        post({
          type: 'progress',
          progress: 0.15 + (p.progress / 100) * 0.35,
          stage: 'Downloading model weights...',
        });
      }
    },
  })) as (audio: Float32Array, opts?: unknown) => Promise<unknown>;
}

async function transcribe(req: AlignerWorkerRequest): Promise<RecognizedWord[]> {
  await loadPipeline(req.runtimeUrl, req.model);
  post({ type: 'progress', progress: 0.55, stage: 'Analyzing vocal waveforms...' });

  const result = (await asrPipeline!(req.pcm, {
    return_timestamps: 'word',
    chunk_length_s: 30,
    stride_length_s: 5,
    ...(req.language ? { language: req.language } : {}),
  })) as { chunks?: AsrChunk[] };

  const chunks = result?.chunks ?? [];
  return chunks
    .filter((c) => Array.isArray(c.timestamp) && c.timestamp[0] != null)
    .map((c) => {
      const start = Number(c.timestamp![0]) || 0;
      const end = Number(c.timestamp![1] ?? c.timestamp![0]) || start;
      return { word: String(c.text ?? '').trim(), start, end };
    })
    .filter((w) => w.word.length > 0);
}

ctx.onmessage = (event: MessageEvent<AlignerWorkerRequest>) => {
  const req = event.data;
  if (req?.type !== 'transcribe') return;

  void (async () => {
    try {
      const words = await transcribe(req);
      post({ type: 'progress', progress: 0.9, stage: 'Building word timestamps...' });
      post({ type: 'result', words });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      post({ type: 'error', message });
    }
  })();
};
