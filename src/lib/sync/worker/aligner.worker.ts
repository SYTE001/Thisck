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
 *
 * Timestamp strategy (in order of preference):
 *   1. Word-level  – return_timestamps: 'word'  (requires a _timestamped model
 *      variant that exports cross-attention heads, e.g. whisper-base_timestamped).
 *   2. Segment-level – return_timestamps: true  (always works as a fallback;
 *      each segment is split into per-word tokens with uniform timing).
 *
 * The worker never surfaces raw ONNX / library error strings to the user;
 * all errors are translated into human-readable messages.
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function chunksToWords(chunks: AsrChunk[]): RecognizedWord[] {
  return chunks
    .filter((c) => Array.isArray(c.timestamp) && c.timestamp[0] != null)
    .map((c) => {
      const start = Number(c.timestamp![0]) || 0;
      const end   = Number(c.timestamp![1] ?? c.timestamp![0]) || start + 0.05;
      return { word: String(c.text ?? '').trim(), start, end };
    })
    .filter((w) => w.word.length > 0);
}

/** Expand segment-level chunks into per-word tokens (uniform distribution). */
function segmentChunksToWords(chunks: AsrChunk[]): RecognizedWord[] {
  const words: RecognizedWord[] = [];
  for (const c of chunks) {
    if (!Array.isArray(c.timestamp) || c.timestamp[0] == null) continue;
    const segStart = Number(c.timestamp[0]) || 0;
    const segEnd   = Number(c.timestamp[1] ?? c.timestamp[0]) || segStart + 0.3;
    const rawText  = String(c.text ?? '').trim();
    if (!rawText) continue;
    const tokens = rawText.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const step = (segEnd - segStart) / tokens.length;
    tokens.forEach((tok, idx) => {
      words.push({ word: tok, start: segStart + step * idx, end: segStart + step * (idx + 1) });
    });
  }
  return words;
}

function isCrossAttentionError(msg: string): boolean {
  return (
    /cross.?attention/i.test(msg) ||
    /output_attentions/i.test(msg) ||
    /alignment.?head/i.test(msg) ||
    /must contain cross/i.test(msg)
  );
}

function friendlyError(raw: string): string {
  if (isCrossAttentionError(raw)) {
    return (
      'The speech model does not support word-level timestamps. ' +
      'Use onnx-community/whisper-base_timestamped or switch to API mode.'
    );
  }
  if (/out of memory|OOM/i.test(raw)) {
    return 'Not enough memory to run the speech model. Try closing other tabs and retry.';
  }
  if (/webassembly|wasm/i.test(raw)) {
    return 'WebAssembly failed to initialise. Reload the page and try again.';
  }
  if (/fetch|network|cdn/i.test(raw)) {
    return 'Could not download the speech model. Check your internet connection and try again.';
  }
  return raw;
}

// ─── Transcription ────────────────────────────────────────────────────────────

async function transcribe(req: AlignerWorkerRequest): Promise<RecognizedWord[]> {
  await loadPipeline(req.runtimeUrl, req.model);
  post({ type: 'progress', progress: 0.55, stage: 'Analyzing vocal waveforms...' });

  const baseOpts = {
    chunk_length_s: 30,
    stride_length_s: 5,
    ...(req.language ? { language: req.language } : {}),
  };

  // ── [A] Word-level timestamps (requires _timestamped model variant) ──────────
  try {
    const result = (await asrPipeline!(req.pcm, {
      ...baseOpts,
      return_timestamps: 'word',
    })) as { chunks?: AsrChunk[] };
    return chunksToWords(result?.chunks ?? []);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!isCrossAttentionError(msg)) throw err;  // real error — propagate
    // Cross-attention not available → fall through to segment fallback.
  }

  // ── [B] Segment-level fallback (always supported) ────────────────────────────
  post({ type: 'progress', progress: 0.6, stage: 'Analyzing audio (segment mode)...' });
  const segResult = (await asrPipeline!(req.pcm, {
    ...baseOpts,
    return_timestamps: true,
  })) as { chunks?: AsrChunk[] };
  return segmentChunksToWords(segResult?.chunks ?? []);
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
      const raw = err instanceof Error ? err.message : String(err);
      post({ type: 'error', message: friendlyError(raw) });
    }
  })();
};
