import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { LyricLine, VisualLyricBlock } from '../../types/lyrics';
import type { ExportSettings, StyleConfig, MotionLayersConfig } from '../../types/project';
import type { TextAnimationPreset } from './text-animation';
import type { LyricsType, LyricsEffect, LyricsEffectConfig } from './lyricsAnimation/types';
import { renderEditorialFrame } from './canvas-renderer';
import { createRenderContext } from './render-context';
import { chunkAllLyricLines } from '../layout/lyric-chunker';
import { getTotalDuration } from '../timeline/timeline-engine';
import { createExportPlan, frameTimestampUs } from './export-plan';
import { resolveVideoCodecOrThrow, isAacEncodingSupported } from './codec-support';
import type { LegacyTextAnimationConfig } from './animation-resolver';
import { ExportCanceledError } from '../errors/export-errors';
import { EXPORT_DEFAULTS } from '../config/editorial-constants';
import { LayerCompositor } from './layer-compositor';
import { RainOverlayLayer } from '../layers/rain-overlay';
import { WatermarkLayer } from '../layers/watermark';
import { VideoTransitionsLayer } from '../layers/video-transitions';
import {
  type RenderJobState,
  type RenderJobStatus,
  createInitialJobState,
  computeEstimatedRemaining,
} from './render-job';

// ─── Public Progress API (backward-compatible) ────────────────────────────────

/** @deprecated Use RenderJobState for new code. Kept for backward compatibility. */
export interface ExportProgress {
  currentFrame: number;
  totalFrames: number;
  percentage: number;
  statusText: string;
}

export { type RenderJobState, type RenderJobStatus };

// ─── Export Options ───────────────────────────────────────────────────────────

export interface VideoExportOptions {
  lines: LyricLine[];
  style: StyleConfig;
  exportSettings: ExportSettings;
  visualBlocks?: VisualLyricBlock[];
  audioBuffer?: AudioBuffer | null;
  trackTitle?: string;
  artistName?: string;
  motionLayers?: MotionLayersConfig;
  /** Called on progress update (legacy API). */
  onProgress?: (progress: ExportProgress) => void;
  /** Called with full job state on progress update. */
  onJobStateChange?: (state: RenderJobState) => void;
  shouldCancel?: () => boolean;
}

// ─── Export Validation ────────────────────────────────────────────────────────

export interface ExportValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate export configuration before rendering.
 * PRD Section 33: Errors must be actionable.
 */
