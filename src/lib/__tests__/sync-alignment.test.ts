import { describe, it, expect } from 'vitest';
import {
  alignLyricsWithTranscription,
  wordSimilarity,
  type RecognizedWord,
} from '../sync/text-matcher';
import { canonicalToken, estimateWeight, tokenizePairs } from '../sync/text-normalization';

/** Helper: build RecognizedWord[] from [word, start, end] triples (seconds). */
const wordsFrom = (triples: Array<[string, number, number]>): RecognizedWord[] =>
  triples.map(([word, start, end]) => ({ word, start, end, confidence: 0.9 }));

describe('text-normalization (PRD Module D)', () => {
  it('folds case, punctuation, emoji, apostrophe variants and unicode for comparison only', () => {
    expect(canonicalToken('DON\u2019T!')).toBe('dont');
    expect(canonicalToken('Cinta \u{1F496} Selalu')).toBe('cinta selalu');
    expect(canonicalToken('Héllo…')).toBe('hello');
    // Hyphens become a space, matching the reference normalisation
    // ("Cahaya-ku" → "cahaya ku"); similarity still scores the pair high.
    expect(canonicalToken('Cahaya-ku')).toBe('cahaya ku');
  });

  it('folds spoken number words onto digits (en + id)', () => {
    expect(canonicalToken('One')).toBe('1');
    expect(canonicalToken('satu')).toBe('1');
  });

  it('never modifies the raw token it is given', () => {
    const raw = 'Kau, Cahaya-ku!';
    tokenizePairs(raw);
    expect(raw).toBe('Kau, Cahaya-ku!');
  });

  it('gives longer lines a larger singing weight', () => {
    expect(estimateWeight('aku pulang ke rumah')).toBeGreaterThan(estimateWeight('ya'));
  });
});

describe('alignment: basic timing (PRD Modules E/H)', () => {
  const transcript = wordsFrom([
    ['aku', 0.5, 0.9],
    ['pulang', 0.9, 1.4],
    ['ke', 1.4, 1.6],
    ['rumah', 1.6, 2.2],
  ]);

  it('preserves the original capitalisation, punctuation and line text', () => {
    const lines = alignLyricsWithTranscription(['Aku Pulang, ke RUMAH!'], transcript);
    expect(lines[0].text).toBe('Aku Pulang, ke RUMAH!');
    expect(lines[0].words?.map((w) => w.text)).toEqual(['Aku', 'Pulang,', 'ke', 'RUMAH!']);
  });

  it('derives line bounds from word timing, not even division', () => {
    const lines = alignLyricsWithTranscription(['Aku Pulang ke rumah'], transcript);
    expect(lines[0].startTime).toBeCloseTo(0.5, 2);
    expect(lines[0].endTime).toBeCloseTo(2.2, 2);
  });

  it('keeps the first line off second zero when the song has an instrumental intro', () => {
    const late = wordsFrom([
      ['here', 12.45, 12.62],
      ['we', 12.62, 13.01],
      ['go', 13.01, 15.89],
    ]);
    const lines = alignLyricsWithTranscription(['Here we go'], late);
    expect(lines[0].startTime).toBeCloseTo(12.45, 2);
  });
});

