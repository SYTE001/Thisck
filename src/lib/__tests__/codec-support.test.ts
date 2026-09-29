import { describe, it, expect } from 'vitest';
import {
  H264_PROFILES,
  probeVideoCodec,
  resolveVideoCodecOrThrow,
  isAacEncodingSupported,
} from '../render/codec-support';
import { ExportCodecError } from '../errors/export-errors';

describe('codec-support', () => {
  it('orders H.264 profiles most-capable first', () => {
    expect(H264_PROFILES[0]).toBe('avc1.640028'); // High
    expect(H264_PROFILES).toContain('avc1.4D4028'); // Main
    expect(H264_PROFILES).toContain('avc1.42E028'); // Baseline
  });

  it('probeVideoCodec returns null when VideoEncoder is unavailable', async () => {
    // In the node test environment WebCodecs is not present.
    if (typeof VideoEncoder !== 'undefined') return;
    const codec = await probeVideoCodec({ width: 1080, height: 1920, bitrate: 8_000_000, framerate: 30 });
    expect(codec).toBeNull();
  });

  it('resolveVideoCodecOrThrow throws ExportCodecError when unsupported', async () => {
    if (typeof VideoEncoder !== 'undefined') return;
    await expect(
      resolveVideoCodecOrThrow({ width: 1080, height: 1920, bitrate: 8_000_000, framerate: 30 })
    ).rejects.toBeInstanceOf(ExportCodecError);
  });

  it('isAacEncodingSupported is false when AudioEncoder is unavailable', async () => {
    if (typeof AudioEncoder !== 'undefined') return;
    expect(await isAacEncodingSupported({ sampleRate: 44100, numberOfChannels: 2 })).toBe(false);
  });
});