export function validateExportConfig(
  options: Pick<VideoExportOptions, 'lines' | 'exportSettings' | 'motionLayers'>
): ExportValidationResult {
  const errors: string[] = [];
  const { lines, exportSettings, motionLayers } = options;

  if (!lines || lines.length === 0) {
    errors.push('No lyric lines found. Add lyrics before exporting.');
  }

  if (exportSettings.width <= 0 || exportSettings.height <= 0) {
    errors.push('Invalid output resolution. Width and height must be greater than zero.');
  }

  if (![24, 30, 60].includes(exportSettings.fps)) {
    errors.push(`Invalid FPS value "${exportSettings.fps}". Supported: 24, 30, 60.`);
  }

  if (motionLayers?.watermark?.enabled && motionLayers.watermark.sourceType === 'video' && motionLayers.watermark.videoUrl) {
    // Video URL format check
    const url = motionLayers.watermark.videoUrl;
    if (!url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('blob:')) {
      errors.push('Watermark video URL format is not supported.');
    }
  }

  if (motionLayers?.rain?.startTime !== undefined && motionLayers?.rain?.endTime !== undefined) {
    if (motionLayers.rain.startTime >= motionLayers.rain.endTime) {
      errors.push('Rain overlay cannot render because its start time is after its end time.');
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Main Export Function ─────────────────────────────────────────────────────

export async function exportVideo(options: VideoExportOptions): Promise<Blob> {
  const {
    lines,
    style,
    exportSettings,
    visualBlocks: providedBlocks,
    audioBuffer,
    trackTitle,
    artistName,
    motionLayers,
    onProgress,
    onJobStateChange,
    shouldCancel,
  } = options;

  // Preview and export MUST agree. The caller (App) always passes visualBlocks
  // computed from the same activeLines + lyricsType. This fallback exists only
  // for direct callers, and it now forwards lyricsType: omitting it previously
  // made the export path pick a different layout than the preview.
  const visualBlocks = providedBlocks || chunkAllLyricLines(lines, 42, motionLayers?.lyricsType);

  // Whether audio is both requested and actually present.
  let hasAudio = !!(exportSettings.includeAudio && audioBuffer && audioBuffer.duration > 0);

  // PRD 13.4: probe AAC availability BEFORE any rendering. If audio was
  // requested but cannot be encoded, fall back to a silent (video-only) export
  // up front rather than rendering every frame and only then discovering audio
  // cannot be muxed.
  if (hasAudio && audioBuffer) {
    const aacOk = await isAacEncodingSupported({
      sampleRate: audioBuffer.sampleRate,
      numberOfChannels: Math.min(2, audioBuffer.numberOfChannels),
    });
    if (!aacOk) {
      hasAudio = false;
    }
  }

  // ONE export plan (PRD 13.1), generated here and threaded through the
  // pipeline. It resolves the output range via the shared resolver so preview
  // and export agree on duration/start/end and total frame count.
  const plan = createExportPlan({
    exportSettings,
    lyricDuration: getTotalDuration(lines, null),
    mediaDuration: audioBuffer && audioBuffer.duration > 0 ? audioBuffer.duration : null,
    hasAudio,
  });

  const width = plan.width;
  const height = plan.height;
  const fps = plan.fps;
  const startTimeSec = plan.startTimeSec;
  const durationSec = plan.durationSec;
  const totalFrames = plan.totalFrames;

  // Build job state
  const jobId = `export-${Date.now()}`;
  const jobState: RenderJobState = {
    ...createInitialJobState(jobId),
    status: 'PREPARING',
    totalFrames,
    statusText: 'Preparing project...',
  };
  onJobStateChange?.(jobState);
  onProgress?.({ currentFrame: 0, totalFrames, percentage: 0, statusText: 'Preparing project...' });

  // Setup offscreen canvas for rendering
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not create 2D canvas context for rendering.');

  // Build and prepare the layer compositor for overlay/watermark layers
  // PRD Section 8: Layer Compositor stage
  const compositor = new LayerCompositor({
    width,
    height,
    projectSeed: 42,
  });

  if (motionLayers?.rain?.enabled) {
    compositor.addLayer(new RainOverlayLayer(motionLayers.rain));
  }
  if (motionLayers?.watermark?.enabled) {
    compositor.addLayer(new WatermarkLayer(motionLayers.watermark));
  }
  if (motionLayers?.videoTransitions?.enabled) {
    compositor.addLayer(new VideoTransitionsLayer(motionLayers.videoTransitions));
  }

  if (compositor.getLayers().length > 0) {
    await compositor.prepare(false);
  }

  const textAnimationPreset: TextAnimationPreset = motionLayers?.textAnimation ?? 'slide-up';
  const textAnimationConfig = motionLayers?.textAnimationConfig;
  const lyricsType = motionLayers?.lyricsType;
  const lyricsEffect = motionLayers?.lyricsEffect;
  const lyricsEffectConfig = motionLayers?.lyricsEffectConfig;

  // Try WebCodecs + mp4-muxer (pioneered deterministic pipeline)
  const isWebCodecsSupported = typeof window !== 'undefined' && 'VideoEncoder' in window;

  if (isWebCodecsSupported) {
    return exportWithWebCodecs({
      canvas,
      ctx,
      width,
      height,
      fps,
      totalFrames,
      startTimeSec,
      durationSec,
      lines,
      style,
      visualBlocks,
      exportSettings,
      hasAudio: !!hasAudio,
      audioBuffer: hasAudio ? audioBuffer : null,
      trackTitle,
      artistName,
      textAnimationPreset,
      textAnimationConfig,
      lyricsType,
      lyricsEffect,
      lyricsEffectConfig,
      compositor,
      jobState,
      onProgress,
      onJobStateChange,
      shouldCancel,
    });
  }

  // Fallback to MediaRecorder
  return exportWithMediaRecorder({
    canvas,
    ctx,
    width,
    height,
    fps,
    totalFrames,
    startTimeSec,
    durationSec,
    lines,
    style,
    visualBlocks,
    hasAudio: !!hasAudio,
    audioBuffer: hasAudio ? audioBuffer : null,
    trackTitle,
    artistName,
    textAnimationPreset,
    textAnimationConfig,
    lyricsType,
    lyricsEffect,
    lyricsEffectConfig,
    compositor,
    jobState,
    onProgress,
    onJobStateChange,
    shouldCancel,
  });
}

// ─── Internal shared params ───────────────────────────────────────────────────

interface InternalExportParams {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  startTimeSec: number;
  durationSec: number;
  lines: LyricLine[];
  style: StyleConfig;
  visualBlocks: VisualLyricBlock[];
  exportSettings?: ExportSettings;
  hasAudio: boolean;
  audioBuffer?: AudioBuffer | null;
  trackTitle?: string;
  artistName?: string;
  textAnimationPreset: TextAnimationPreset;
  textAnimationConfig?: LegacyTextAnimationConfig;
  lyricsType?: LyricsType;
  lyricsEffect?: LyricsEffect;
  lyricsEffectConfig?: LyricsEffectConfig;
  compositor: LayerCompositor;
  jobState: RenderJobState;
  onProgress?: (progress: ExportProgress) => void;
  onJobStateChange?: (state: RenderJobState) => void;
  shouldCancel?: () => boolean;
}

function renderFrame(
  ctx: CanvasRenderingContext2D,
  params: Pick<
    InternalExportParams,
    'width' | 'height' | 'lines' | 'style' | 'visualBlocks' | 'trackTitle' | 'artistName' | 'textAnimationPreset' | 'textAnimationConfig' | 'lyricsType' | 'lyricsEffect' | 'lyricsEffectConfig' | 'compositor' | 'durationSec'
  >,
  currentTime: number
): void {
  const { width, height, lines, style, visualBlocks, trackTitle, artistName, textAnimationPreset, textAnimationConfig, lyricsType, lyricsEffect, lyricsEffectConfig, compositor, durationSec } = params;

  // 1. Editorial lyric frame (background, text, decoration). Built through the
  // shared render context so export resolves the SAME visual state the preview
  // does at this time (PRD Section 16). isPreview:false = full export quality.
  renderEditorialFrame(
    ctx,
    createRenderContext(
      {
        lines,
        style,
        visualBlocks,
        trackTitle,
        artistName,
        motion: {
          lyricsType,
          lyricsEffect,
          lyricsEffectConfig,
          textAnimation: textAnimationPreset,
          textAnimationConfig,
        },
      },
      currentTime,
      { width, height, isPreview: false }
    )
  );

  // 2. Overlay / watermark layers on top
  if (compositor.getLayers().length > 0) {
    compositor.renderFrame(ctx, currentTime, durationSec, false);
  }
}

function updateJobState(
  jobState: RenderJobState,
  update: Partial<RenderJobState>,
  onJobStateChange?: (state: RenderJobState) => void,
  onProgress?: (progress: ExportProgress) => void
): void {
  Object.assign(jobState, update);
  onJobStateChange?.({ ...jobState });
  if (onProgress) {
    onProgress({
      currentFrame: jobState.currentFrame,
      totalFrames: jobState.totalFrames,
      percentage: jobState.percentage,
      statusText: jobState.statusText,
    });
  }
}

// ─── WebCodecs path ───────────────────────────────────────────────────────────

async function exportWithWebCodecs(params: InternalExportParams): Promise<Blob> {
  const {
    canvas,
    ctx,
    width,
    height,
    fps,
    totalFrames,
    startTimeSec,
    durationSec,
    lines,
    style,
    visualBlocks,
    exportSettings,
    hasAudio,
    audioBuffer,
    trackTitle,
    artistName,
    textAnimationPreset,
    textAnimationConfig,
    compositor,
    jobState,
    onProgress,
    onJobStateChange,
    shouldCancel,
  } = params;

  const target = new ArrayBufferTarget();

  const muxerOptions: ConstructorParameters<typeof Muxer>[0] = {
    target,
    video: {
      codec: 'avc',
      width,
      height,
    },
    fastStart: 'in-memory',
  };

  if (hasAudio && audioBuffer) {
    muxerOptions.audio = {
      codec: 'aac',
      numberOfChannels: Math.min(2, audioBuffer.numberOfChannels),
      sampleRate: audioBuffer.sampleRate,
    };
  }

  const muxer = new Muxer(muxerOptions);

  // Configure WebCodecs VideoEncoder
  let encoderError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encoderError = e;
    },
  });

  const bitrate = ((exportSettings?.bitrateKbps) || EXPORT_DEFAULTS.bitrateKbps) * 1000;

  // PRD 13.3: probe H.264 profiles and use the first supported one. Throws an
  // actionable ExportCodecError before rendering if none are supported, instead
  // of silently claiming an MP4 succeeded.
  const videoCodec = await resolveVideoCodecOrThrow({ width, height, bitrate, framerate: fps });
  videoEncoder.configure({
    codec: videoCodec,
    width,
    height,
    bitrate,
    framerate: fps,
  });

  // Audio Encoder if audio is present. AAC availability was already confirmed
  // up front (PRD 13.4), so reaching here with hasAudio means it is encodable.
  let audioEncoder: AudioEncoder | null = null;
  if (hasAudio && audioBuffer && typeof AudioEncoder !== 'undefined') {
    audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => {
        encoderError = e;
      },
    });

    audioEncoder.configure({
      codec: 'mp4a.40.2', // AAC-LC
      numberOfChannels: Math.min(2, audioBuffer.numberOfChannels),
      sampleRate: audioBuffer.sampleRate,
      bitrate: 192000,
    });
  }

  const frameDurationUs = Math.round(1_000_000 / fps);
  const renderStartMs = performance.now();

  updateJobState(
    jobState,
    { status: 'RENDERING', statusText: 'Rendering frames...' },
    onJobStateChange,
    onProgress
  );

  // PRD Section 16: Render progress with actual frame numbers.
  for (let f = 0; f < totalFrames; f++) {
    if (shouldCancel && shouldCancel()) {
      updateJobState(
        jobState,
        { status: 'CANCELING', statusText: 'Canceling...' },
        onJobStateChange,
        onProgress
      );
      videoEncoder.close();
      if (audioEncoder) audioEncoder.close();
      compositor.dispose();
      throw new ExportCanceledError();
    }
    if (encoderError) throw encoderError;

    const currentTime = startTimeSec + (f / fps);

    renderFrame(ctx, { width, height, lines, style, visualBlocks, trackTitle, artistName, textAnimationPreset, textAnimationConfig, compositor, durationSec }, currentTime);

    // PRD 13.2: derive the timestamp from the integer frame index so it never
    // drifts over a long export.
    const timestampUs = frameTimestampUs(f, fps);
    const videoFrame = new VideoFrame(canvas, {
      timestamp: timestampUs,
      duration: frameDurationUs,
    });

    const isKeyFrame = f % (fps * 2) === 0;
    videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
    videoFrame.close();

    // Backpressure (PRD 13.5): when the encoder queue climbs past the
    // high-watermark, wait for it to drain instead of a fixed sleep so memory
    // stays bounded regardless of machine speed.
    if (videoEncoder.encodeQueueSize > EXPORT_DEFAULTS.encoderQueueHighWatermark) {
      while (videoEncoder.encodeQueueSize > EXPORT_DEFAULTS.encoderQueueHighWatermark / 2) {
        await new Promise((r) => setTimeout(r, 4));
        if (shouldCancel && shouldCancel()) {
          videoEncoder.close();
          if (audioEncoder) audioEncoder.close();
          compositor.dispose();
          throw new ExportCanceledError();
        }
      }
    }

    if (f % 10 === 0) {
      const elapsedMs = performance.now() - renderStartMs;
      const estimated = computeEstimatedRemaining(f + 1, totalFrames, elapsedMs);
      const percentage = Math.round(((f + 1) / totalFrames) * 88); // 0-88% for render phase

      updateJobState(
        jobState,
        {
          currentFrame: f + 1,
          percentage,
          elapsedMs,
          estimatedRemainingMs: estimated,
          statusText: `Rendering frame ${f + 1} of ${totalFrames}...`,
        },
        onJobStateChange,
        onProgress
      );
    }
  }

  // Encode Audio Data if present
  if (hasAudio && audioBuffer && audioEncoder) {
    updateJobState(
      jobState,
      { status: 'AUDIO', percentage: 90, statusText: 'Encoding synchronized audio track...' },
      onJobStateChange,
      onProgress
    );

    const channels = Math.min(2, audioBuffer.numberOfChannels);
    const sampleRate = audioBuffer.sampleRate;
    const totalSamples = audioBuffer.length;
    const startSample = Math.floor(startTimeSec * sampleRate);
    const endSample = Math.floor((startTimeSec + durationSec) * sampleRate);
    const totalSamplesToEncode = endSample - startSample;
    const chunkSize = 4096;

    for (let offset = 0; offset < totalSamplesToEncode; offset += chunkSize) {
      // PRD 14: cancellation must work during the AUDIO_ENCODING phase too.
      if (shouldCancel && shouldCancel()) {
        videoEncoder.close();
        audioEncoder.close();
        compositor.dispose();
        throw new ExportCanceledError();
      }
      if (encoderError) throw encoderError;

      const currentChunkLen = Math.min(chunkSize, totalSamplesToEncode - offset);
      const audioData = new Float32Array(currentChunkLen * channels);

      for (let ch = 0; ch < channels; ch++) {
        const channelSamples = audioBuffer.getChannelData(ch);
        for (let s = 0; s < currentChunkLen; s++) {
          const sampleIndex = startSample + offset + s;
          audioData[s * channels + ch] = sampleIndex < totalSamples ? channelSamples[sampleIndex] : 0;
        }
      }

      const audioDataObj = new AudioData({
        format: 'f32',
        sampleRate,
        numberOfFrames: currentChunkLen,
        numberOfChannels: channels,
        timestamp: Math.round((offset / sampleRate) * 1_000_000),
        data: audioData,
      });

      audioEncoder.encode(audioDataObj);
      audioDataObj.close();
    }
    await audioEncoder.flush();
    audioEncoder.close();
  }

  if (shouldCancel && shouldCancel()) {
    videoEncoder.close();
    compositor.dispose();
    throw new ExportCanceledError();
  }

  updateJobState(
    jobState,
    { status: 'ENCODING', percentage: 95, statusText: 'Encoding video...' },
    onJobStateChange,
    onProgress
  );

  await videoEncoder.flush();
  videoEncoder.close();

  updateJobState(
    jobState,
    { status: 'FINALIZING', percentage: 98, statusText: 'Finalizing MP4...' },
    onJobStateChange,
    onProgress
  );

  muxer.finalize();
  compositor.dispose();

  updateJobState(
    jobState,
    {
      status: 'COMPLETED',
      currentFrame: totalFrames,
      percentage: 100,
      statusText: 'Export complete!',
      elapsedMs: performance.now() - renderStartMs,
    },
    onJobStateChange,
    onProgress
  );

  return new Blob([target.buffer], { type: 'video/mp4' });
}

