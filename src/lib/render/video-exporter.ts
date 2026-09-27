import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { LyricLine, VisualLyricBlock } from '../../types/lyrics';
import type { ExportSettings, StyleConfig, MotionLayersConfig } from '../../types/project';
import type { TextAnimationPreset } from './text-animation';
import { renderEditorialFrame } from './canvas-renderer';
import { chunkAllLyricLines } from '../layout/lyric-chunker';
import { LayerCompositor } from './layer-compositor';
import { RainOverlayLayer } from '../layers/rain-overlay';
import { WatermarkLayer } from '../layers/watermark';
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

  if (motionLayers?.watermark?.enabled && motionLayers.watermark.imageUrl) {
    // Image URL format check
    const url = motionLayers.watermark.imageUrl;
    if (!url.startsWith('http') && !url.startsWith('data:') && !url.startsWith('blob:')) {
      errors.push('Watermark image URL format is not supported.');
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

  const width = exportSettings.width || 1080;
  const height = exportSettings.height || 1920;
  // PRD Section 6: 30 FPS is the default export preset.
  const fps = exportSettings.fps || 30;
  const visualBlocks = providedBlocks || chunkAllLyricLines(lines, 42);

  // Calculate total export duration
  let maxEndTime = 5;
  for (const l of lines) {
    if (l.endTime !== null && l.endTime > maxEndTime) {
      maxEndTime = l.endTime;
    }
  }

  // Include audio duration if audio enabled and present
  const hasAudio = exportSettings.includeAudio && audioBuffer && audioBuffer.duration > 0;
  
  // Resolve Output Range based on PRD Section 1 & 7
  let startTimeSec = 0;
  let durationSec = hasAudio ? Math.max(maxEndTime, audioBuffer!.duration) : maxEndTime + 1.0;
  const mode = exportSettings.outputRange?.mode || 'AUTO';
  
  if (mode === 'AUDIO' && hasAudio) {
    durationSec = audioBuffer!.duration;
  } else if (mode === 'LYRICS') {
    durationSec = maxEndTime;
  } else if (mode === 'MANUAL' || mode === 'CUSTOM') {
    startTimeSec = exportSettings.outputRange?.startTime || 0;
    const endTimeSec = exportSettings.outputRange?.endTime || durationSec;
    durationSec = Math.max(0, endTimeSec - startTimeSec);
  }

  const totalFrames = Math.ceil(durationSec * fps);

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

  if (compositor.getLayers().length > 0) {
    await compositor.prepare(false);
  }

  const textAnimationPreset: TextAnimationPreset = motionLayers?.textAnimation ?? 'slide-up';
  const textAnimationConfig = motionLayers?.textAnimationConfig;

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
  textAnimationConfig?: any;
  compositor: LayerCompositor;
  jobState: RenderJobState;
  onProgress?: (progress: ExportProgress) => void;
  onJobStateChange?: (state: RenderJobState) => void;
  shouldCancel?: () => boolean;
}

/** Render a single frame: editorial layer + overlay/watermark compositor. */
function renderFrame(
  ctx: CanvasRenderingContext2D,
  params: Pick<
    InternalExportParams,
    'width' | 'height' | 'lines' | 'style' | 'visualBlocks' | 'trackTitle' | 'artistName' | 'textAnimationPreset' | 'textAnimationConfig' | 'compositor'
  >,
  currentTime: number
): void {
  const { width, height, lines, style, visualBlocks, trackTitle, artistName, textAnimationPreset, textAnimationConfig, compositor } = params;

  // 1. Editorial lyric frame (background, text, decoration)
  renderEditorialFrame(ctx, {
    width,
    height,
    currentTime,
    lines,
    style,
    visualBlocks,
    trackTitle,
    artistName,
    textAnimationPreset,
    textAnimationConfig,
    isPreview: false,
  });

  // 2. Overlay / watermark layers on top
  if (compositor.getLayers().length > 0) {
    compositor.renderFrame(ctx, currentTime, false);
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

  const muxerOptions: any = {
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

  const bitrate = ((exportSettings?.bitrateKbps) || 8000) * 1000;
  videoEncoder.configure({
    codec: 'avc1.640028', // H.264 High Profile Level 4.0
    width,
    height,
    bitrate,
    framerate: fps,
  });

  // Audio Encoder if audio is present
  let audioEncoder: AudioEncoder | null = null;
  if (hasAudio && audioBuffer && 'AudioEncoder' in window) {
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
      throw new Error('Export cancelled by user.');
    }
    if (encoderError) throw encoderError;

    const currentTime = startTimeSec + (f / fps);

    renderFrame(ctx, { width, height, lines, style, visualBlocks, trackTitle, artistName, textAnimationPreset, textAnimationConfig, compositor }, currentTime);

    const timestampUs = f * frameDurationUs;
    const videoFrame = new VideoFrame(canvas, {
      timestamp: timestampUs,
      duration: frameDurationUs,
    });

    const isKeyFrame = f % (fps * 2) === 0;
    videoEncoder.encode(videoFrame, { keyFrame: isKeyFrame });
    videoFrame.close();

    // Check queue pressure to avoid exhausting browser memory
    if (videoEncoder.encodeQueueSize > 10) {
      await new Promise((r) => setTimeout(r, 10));
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
      { status: 'MUXING', percentage: 90, statusText: 'Muxing synchronized audio track...' },
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

  updateJobState(
    jobState,
    { status: 'ENCODING', percentage: 95, statusText: 'Encoding video...' },
    onJobStateChange,
    onProgress
  );

  await videoEncoder.flush();
  videoEncoder.close();

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
          return reject(new Error('Export cancelled by user.'));
        }

        const currentTime = startTimeSec + (f / fps);
        renderFrame(ctx, { width: params.width, height: params.height, lines, style, visualBlocks, trackTitle, artistName, textAnimationPreset, textAnimationConfig, compositor }, currentTime);

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

