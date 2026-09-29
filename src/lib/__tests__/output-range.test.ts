import { describe, it, expect } from 'vitest';
import { resolveOutputRange, resolveOutputRangeFrom } from '../timeline/output-range';

describe('resolveOutputRange', () => {
  it('AUTO uses media duration when audio exists', () => {
    const r = resolveOutputRange({ mode: 'AUTO', lyricDuration: 30, mediaDuration: 45 });
    expect(r.startTime).toBe(0);
    expect(r.endTime).toBe(45);
    expect(r.duration).toBe(45);
    expect(r.source).toBe('AUDIO');
  });

  it('AUTO falls back to lyric duration when no audio', () => {
    const r = resolveOutputRange({ mode: 'AUTO', lyricDuration: 30, mediaDuration: null });
    expect(r.endTime).toBe(30);
    expect(r.source).toBe('LYRICS');
  });

  it('LYRICS ignores media duration', () => {
    const r = resolveOutputRange({ mode: 'LYRICS', lyricDuration: 30, mediaDuration: 90 });
    expect(r.endTime).toBe(30);
    expect(r.source).toBe('LYRICS');
  });

  it('AUDIO with no media falls back to lyric duration', () => {
    const r = resolveOutputRange({ mode: 'AUDIO', lyricDuration: 22, mediaDuration: null });
    expect(r.endTime).toBe(22);
    expect(r.source).toBe('LYRICS');
  });

  it('MANUAL respects explicit start and end', () => {
    const r = resolveOutputRange({
      mode: 'MANUAL',
      lyricDuration: 30,
      mediaDuration: 45,
      startTime: 5,
      endTime: 12,
    });
    expect(r.startTime).toBe(5);
    expect(r.endTime).toBe(12);
    expect(r.duration).toBe(7);
    expect(r.source).toBe('MANUAL');
  });

  it('MANUAL without end falls back to media then lyric', () => {
    const withMedia = resolveOutputRange({
      mode: 'MANUAL',
      lyricDuration: 30,
      mediaDuration: 45,
      startTime: 5,
    });
    expect(withMedia.endTime).toBe(45);

    const noMedia = resolveOutputRange({
      mode: 'MANUAL',
      lyricDuration: 30,
      mediaDuration: null,
      startTime: 5,
    });
    expect(noMedia.endTime).toBe(30);
  });

  it('never produces an inverted range', () => {
    const r = resolveOutputRange({
      mode: 'MANUAL',
      lyricDuration: 30,
      mediaDuration: null,
      startTime: 20,
      endTime: 10,
    });
    expect(r.endTime).toBeGreaterThanOrEqual(r.startTime);
    expect(r.duration).toBe(0);
  });

  it('clamps negative durations to zero', () => {
    const r = resolveOutputRange({ mode: 'AUTO', lyricDuration: -5, mediaDuration: null });
    expect(r.endTime).toBe(0);
    expect(r.duration).toBe(0);
  });

  it('is deterministic for identical inputs', () => {
    const input = { mode: 'AUTO' as const, lyricDuration: 33.33, mediaDuration: 40.1 };
    expect(resolveOutputRange(input)).toEqual(resolveOutputRange(input));
  });

  it('resolveOutputRangeFrom defaults to AUTO when undefined', () => {
    const r = resolveOutputRangeFrom(undefined, 12, 20);
    expect(r.mode).toBe('AUTO');
    expect(r.endTime).toBe(20);
    expect(r.source).toBe('AUDIO');
  });
});
