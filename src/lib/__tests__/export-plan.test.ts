import { describe, it, expect } from 'vitest';
import { createExportPlan, frameTimestampUs, frameTimeSec } from '../render/export-plan';
import type { ExportSettings } from '../../types/project';

const baseSettings: ExportSettings = {
  width: 1080,
  height: 1920,
  aspectRatio: '9:16',
  fps: 30,
  bitrateKbps: 8000,
  includeAudio: false,
  format: 'mp4',
};

describe('createExportPlan', () => {
  it('derives frames from duration and fps', () => {
    const plan = createExportPlan({
      exportSettings: baseSettings,
      lyricDuration: 10,
      mediaDuration: null,
      hasAudio: false,
    });
    expect(plan.durationSec).toBe(10);
    expect(plan.totalFrames).toBe(300);
    expect(plan.includeAudio).toBe(false);
    expect(plan.startTimeSec).toBe(0);
  });

  it('uses media duration in AUTO mode when audio present', () => {
    const plan = createExportPlan({
      exportSettings: { ...baseSettings, includeAudio: true },
      lyricDuration: 10,
      mediaDuration: 20,
      hasAudio: true,
    });
    expect(plan.endTimeSec).toBe(20);
    expect(plan.totalFrames).toBe(600);
    expect(plan.includeAudio).toBe(true);
  });

  it('respects MANUAL trim range', () => {
    const plan = createExportPlan({
      exportSettings: {
        ...baseSettings,
        outputRange: { mode: 'MANUAL', startTime: 4, endTime: 9 },
      },
      lyricDuration: 30,
      mediaDuration: null,
      hasAudio: false,
    });
    expect(plan.startTimeSec).toBe(4);
    expect(plan.endTimeSec).toBe(9);
    expect(plan.durationSec).toBe(5);
    expect(plan.totalFrames).toBe(150);
  });

  it('falls back to defaults for missing settings', () => {
    const plan = createExportPlan({
      exportSettings: { ...baseSettings, width: 0, height: 0, fps: 0 as any, bitrateKbps: 0 },
      lyricDuration: 5,
      mediaDuration: null,
      hasAudio: false,
    });
    expect(plan.width).toBe(1080);
    expect(plan.height).toBe(1920);
    expect(plan.fps).toBe(30);
    expect(plan.bitrateKbps).toBe(8000);
  });

  it('is deterministic', () => {
    const input = {
      exportSettings: baseSettings,
      lyricDuration: 12.5,
      mediaDuration: 18,
      hasAudio: false,
    };
    expect(createExportPlan(input)).toEqual(createExportPlan(input));
  });
});

describe('frame timestamps', () => {
  it('frameTimestampUs uses integer index math (no drift)', () => {
    expect(frameTimestampUs(0, 30)).toBe(0);
    expect(frameTimestampUs(30, 30)).toBe(1_000_000);
    // frame 1 at 30fps = 33333.33us, rounded
    expect(frameTimestampUs(1, 30)).toBe(33333);
    // Accumulating float would drift; integer math stays exact at whole seconds.
    expect(frameTimestampUs(1800, 30)).toBe(60_000_000);
  });

  it('frameTimeSec offsets by plan start', () => {
    const plan = createExportPlan({
      exportSettings: { ...baseSettings, outputRange: { mode: 'MANUAL', startTime: 2, endTime: 12 } },
      lyricDuration: 30,
      mediaDuration: null,
      hasAudio: false,
    });
    expect(frameTimeSec(plan, 0)).toBe(2);
    expect(frameTimeSec(plan, 30)).toBe(3);
  });
});
