import type { RecognizedWord } from './text-matcher';

/**
 * Message protocol shared between the AI aligner adapter (main thread) and the
 * Whisper Web Worker. Kept in its own module so both sides import the same
 * contract without pulling in each other's runtime code.
 */

export interface AlignerWorkerRequest {
  type: 'transcribe';
  /** 16 kHz mono PCM. Transferred (zero-copy) via its ArrayBuffer. */
  pcm: Float32Array;
  sampleRate: number;
  /** transformers.js model id, e.g. onnx-community/whisper-base. */
  model: string;
  /** ES module URL for the transformers.js runtime (loaded at runtime). */
  runtimeUrl: string;
  /** Optional forced language; omitted for auto-detection. */
  language?: string;
}

export type AlignerWorkerResponse =
  | { type: 'progress'; progress: number; stage: string }
  | { type: 'result'; words: RecognizedWord[] }
  | { type: 'error'; message: string };
