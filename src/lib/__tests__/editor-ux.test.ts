import { describe, it, expect } from 'vitest';
import { stableStringify, hashString, hashProject } from '../project/project-snapshot';
import { snapTime, DEFAULT_SNAP_MODE } from '../timeline/snapping';
import {
  nudgeMagnitudeMs,
  nudgeDeltaMsForKey,
  formatTimingField,
  parseTimingField,
} from '../timeline/timing-edit';

describe('project-snapshot', () => {
  it('stableStringify is key-order independent', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  it('hashProject is deterministic and change-sensitive', () => {
    const base = {
      track: { title: 'x' },
      originalLines: [{ id: 'a', startTime: 0 }],
      processedLines: [],
      viewMode: 'original',
      arrangeSettings: {},
      style: { presetName: 'Deep Forest' },
      exportSettings: { fps: 30 },
      motionLayers: { lyricsType: 'word-by-word' },
    };
    const h1 = hashProject(base);
    const h2 = hashProject({ ...base });
    expect(h1).toBe(h2);

    const changed = hashProject({ ...base, exportSettings: { fps: 60 } });
    expect(changed).not.toBe(h1);
  });

  it('hashString produces stable 8-char hex', () => {
    const h = hashString('hello');
    expect(h).toMatch(/^[0-9a-f]{8}$/);
    expect(hashString('hello')).toBe(h);
  });
});

describe('snapping', () => {
  it('default mode is 50ms', () => {
    expect(DEFAULT_SNAP_MODE).toBe('50ms');
  });

  it('off returns time unchanged', () => {
    expect(snapTime(1.2345, 'off')).toBe(1.2345);
  });

  it('snaps to 50ms and 100ms grids', () => {
    expect(snapTime(1.234, '50ms')).toBeCloseTo(1.25, 5);
    expect(snapTime(1.234, '100ms')).toBeCloseTo(1.2, 5);
  });

  it('frame mode uses fps', () => {
    // 30fps => ~33.33ms step; 0.05s -> nearest frame = frame 2 (0.0667s)
    expect(snapTime(0.05, 'frame', { fps: 30 })).toBeCloseTo(2 / 30, 5);
  });

  it('beat mode uses beat length', () => {
    expect(snapTime(0.9, 'beat', { beatSec: 0.5 })).toBeCloseTo(1.0, 5);
  });
});

describe('timing-edit', () => {
  it('nudge magnitude scales with modifiers', () => {
    expect(nudgeMagnitudeMs({})).toBe(10);
    expect(nudgeMagnitudeMs({ shiftKey: true })).toBe(100);
    expect(nudgeMagnitudeMs({ ctrlKey: true })).toBe(1000);
    expect(nudgeMagnitudeMs({ metaKey: true })).toBe(1000);
  });

  it('arrow keys map to signed deltas', () => {
    expect(nudgeDeltaMsForKey('ArrowUp', {})).toBe(10);
    expect(nudgeDeltaMsForKey('ArrowRight', { shiftKey: true })).toBe(100);
    expect(nudgeDeltaMsForKey('ArrowDown', {})).toBe(-10);
    expect(nudgeDeltaMsForKey('ArrowLeft', { ctrlKey: true })).toBe(-1000);
    expect(nudgeDeltaMsForKey('Enter', {})).toBeNull();
  });

  it('formats seconds as MM:SS.mmm', () => {
    expect(formatTimingField(12.35)).toBe('00:12.350');
    expect(formatTimingField(75.006)).toBe('01:15.006');
    expect(formatTimingField(-5)).toBe('00:00.000');
  });

  it('parses MM:SS.mmm, SS.mmm and plain seconds', () => {
    expect(parseTimingField('00:12.350')).toBeCloseTo(12.35, 5);
    expect(parseTimingField('01:15.006')).toBeCloseTo(75.006, 5);
    expect(parseTimingField('3.5')).toBeCloseTo(3.5, 5);
    expect(parseTimingField('')).toBeNull();
    expect(parseTimingField('00:75.000')).toBeNull();
    expect(parseTimingField('abc')).toBeNull();
  });

  it('format/parse round-trips', () => {
    for (const t of [0, 1.234, 12.35, 75.006, 125.999]) {
      const parsed = parseTimingField(formatTimingField(t));
      expect(parsed).toBeCloseTo(t, 3);
    }
  });
});
