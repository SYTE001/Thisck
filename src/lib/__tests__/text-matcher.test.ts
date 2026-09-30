import { describe, it, expect } from 'vitest';
import {
  alignLyricsWithTranscription,
  wordSimilarity,
  normalizeToken,
  type RecognizedWord,
} from '../sync/text-matcher';

describe('text-matcher: normalizeToken & similarity', () => {
  it('strips punctuation, case and diacritics for comparison only', () => {
    expect(normalizeToken('Héllo!')).toBe('hello');
    expect(normalizeToken("don't")).toBe("don't");
    expect(normalizeToken('...')).toBe('');
  });

  it('scores identical words as 1 and disjoint words low', () => {
    expect(wordSimilarity('love', 'love')).toBe(1);
    expect(wordSimilarity('love', 'dove')).toBeGreaterThan(0.6);
    expect(wordSimilarity('love', 'xyz')).toBeLessThan(0.4);
  });
});

describe('text-matcher: short lyrics', () => {
  const recognized: RecognizedWord[] = [
    { word: 'hello', start: 1.0, end: 1.4, confidence: 0.9 },
    { word: 'world', start: 1.5, end: 2.0, confidence: 0.9 },
    { word: 'good', start: 3.0, end: 3.3, confidence: 0.8 },
    { word: 'bye', start: 3.4, end: 3.9, confidence: 0.8 },
  ];

  it('produces one timed line per input line and preserves original text', () => {
    const lines = alignLyricsWithTranscription(['Hello, World!', 'Good Bye'], recognized);
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe('Hello, World!');
    expect(lines[1].text).toBe('Good Bye');
    // Word surface forms keep punctuation/case, not the lowercased transcription.
    expect(lines[0].words?.map((w) => w.text)).toEqual(['Hello,', 'World!']);
  });

  it('adopts audio timings and sets audio-alignment provenance', () => {
    const lines = alignLyricsWithTranscription(['Hello World'], recognized);
    expect(lines[0].source).toBe('SOURCE_AUDIO_ALIGNMENT');
    expect(lines[0].generatedBy).toBe('audio-sync');
    expect(lines[0].startTime).toBeCloseTo(1.0, 2);
    expect(lines[0].endTime).toBeCloseTo(2.0, 2);
    expect(lines[0].words?.[0].startTime).toBeCloseTo(1.0, 2);
    expect(lines[0].words?.[1].endTime).toBeCloseTo(2.0, 2);
  });

  it('keeps line start/end monotonically ordered', () => {
    const lines = alignLyricsWithTranscription(['Hello World', 'Good Bye'], recognized);
    expect(lines[0].endTime!).toBeLessThanOrEqual(lines[1].startTime!);
  });
});

describe('text-matcher: repeated chorus', () => {
  it('aligns a repeated line to its own occurrence in the audio', () => {
    const recognized: RecognizedWord[] = [
      { word: 'na', start: 0.5, end: 0.8 },
      { word: 'na', start: 0.9, end: 1.2 },
      { word: 'na', start: 5.0, end: 5.3 },
      { word: 'na', start: 5.4, end: 5.7 },
    ];
    const lines = alignLyricsWithTranscription(['Na Na', 'Na Na'], recognized);
    expect(lines).toHaveLength(2);
    // The second chorus line should land on the later pair, not the first.
    expect(lines[1].startTime!).toBeGreaterThan(lines[0].endTime!);
    expect(lines[1].startTime!).toBeCloseTo(5.0, 1);
  });
});

describe('text-matcher: interpolation & missing words', () => {
  it('interpolates a word the recogniser missed between two anchors', () => {
    const recognized: RecognizedWord[] = [
      { word: 'the', start: 2.0, end: 2.2 },
      // "quick" is missing from the transcription
      { word: 'fox', start: 3.0, end: 3.4 },
    ];
    const lines = alignLyricsWithTranscription(['the quick fox'], recognized);
    const words = lines[0].words!;
    expect(words).toHaveLength(3);
    const quick = words[1];
    expect(quick.text).toBe('quick');
    // Sits between the two anchors.
    expect(quick.startTime).toBeGreaterThanOrEqual(2.2 - 1e-6);
    expect(quick.endTime).toBeLessThanOrEqual(3.0 + 1e-6);
    // Interpolated words carry a low confidence flag.
    expect(quick.confidence!).toBeLessThan(0.5);
  });

  it('handles a blank line as an untimed pass-through', () => {
    const recognized: RecognizedWord[] = [
      { word: 'verse', start: 1.0, end: 1.5 },
      { word: 'chorus', start: 4.0, end: 4.5 },
    ];
    const lines = alignLyricsWithTranscription(['Verse', '', 'Chorus'], recognized);
    expect(lines).toHaveLength(3);
    expect(lines[1].text).toBe('');
    expect(lines[1].startTime).toBeNull();
    expect(lines[1].endTime).toBeNull();
  });
});

describe('text-matcher: punctuation preservation', () => {
  it('never mutates punctuation or capitalisation from the source', () => {
    const recognized: RecognizedWord[] = [
      { word: 'i', start: 0.5, end: 0.7 },
      { word: 'cant', start: 0.8, end: 1.1 },
      { word: 'stop', start: 1.2, end: 1.6 },
    ];
    const lines = alignLyricsWithTranscription(["I can't stop!"], recognized);
    expect(lines[0].text).toBe("I can't stop!");
    expect(lines[0].words?.map((w) => w.text)).toEqual(['I', "can't", 'stop!']);
  });
});

describe('text-matcher: empty transcription', () => {
  it('still returns timed pass-through lines without throwing', () => {
    const lines = alignLyricsWithTranscription(['one two', 'three'], []);
    expect(lines).toHaveLength(2);
    expect(lines[0].words).toHaveLength(2);
    // With no audio anchors everything is interpolated from zero, still ordered.
    expect(lines[0].startTime!).toBeGreaterThanOrEqual(0);
    expect(lines[1].startTime!).toBeGreaterThanOrEqual(lines[0].endTime!);
  });
});