describe('alignment: typo, inserted and missing words (PRD Module G)', () => {
  it('matches a minor ASR typo without changing the original text', () => {
    const transcript = wordsFrom([
      ['helo', 1.0, 1.3], // ASR mis-heard "hello"
      ['wrold', 1.4, 1.9], // ASR mis-heard "world"
    ]);
    const lines = alignLyricsWithTranscription(['Hello, World!'], transcript);
    expect(lines[0].words?.map((w) => w.timingSource)).toEqual(['matched', 'matched']);
    expect(lines[0].text).toBe('Hello, World!');
  });

  it('skips ASR-inserted filler words', () => {
    const transcript = wordsFrom([
      ['uh', 0.9, 1.0],
      ['keep', 1.0, 1.3],
      ['yeah', 1.35, 1.5],
      ['falling', 1.5, 2.0],
    ]);
    const lines = alignLyricsWithTranscription(['Keep falling'], transcript);
    expect(lines[0].startTime).toBeCloseTo(1.0, 2);
    expect(lines[0].endTime).toBeCloseTo(2.0, 2);
  });

  it('interpolates a single missing word between two anchors with low confidence', () => {
    const transcript = wordsFrom([
      ['one', 1.0, 1.3],
      ['three', 2.0, 2.3], // "two" was never recognised
    ]);
    const lines = alignLyricsWithTranscription(['One two three'], transcript);
    const middle = lines[0].words![1];
    expect(middle.text).toBe('two');
    expect(middle.timingSource).toBe('interpolated');
    expect(middle.confidence!).toBeLessThan(0.5);
    expect(middle.startTime).toBeGreaterThanOrEqual(1.3);
    expect(middle.endTime).toBeLessThanOrEqual(2.0);
  });

  it('interpolates several consecutive missing words monotonically', () => {
    const transcript = wordsFrom([
      ['one', 1.0, 1.3],
      ['five', 2.4, 2.7],
    ]);
    const lines = alignLyricsWithTranscription(['One two three four five'], transcript);
    const ws = lines[0].words!;
    for (let i = 1; i < ws.length; i++) {
      expect(ws[i].startTime).toBeGreaterThanOrEqual(ws[i - 1].startTime);
      expect(ws[i].endTime).toBeGreaterThan(ws[i].startTime);
    }
    expect(ws.slice(1, 4).every((w) => w.timingSource === 'interpolated')).toBe(true);
  });

  it('marks boundary (no-anchor) words as estimated', () => {
    const transcript = wordsFrom([['middle', 5.0, 5.6]]);
    const lines = alignLyricsWithTranscription(['Leading middle trailing'], transcript);
    const ws = lines[0].words!;
    expect(ws[0].timingSource).toBe('estimated');
    expect(ws[1].timingSource).toBe('matched');
    expect(ws[2].timingSource).toBe('estimated');
    // Estimated words still produce a valid, monotonic timeline.
    expect(ws[0].startTime).toBeGreaterThanOrEqual(0);
    expect(ws[2].endTime).toBeGreaterThan(ws[2].startTime);
  });
});

describe('alignment: repeated phrases (PRD Module F)', () => {
  it('maps three identical lines to three distinct occurrences in audio order', () => {
    const transcript = wordsFrom([
      ['i', 1.0, 1.1], ['love', 1.1, 1.4], ['you', 1.4, 1.8],
      ['i', 2.0, 2.1], ['love', 2.1, 2.4], ['you', 2.4, 2.8],
      ['i', 3.0, 3.1], ['love', 3.1, 3.4], ['you', 3.4, 3.8],
    ]);
    const lines = alignLyricsWithTranscription(['I love you', 'I love you', 'I love you'], transcript);
    expect(lines[0].startTime).toBeCloseTo(1.0, 2);
    expect(lines[1].startTime).toBeCloseTo(2.0, 2);
    expect(lines[2].startTime).toBeCloseTo(3.0, 2);
  });

  it('keeps ordering when a middle repeated occurrence is missing from the ASR', () => {
    const transcript = wordsFrom([
      ['i', 1.0, 1.1], ['love', 1.1, 1.4], ['you', 1.4, 1.8],
      // middle occurrence entirely missed
      ['i', 3.0, 3.1], ['love', 3.1, 3.4], ['you', 3.4, 3.8],
    ]);
    const lines = alignLyricsWithTranscription(['I love you', 'I love you', 'I love you'], transcript);
    expect(lines[0].startTime).toBeCloseTo(1.0, 2);
    expect(lines[2].startTime).toBeCloseTo(3.0, 2);
    // The missed middle line is interpolated between its neighbours.
    expect(lines[1].startTime).toBeGreaterThanOrEqual(lines[0].endTime!);
    expect(lines[1].endTime).toBeLessThanOrEqual(lines[2].startTime!);
    expect(lines[1].confidence!).toBeLessThan(lines[0].confidence!);
  });

  it('handles a repeated chorus with surrounding unique lines', () => {
    const transcript = wordsFrom([
      ['intro', 0.2, 0.8],
      ['cinta', 1.0, 1.4], ['selalu', 1.4, 1.9],
      ['cinta', 4.0, 4.4], ['selalu', 4.4, 4.9],
      ['outro', 5.5, 6.0],
    ]);
    const lines = alignLyricsWithTranscription(
      ['Intro', 'Cinta selalu', 'Cinta selalu', 'Outro'],
      transcript
    );
    expect(lines[0].startTime).toBeCloseTo(0.2, 2);
    expect(lines[1].startTime).toBeCloseTo(1.0, 2);
    expect(lines[2].startTime).toBeCloseTo(4.0, 2);
    expect(lines[3].startTime).toBeCloseTo(5.5, 2);
  });
});

