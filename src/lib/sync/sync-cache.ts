import type { RecognizedWord } from './text-matcher';

/**
 * TRANSCRIPTION CACHE (PRD Module 21)
 *
 * ASR is by far the most expensive stage (model download + inference), and it
 * depends ONLY on the audio and engine settings — never on the lyrics. So the
 * recognised word list is cached and re-used when the user re-runs Auto Sync
 * on the same audio (e.g. after tweaking lyrics or alignment options).
 *
 * Cache key (PRD §21): provider + model + language + audio sample rate +
 * PCM length + a sampled audio checksum. The checksum samples the beginning,
 * middle and end of the PCM so different tracks virtually never collide while
 * keeping hashing cost constant regardless of song length.
 *
 * Storage: in-memory for the session + localStorage (small JSON payloads)
 * best-effort. A full or failed localStorage must never break a sync run.
 */

export interface TranscriptionCacheEntry {
  key: string;
  words: RecognizedWord[];
  createdAt: number;
}

const MEMORY_LIMIT = 8;
const STORAGE_PREFIX = 'thisck.sync.cache.';
const STORAGE_LIMIT_BYTES = 2 * 1024 * 1024;

const memory = new Map<string, TranscriptionCacheEntry>();

const STORAGE_AVAILABLE = (() => {
  try {
    const probe = STORAGE_PREFIX + '__probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
})();

/** FNV-1a 32-bit — fast, dependency-free, adequate for a sampled fingerprint. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Samples the PCM at a few fixed positions so hashing is O(1) per song. */
function pcmFingerprint(pcm: Float32Array): string {
  const windows = 4;
  const windowSize = 16 * 1024; // samples
  let acc = '';
  for (let w = 0; w < windows; w++) {
    const offset = Math.min(
      pcm.length - windowSize,
      Math.floor((pcm.length / windows) * w) + (w === 0 ? 0 : windowSize)
    );
    const start = Math.max(0, offset);
    // Quantise to 12 bits — float noise between identical runs is irrelevant
    // for identity purposes and keeps the key stable.
    let h = '';
    for (let i = 0; i < windowSize; i += 16) {
      const v = pcm[start + i] ?? 0;
      h += Math.round(Math.abs(v) * 4095).toString(36);
    }
    acc += h;
  }
  return fnv1a(acc);
}

export interface TranscriptionCacheKeyParams {
  pcm: Float32Array;
  sampleRate: number;
  provider: string;
  model: string;
  language?: string;
}

export function transcriptionCacheKey(params: TranscriptionCacheKeyParams): string {
  const { pcm, sampleRate, provider, model, language } = params;
  return fnv1a(
    [provider, model, language ?? 'auto', sampleRate, pcm.length, pcmFingerprint(pcm)].join('|')
  );
}

export function getCachedTranscription(key: string): RecognizedWord[] | null {
  const hit = memory.get(key);
  if (hit) {
    // LRU-ish refresh.
    memory.delete(key);
    memory.set(key, hit);
    return hit.words;
  }
  if (!STORAGE_AVAILABLE) return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as TranscriptionCacheEntry;
    if (!Array.isArray(entry.words)) {
      localStorage.removeItem(STORAGE_PREFIX + key);
      return null;
    }
    memory.set(key, entry);
    return entry.words;
  } catch {
    return null;
  }
}

export function setCachedTranscription(key: string, words: RecognizedWord[]): void {
  const entry: TranscriptionCacheEntry = { key, words, createdAt: Date.now() };
  memory.set(key, entry);
  while (memory.size > MEMORY_LIMIT) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
  if (!STORAGE_AVAILABLE) return;
  try {
    // Evict oldest persisted entries when the quota-ish budget is exceeded.
    const serialized = JSON.stringify(entry);
    localStorage.setItem(STORAGE_PREFIX + key, serialized);
    evictOldPersisted(serialized.length);
  } catch {
    // Quota exceeded or blocked storage — drop the persisted copy, keep memory.
    try {
      localStorage.removeItem(STORAGE_PREFIX + key);
    } catch {
      /* ignore */
    }
  }
}

function evictOldPersisted(incomingBytes: number): void {
  let budget = STORAGE_LIMIT_BYTES - incomingBytes;
  const entries: Array<{ key: string; createdAt: number; size: number }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(STORAGE_PREFIX)) continue;
    const raw = localStorage.getItem(key) ?? '';
    try {
      const parsed = JSON.parse(raw) as TranscriptionCacheEntry;
      entries.push({ key, createdAt: parsed.createdAt ?? 0, size: raw.length });
    } catch {
      entries.push({ key, createdAt: 0, size: raw.length });
    }
  }
  entries.sort((a, b) => b.createdAt - a.createdAt); // newest first
  for (const e of entries) {
    if (e.size <= budget) budget -= e.size;
    else localStorage.removeItem(e.key);
  }
}

/** Clears every cached transcription (memory + persisted). */
export function clearTranscriptionCache(): void {
  memory.clear();
  if (!STORAGE_AVAILABLE) return;
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX)) doomed.push(key);
    }
    doomed.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
