import { describe, it, expect } from 'vitest';
import {
  transcriptionCacheKey,
  getCachedTranscription,
  setCachedTranscription,
  clearTranscriptionCache,
} from '../sync/sync-cache';
import type { RecognizedWord } from '../sync/text-matcher';

/** PRD §21 — transcription cache keyed on audio identity + engine config. */

const pcmA = new Float32Array(4096).map((_, i) => Math.sin(i / 10));
const pcmB = new Float32Array(4096).map((_, i) => Math.sin(i / 5 + 1));

const sample: RecognizedWord[] = [{ word: 'hello', start: 1, end: 2, confidence: 0.9 }];

describe('transcriptionCacheKey', () => {
  it('is stable for identical audio and settings', () => {
    const k1 = transcriptionCacheKey({ pcm: pcmA, sampleRate: 16000, provider: 'local', model: 'm1' });
    const k2 = transcriptionCacheKey({ pcm: pcmA, sampleRate: 16000, provider: 'local', model: 'm1' });
    expect(k1).toBe(k2);
  });

  it('differs when the audio differs', () => {
    const k1 = transcriptionCacheKey({ pcm: pcmA, sampleRate: 16000, provider: 'local', model: 'm1' });
    const k2 = transcriptionCacheKey({ pcm: pcmB, sampleRate: 16000, provider: 'local', model: 'm1' });
    expect(k1).not.toBe(k2);
  });

  it('differs on provider, model or language change', () => {
    const base = { pcm: pcmA, sampleRate: 16000, provider: 'local', model: 'm1' };
    const variants = [
      { ...base, provider: 'api' },
      { ...base, model: 'm2' },
      { ...base, language: 'id' },
      { ...base, sampleRate: 44100 },
    ];
    const baseKey = transcriptionCacheKey(base);
    for (const v of variants) {
      expect(transcriptionCacheKey(v)).not.toBe(baseKey);
    }
  });
});

describe('cache roundtrip', () => {
  it('stores and retrieves a transcription', () => {
    clearTranscriptionCache();
    const key = transcriptionCacheKey({ pcm: pcmA, sampleRate: 16000, provider: 'local', model: 'm1' });
    setCachedTranscription(key, sample);
    expect(getCachedTranscription(key)).toEqual(sample);
  });

  it('returns null for unknown keys', () => {
    clearTranscriptionCache();
    expect(getCachedTranscription('nope')).toBeNull();
  });

  it('clears everything', () => {
    const key = transcriptionCacheKey({ pcm: pcmA, sampleRate: 16000, provider: 'local', model: 'm1' });
    setCachedTranscription(key, sample);
    clearTranscriptionCache();
    expect(getCachedTranscription(key)).toBeNull();
  });
});
