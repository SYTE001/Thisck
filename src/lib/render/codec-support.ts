import { ExportCodecError } from '../errors/export-errors';

/**
 * Codec capability probing — PRD Section 13.3 & 13.4.
 *
 * Never assume a specific H.264 profile (e.g. avc1.640028) is supported. Probe
 * candidates in order and use the first the browser actually supports, and
 * confirm AAC audio encoding up front so we never render the whole video only
 * to fail on audio at the end.
 */

/** H.264 profiles to try, most-capable first (High → Main → Baseline). */
export const H264_PROFILES = ['avc1.640028', 'avc1.4D4028', 'avc1.42E028'] as const;

export interface VideoCodecProbeInput {
  width: number;
  height: number;
  bitrate: number;
  framerate: number;
  profiles?: readonly string[];
}

/**
 * Probe for a supported H.264 profile. Returns the first supported codec
 * string, or null when none are supported / the API is unavailable.
 */
export async function probeVideoCodec(input: VideoCodecProbeInput): Promise<string | null> {
  if (typeof VideoEncoder === 'undefined' || !VideoEncoder.isConfigSupported) {
    return null;
  }
  const profiles = input.profiles ?? H264_PROFILES;
  for (const codec of profiles) {
    try {
      const support = await VideoEncoder.isConfigSupported({
        codec,
        width: input.width,
        height: input.height,
        bitrate: input.bitrate,
        framerate: input.framerate,
      });
      if (support && support.supported) return codec;
    } catch {
      // Ignore and try the next profile.
    }
  }
  return null;
}

/**
 * Resolve a supported video codec or throw an actionable ExportCodecError.
 * Use this before rendering starts.
 */
export async function resolveVideoCodecOrThrow(input: VideoCodecProbeInput): Promise<string> {
  const codec = await probeVideoCodec(input);
  if (!codec) {
    throw new ExportCodecError(
      'No supported H.264 profile was found for MP4 export in this browser. ' +
        'Try a Chromium-based browser, or export a lower resolution.'
    );
  }
  return codec;
}

export interface AacProbeInput {
  sampleRate: number;
  numberOfChannels: number;
  bitrate?: number;
}

/**
 * Whether AAC-LC audio encoding is available for the given configuration.
 * PRD 13.4: this must be checked BEFORE expensive rendering begins.
 */
export async function isAacEncodingSupported(input: AacProbeInput): Promise<boolean> {
  if (typeof AudioEncoder === 'undefined' || !AudioEncoder.isConfigSupported) {
    return false;
  }
  try {
    const support = await AudioEncoder.isConfigSupported({
      codec: 'mp4a.40.2', // AAC-LC
      sampleRate: input.sampleRate,
      numberOfChannels: input.numberOfChannels,
      bitrate: input.bitrate ?? 192000,
    });
    return !!(support && support.supported);
  } catch {
    return false;
  }
}
