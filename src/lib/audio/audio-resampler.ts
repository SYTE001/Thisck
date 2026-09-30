/**
 * AUDIO PREPROCESSOR (PRD Module 1)
 *
 * Prepares an arbitrary audio input for a Whisper / Wav2Vec speech engine:
 *   • Decodes the file into an AudioBuffer.
 *   • Downmixes every channel to a single Mono channel.
 *   • Resamples to 16 000 Hz (the fixed input rate Whisper expects).
 *   • Returns the raw Float32Array PCM.
 *
 * The Float32Array is transferable, so callers can hand its `.buffer` straight
 * to a Web Worker with zero copy.
 */

export const WHISPER_SAMPLE_RATE = 16000 as const;

type OfflineCtor = typeof OfflineAudioContext;

function getOfflineAudioContext(): OfflineCtor {
  const ctor =
    (globalThis as unknown as { OfflineAudioContext?: OfflineCtor }).OfflineAudioContext ??
    (globalThis as unknown as { webkitOfflineAudioContext?: OfflineCtor }).webkitOfflineAudioContext;
  if (!ctor) {
    throw new Error('OfflineAudioContext is not available in this browser.');
  }
  return ctor;
}

function getAudioContextCtor(): typeof AudioContext {
  const ctor =
    (globalThis as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!ctor) {
    throw new Error('AudioContext is not available in this browser.');
  }
  return ctor;
}

/** Decodes encoded audio bytes into an AudioBuffer. */
async function decodeToAudioBuffer(bytes: ArrayBuffer): Promise<AudioBuffer> {
  const Ctor = getAudioContextCtor();
  const ctx = new Ctor();
  try {
    // decodeAudioData detaches the ArrayBuffer on some engines, so pass a copy.
    return await ctx.decodeAudioData(bytes.slice(0));
  } finally {
    // Free the hardware context; we only needed the decoder.
    void ctx.close?.();
  }
}

/**
 * Downmixes to mono and resamples to 16 kHz using an OfflineAudioContext so the
 * browser's own high-quality resampler does the work.
 */
export async function resampleToMono16k(buffer: AudioBuffer): Promise<Float32Array> {
  const targetRate = WHISPER_SAMPLE_RATE;

  // Already mono @ 16k — nothing to do beyond a copy.
  if (buffer.numberOfChannels === 1 && buffer.sampleRate === targetRate) {
    return new Float32Array(buffer.getChannelData(0));
  }

  const durationSec = buffer.length / buffer.sampleRate;
  const frameCount = Math.max(1, Math.ceil(durationSec * targetRate));

  let OfflineCtx: OfflineCtor;
  try {
    OfflineCtx = getOfflineAudioContext();
  } catch {
    // Environments without OfflineAudioContext (e.g. some workers) fall back to
    // a manual linear resample so the pipeline still functions.
    return manualResampleToMono16k(buffer);
  }

  const offline = new OfflineCtx(1, frameCount, targetRate);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination); // routing through 1-channel destination downmixes to mono
  source.start(0);

  const rendered = await offline.startRendering();
  return new Float32Array(rendered.getChannelData(0));
}

/** CPU-only fallback: average channels, then linearly resample to 16 kHz. */
function manualResampleToMono16k(buffer: AudioBuffer): Float32Array {
  const targetRate = WHISPER_SAMPLE_RATE;
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;

  const mono = new Float32Array(frames);
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < frames; i++) mono[i] += data[i] / channels;
  }

  if (buffer.sampleRate === targetRate) return mono;

  const ratio = buffer.sampleRate / targetRate;
  const outLength = Math.max(1, Math.floor(frames / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    out[i] = mono[idx] * (1 - frac) + (mono[idx + 1] ?? mono[idx]) * frac;
  }
  return out;
}

/**
 * Prepares any supported audio input for the speech engine and returns 16 kHz
 * mono PCM. Accepts a File/Blob, raw encoded bytes, or an already-decoded
 * AudioBuffer (the app decodes uploads once, so passing the buffer avoids a
 * second decode).
 */
export async function prepareAudioForWhisper(
  input: File | Blob | ArrayBuffer | AudioBuffer
): Promise<Float32Array> {
  if (typeof AudioBuffer !== 'undefined' && input instanceof AudioBuffer) {
    return resampleToMono16k(input);
  }

  let bytes: ArrayBuffer;
  if (input instanceof ArrayBuffer) {
    bytes = input;
  } else if (typeof Blob !== 'undefined' && input instanceof Blob) {
    bytes = await input.arrayBuffer();
  } else {
    throw new Error('Unsupported audio input for prepareAudioForWhisper.');
  }

  const decoded = await decodeToAudioBuffer(bytes);
  return resampleToMono16k(decoded);
}
