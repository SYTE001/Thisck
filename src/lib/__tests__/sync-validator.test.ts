import { describe, it, expect } from 'vitest';
import { validateSyncDraft } from '../sync/sync-validator';
import type { LyricLine, Word } from '../../types/lyrics';

/**
 * PRD Module K — pre-apply validation. A failed validation must never be
 * silently applied.
 */

let idCounter = 0;
const word = (text: string, start: number, end: number, timingSource?: Word['timingSource']): Word => ({
  id: `w-${idCounter++}`,
  text,
  startTime: start,
  endTime: end,
  confidence: 0.9,
  timingSource,
});

function line(text: string, start: number | null, end: number | null, words?: Word[]): LyricLine {
  const id = `l-${idCounter++}`;
  return {
    id,
    text,
    startTime: start,
    endTime: end,
    words,
    confidence: 0.9,
    source: 'SOURCE_AUDIO_ALIGNMENT',
    originalText: text,
  };
}

function expectIssues(result: { errors: { message: string }[]; warnings: { message: string }[] }) {
  return {
    toHaveError(matching: string) {
      expect(result.errors.some((e) => e.message.includes(matching))).toBe(true);
    },
    toHaveWarning(matching: string) {
      expect(result.warnings.some((w) => w.message.includes(matching))).toBe(true);
    },
  };
}

describe('validateSyncDraft: structural checks', () => {
  it('accepts a correct draft', () => {
    const original = [line('Hello World', 1, 2), line('Good Bye', 3, 4)];
    const result = validateSyncDraft({ lines: original.map((l) => ({ ...l })), originalLines: original });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a draft whose line count changed', () => {
    const original = [line('A', 1, 2), line('B', 3, 4)];
    const result = validateSyncDraft({ lines: [original[0]], originalLines: original });
    expect(result.valid).toBe(false);
    expectIssues(result).toHaveError('Line count changed');
  });

  it('rejects modified original text', () => {
    const original = [line('Aku Pulang', 1, 2)];
    const mutated = [{ ...line('Aku Pergi', 1, 2), originalText: 'Aku Pergi' }];
    const result = validateSyncDraft({ lines: mutated, originalLines: original });
    expect(result.valid).toBe(false);
    expectIssues(result).toHaveError('Original text was modified');
  });
});

describe('validateSyncDraft: timing checks', () => {
  it('rejects NaN and Infinity timestamps', () => {
    const original = [line('A', 1, 2)];
    const bad = [{ ...original[0], startTime: NaN, endTime: Infinity }];
    const result = validateSyncDraft({ lines: bad, originalLines: original });
    expect(result.valid).toBe(false);
    expectIssues(result).toHaveError('non-finite');
  });

  it('rejects negative timestamps and end <= start', () => {
    const original = [line('A', 1, 2)];
    const bad = [{ ...original[0], startTime: -0.5, endTime: -0.6 }];
    const result = validateSyncDraft({ lines: bad, originalLines: original });
    expect(result.valid).toBe(false);
    expectIssues(result).toHaveError('before the beginning');
    expectIssues(result).toHaveError('ends at or before');
  });

  it('rejects out-of-order lines', () => {
    const original = [line('A', 1, 2), line('B', 3, 4)];
    const bad = [line('A', 5, 6), line('B', 3, 4)];
    const result = validateSyncDraft({ lines: bad, originalLines: original });
    expect(result.valid).toBe(false);
    expectIssues(result).toHaveError('out of order');
  });

  it('warns when a line extends past the audio duration', () => {
    const original = [line('A', 4, 9)];
    const result = validateSyncDraft({ lines: original, originalLines: original, audioDurationSec: 5 });
    expectIssues(result).toHaveWarning('past the audio duration');
    expect(result.valid).toBe(true); // warnings are non-blocking
  });

  it('warns about very short and very long lines without failing', () => {
    const original = [line('A', 0, 0.05), line('B', 1, 30)];
    const result = validateSyncDraft({ lines: original, originalLines: original });
    expect(result.valid).toBe(true);
    expectIssues(result).toHaveWarning('very short');
    expectIssues(result).toHaveWarning('very long');
  });

  it('allows untimed blank lines without warnings', () => {
    const original = [line('A', 1, 2), line('', null, null)];
    const result = validateSyncDraft({ lines: original, originalLines: original });
    expect(result.valid).toBe(true);
  });

  it('warns when a timed line has invalid word durations or out-of-order words', () => {
    const original = [line('hello world', 1, 3)];
    const bad = [
      {
        ...original[0],
        words: [word('hello', 2, 1.5), word('world', 1.4, 1.2)],
      },
    ];
    const result = validateSyncDraft({ lines: bad, originalLines: original });
    expect(result.valid).toBe(true); // word issues warn, not error
    expectIssues(result).toHaveWarning('invalid duration');
    expectIssues(result).toHaveWarning('out of order');
  });
});

describe('validateSyncDraft: alignment checks', () => {
  it('rejects repeated lines collapsing onto one occurrence', () => {
    const original = [line('I love you', 1, 2), line('I love you', 1, 2), line('I love you', 1, 2)];
    const result = validateSyncDraft({ lines: original, originalLines: original });
    expect(result.valid).toBe(false);
    expectIssues(result).toHaveError('repeated lines');
  });

  it('accepts repeated lines mapped to distinct occurrences', () => {
    const original = [line('I love you', 1, 2), line('I love you', 5, 6), line('I love you', 9, 10)];
    const result = validateSyncDraft({ lines: original, originalLines: original });
    expect(result.valid).toBe(true);
  });

  it('warns about interpolated or estimated words so the UI can flag review', () => {
    const original = [line('One two three', 1, 3)];
    const draft = [
      {
        ...original[0],
        words: [
          word('One', 1, 1.3, 'matched'),
          word('two', 1.3, 1.6, 'interpolated'),
          word('three', 2.0, 2.3, 'matched'),
        ],
      },
    ];
    const result = validateSyncDraft({ lines: draft, originalLines: original });
    expect(result.valid).toBe(true);
    expectIssues(result).toHaveWarning('interpolated or estimated');
  });
});