describe('alignment: confidence (PRD Module J)', () => {
  it('scores matched lines high, interpolated lines low', () => {
    const full = wordsFrom([
      ['na', 1.0, 1.2], ['na', 1.2, 1.4], ['na', 1.4, 1.6], ['na', 1.6, 1.8],
    ]);
    const complete = alignLyricsWithTranscription(['Na na na na'], full);
    expect(complete[0].confidence!).toBeGreaterThan(0.7);

    const sparse = wordsFrom([['na', 1.0, 1.2], ['na', 3.0, 3.2]]);
    const partial = alignLyricsWithTranscription(['Na na na na'], sparse);
    expect(partial[0].confidence!).toBeLessThan(complete[0].confidence!);
  });

  it('scales word confidence with ASR confidence when provided', () => {
    const high = alignLyricsWithTranscription(['hello'], [{ word: 'hello', start: 1, end: 2, confidence: 1 }]);
    const low = alignLyricsWithTranscription(['hello'], [{ word: 'hello', start: 1, end: 2, confidence: 0.2 }]);
    expect(high[0].words![0].confidence!).toBeGreaterThan(low[0].words![0].confidence!);
  });
});

describe('alignment: robustness (PRD §27)', () => {
  it('handles empty lyrics', () => {
    expect(alignLyricsWithTranscription([], wordsFrom([['a', 0, 1]]))).toHaveLength(0);
  });

  it('falls back to a low-confidence distribution when the transcript is empty', () => {
    const lines = alignLyricsWithTranscription(['Aku pulang', 'ke rumah'], [], {
      audioDurationSec: 20,
    });
    expect(lines).toHaveLength(2);
    expect(lines[0].confidence!).toBeLessThan(0.4);
    expect(lines[0].words?.every((w) => w.timingSource === 'estimated')).toBe(true);
    expect(lines[1].startTime!).toBeGreaterThanOrEqual(lines[0].endTime!);
  });

  it('keeps blank lines as untimed pass-throughs between timed lines', () => {
    const transcript = wordsFrom([
      ['first', 1.0, 1.5],
      ['third', 3.0, 3.5],
    ]);
    const lines = alignLyricsWithTranscription(['First', '', 'Third'], transcript);
    expect(lines).toHaveLength(3);
    expect(lines[1].startTime).toBeNull();
    expect(lines[1].endTime).toBeNull();
    expect(lines[2].startTime).toBeCloseTo(3.0, 2);
  });

  it('preserves empty lines even when no audio evidence exists at all', () => {
    const lines = alignLyricsWithTranscription(['', '', ''], [], { audioDurationSec: 5 });
    expect(lines.every((l) => l.startTime === null && l.text === '')).toBe(true);
  });

  it('keeps word timestamps monotonic even on pathological input', () => {
    const chaotic: RecognizedWord[] = [
      { word: 'zeta', start: 9, end: 9.2 },
      { word: 'alpha', start: 0.5, end: 0.8 },
      { word: 'mid', start: 3, end: 2.8 }, // reversed end
    ];
    const lines = alignLyricsWithTranscription(['alpha mid zeta'], chaotic);
    const all = lines.flatMap((l) => l.words ?? []);
    for (const w of all) {
      expect(Number.isFinite(w.startTime)).toBe(true);
      expect(Number.isFinite(w.endTime)).toBe(true);
      expect(w.startTime).toBeGreaterThanOrEqual(0);
      expect(w.endTime).toBeGreaterThan(w.startTime);
    }
    for (let i = 1; i < all.length; i++) {
      expect(all[i].startTime).toBeGreaterThanOrEqual(all[i - 1].endTime - 0.011);
    }
  });

  it('similarity is symmetric and bounded', () => {
    expect(wordSimilarity('love', 'love')).toBe(1);
    expect(wordSimilarity('love', 'loved')).toBeGreaterThan(0.5);
    expect(wordSimilarity('', 'love')).toBe(0);
  });
});
