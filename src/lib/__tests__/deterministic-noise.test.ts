import { describe, it, expect } from 'vitest';
import { mulberry32, hashStringToSeed } from '../render/determinism';
import { createSeededNoiseCanvas } from '../render/layer-cache';

describe('deterministic noise / PRNG', () => {
  it('mulberry32 produces the same sequence for the same seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it('different seeds produce different sequences', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('mulberry32 output stays within [0, 1)', () => {
    const r = mulberry32(12345);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('hashStringToSeed is stable and deterministic', () => {
    expect(hashStringToSeed('project-1')).toBe(hashStringToSeed('project-1'));
    expect(hashStringToSeed('project-1')).not.toBe(hashStringToSeed('project-2'));
  });

  it('createSeededNoiseCanvas is byte-identical for the same seed when a canvas is available', () => {
    // Skip cleanly in the node test environment where document is absent; the
    // meaningful determinism guarantee is already covered by the PRNG tests.
    if (typeof document === 'undefined') return;
    const c1 = createSeededNoiseCanvas(7, 16, 16);
    const c2 = createSeededNoiseCanvas(7, 16, 16);
    const ctx1 = c1.getContext('2d');
    const ctx2 = c2.getContext('2d');
    if (!ctx1 || !ctx2) return; // no 2d backend in this environment
    const d1 = ctx1.getImageData(0, 0, 16, 16).data;
    const d2 = ctx2.getImageData(0, 0, 16, 16).data;
    expect(Array.from(d1)).toEqual(Array.from(d2));
  });
});
