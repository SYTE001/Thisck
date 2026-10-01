import { describe, it, expect } from 'vitest';
import { applyGlobalOffset } from '../sync/forced-alignment';
import type { LyricLine } from '../../types/lyrics';

/** PRD §15/§20 — global offset is fine-tune only; cancellation restores state. */

let idCounter = 0;
function line(text: string, start: number | null, end: number | null): LyricLine {
  const id = `g-${idCounter++}`;
  return {
    id,
    text,
    startTime: start,
    endTime: end,
    confidence: 0.9,
    source: 'SOURCE_AUDIO_ALIGNMENT',
    words: start !== null
      ? [{ id: `${id}-w0`, text, startTime: start, endTime: end ?? start + 1, confidence: 0.9, timingSource: 'matched' as const }]
      : undefined,
  };
}

describe('applyGlobalOffset', () => {
  it('shifts every line and word by the offset', () => {
    const input = [line('a', 1, 2), line('b', 3, 4)];
    const out = applyGlobalOffset(input, 0.15);
    expect(out[0].startTime).toBeCloseTo(1.15, 3);
    expect(out[0].words?.[0].startTime).toBeCloseTo(1.15, 3);
    expect(out[1].endTime).toBeCloseTo(4.15, 3);
  });

  it('clamps at zero and keeps the timeline valid for negative offsets', () => {
    const input = [line('a', 0.05, 0.3), line('b', 0.4, 0.6)];
    const out = applyGlobalOffset(input, -0.2);
    for (const l of out) {
      expect(l.startTime!).toBeGreaterThanOrEqual(0);
      expect(l.endTime!).toBeGreaterThan(l.startTime!);
    }
    let prevEnd = 0;
    for (const l of out) {
      expect(l.startTime!).toBeGreaterThanOrEqual(prevEnd - 0.011);
      prevEnd = l.endTime!;
    }
  });

  it('is a no-op with a zero offset', () => {
    const input = [line('a', 1, 2)];
    expect(applyGlobalOffset(input, 0)[0].startTime).toBe(1);
  });
});

describe('cancellation contract (PRD §20)', () => {
  it('rejects before any work when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    // AudioBuffer argument is irrelevant: the abort check fires first, so no
    // decode, no worker, and no state mutation can happen.
    const fakeBuffer = { duration: 10 } as unknown as AudioBuffer;
    await expect(
      runAlignmentWithSignal(fakeBuffer, controller.signal)
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

import { runForcedAlignment } from '../sync/forced-alignment';

function runAlignmentWithSignal(audioBuffer: AudioBuffer, signal: AbortSignal) {
  return runForcedAlignment({
    lines: [line('a', null, null)],
    audioBuffer,
    signal,
  });
}