// ─── MediaRecorder Fallback ───────────────────────────────────────────────────

async function exportWithMediaRecorder(params: InternalExportParams): Promise<Blob> {
  const {
    canvas,
    ctx,
    fps,
    totalFrames,
    startTimeSec,
    lines,
    style,
    visualBlocks,
    trackTitle,
    artistName,
    textAnimationPreset,
    textAnimationConfig,
    compositor,
    jobState,
    onProgress,
    onJobStateChange,
    shouldCancel,
  } = params;

  return new Promise<Blob>((resolve, reject) => {
    const run = async () => {
      const stream = canvas.captureStream(fps);
      const chunks: Blob[] = [];

      const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')
        ? 'video/mp4;codecs=avc1'
        : 'video/webm';

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 8000000,
      });

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        compositor.dispose();
        resolve(new Blob(chunks, { type: mimeType }));
      };

      recorder.start();

      updateJobState(
        jobState,
        { status: 'RENDERING', statusText: 'Rendering frames (MediaRecorder)...' },
        onJobStateChange,
        onProgress
      );

      const frameDelayMs = 1000 / fps;
      const renderStartMs = performance.now();

      for (let f = 0; f < totalFrames; f++) {
        if (shouldCancel && shouldCancel()) {
          recorder.stop();
          compositor.dispose();
          return reject(new ExportCanceledError());
        }

        const currentTime = startTimeSec + (f / fps);
        renderFrame(ctx, { width: params.width, height: params.height, lines, style, visualBlocks, trackTitle, artistName, textAnimationPreset, textAnimationConfig, compositor, durationSec: params.durationSec }, currentTime);

        if (f % 15 === 0) {
          const elapsedMs = performance.now() - renderStartMs;
          const estimated = computeEstimatedRemaining(f + 1, totalFrames, elapsedMs);
          const percentage = Math.round(((f + 1) / totalFrames) * 95);

          updateJobState(
            jobState,
            {
              currentFrame: f + 1,
              percentage,
              elapsedMs,
              estimatedRemainingMs: estimated,
              statusText: `Capturing frame ${f + 1} of ${totalFrames}...`,
            },
            onJobStateChange,
            onProgress
          );
        }
        await new Promise((r) => setTimeout(r, frameDelayMs * 0.4));
      }

      recorder.stop();
    };

    run().catch((err) => {
      compositor.dispose();
      reject(err);
    });
  });
}

