import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { LyricLine, VisualLyricBlock } from '../../types/lyrics';
import type { ExportSettings, StyleConfig } from '../../types/project';
import { renderEditorialFrame } from './canvas-renderer';
import { chunkAllLyricLines } from '../layout/lyric-chunker';

export interface ExportProgress {
  currentFrame: number;
  totalFrames: number;
  percentage: number;
  statusText: string;
}

export interface VideoExportOptions {
  lines: LyricLine[];
  style: StyleConfig;
  exportSettings: ExportSettings;
  visualBlocks?: VisualLyricBlock[];
  audioBuffer?: AudioBuffer | null;
  trackTitle?: string;
  artistName?: string;
  onProgress?: (progress: ExportProgress) => void;
  shouldCancel?: () => boolean;
}

export async function exportVideo(options: VideoExportOptions): Promise<Blob> {
  const {
    lines,
    style,
    exportSettings,
    visualBlocks: providedBlocks,
    audioBuffer,
    trackTitle,
    artistName,
    onProgress,
    shouldCancel,
  } = options;

  const width = exportSettings.width || 1080;
  const height = exportSettings.height || 1920;
  const fps = exportSettings.fps || 60; // 60 FPS default (Section 14)
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
  const durationSec = hasAudio ? Math.max(maxEndTime, audioBuffer!.duration) : maxEndTime + 1.0;
  const totalFrames = Math.ceil(durationSec * fps);

  // Setup offscreen canvas for rendering
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not create 2D canvas context for rendering.');

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
      durationSec,
      lines,
      style,
      visualBlocks,
      exportSettings,
      hasAudio: !!hasAudio,
      audioBuffer: hasAudio ? audioBuffer : null,
      trackTitle,
      artistName,
      onProgress,
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
    durationSec,
    lines,
    style,
    visualBlocks,
    hasAudio: !!hasAudio,
    audioBuffer: hasAudio ? audioBuffer : null,
    trackTitle,
    artistName,
    onProgress,
    shouldCancel,
  });
}

async function exportWithWebCodecs(params: {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  durationSec: number;
  lines: LyricLine[];
  style: StyleConfig;
  visualBlocks: VisualLyricBlock[];
  exportSettings: ExportSettings;
  hasAudio: boolean;
  audioBuffer?: AudioBuffer | null;
  trackTitle?: string;
  artistName?: string;
  onProgress?: (progress: ExportProgress) => void;
  shouldCancel?: () => boolean;
}): Promise<Blob> {
  const {
    canvas,
    ctx,
    width,
    height,
    fps,
    totalFrames,
    lines,
    style,
    visualBlocks,
    exportSettings,
    hasAudio,
    audioBuffer,
    trackTitle,
    artistName,
    onProgress,
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

  const bitrate = (exportSettings.bitrateKbps || 8000) * 1000;
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

  // Render video frames deterministically
  for (let f = 0; f < totalFrames; f++) {
    if (shouldCancel && shouldCancel()) {
      videoEncoder.close();
      if (audioEncoder) audioEncoder.close();
      throw new Error('Export cancelled by user.');
    }
    if (encoderError) throw encoderError;

    const currentTime = f / fps;
    renderEditorialFrame(ctx, {
      width,
      height,
      currentTime,
      lines,
      style,
      visualBlocks,
      trackTitle,
      artistName,
    });

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

    if (f % 10 === 0 && onProgress) {
      onProgress({
        currentFrame: f + 1,
        totalFrames,
        percentage: Math.round(((f + 1) / totalFrames) * 90),
        statusText: `Rendering frame ${f + 1} of ${totalFrames}...`,
      });
    }
  }

  // Encode Audio Data if present
  if (hasAudio && audioBuffer && audioEncoder) {
    if (onProgress) {
      onProgress({
        currentFrame: totalFrames,
        totalFrames,
        percentage: 92,
        statusText: 'Muxing synchronized audio track...',
      });
    }

    const channels = Math.min(2, audioBuffer.numberOfChannels);
    const sampleRate = audioBuffer.sampleRate;
    const totalSamples = audioBuffer.length;
    const chunkSize = 4096;

    for (let offset = 0; offset < totalSamples; offset += chunkSize) {
      const currentChunkLen = Math.min(chunkSize, totalSamples - offset);
      const audioData = new Float32Array(currentChunkLen * channels);

      for (let ch = 0; ch < channels; ch++) {
        const channelSamples = audioBuffer.getChannelData(ch);
        for (let s = 0; s < currentChunkLen; s++) {
          audioData[s * channels + ch] = channelSamples[offset + s];
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

  await videoEncoder.flush();
  videoEncoder.close();

  muxer.finalize();

  if (onProgress) {
    onProgress({
      currentFrame: totalFrames,
      totalFrames,
      percentage: 100,
      statusText: 'Export complete!',
    });
  }

  return new Blob([target.buffer], { type: 'video/mp4' });
}

// MediaRecorder Fallback
async function exportWithMediaRecorder(params: {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  durationSec: number;
  lines: LyricLine[];
  style: StyleConfig;
  visualBlocks: VisualLyricBlock[];
  hasAudio: boolean;
  audioBuffer?: AudioBuffer | null;
  trackTitle?: string;
  artistName?: string;
  onProgress?: (progress: ExportProgress) => void;
  shouldCancel?: () => boolean;
}): Promise<Blob> {
  const {
    canvas,
    ctx,
    width,
    height,
    fps,
    totalFrames,
    lines,
    style,
    visualBlocks,
    trackTitle,
    artistName,
    onProgress,
    shouldCancel,
  } = params;

  return new Promise(async (resolve, reject) => {
    try {
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
        resolve(new Blob(chunks, { type: mimeType }));
      };

      recorder.start();

      const frameDelayMs = 1000 / fps;
      for (let f = 0; f < totalFrames; f++) {
        if (shouldCancel && shouldCancel()) {
          recorder.stop();
          return reject(new Error('Export cancelled.'));
        }

        renderEditorialFrame(ctx, {
          width,
          height,
          currentTime: f / fps,
          lines,
          style,
          visualBlocks,
          trackTitle,
          artistName,
        });

        if (f % 15 === 0 && onProgress) {
          onProgress({
            currentFrame: f + 1,
            totalFrames,
            percentage: Math.round(((f + 1) / totalFrames) * 98),
            statusText: `Capturing frame ${f + 1} of ${totalFrames}...`,
          });
        }
        await new Promise((r) => setTimeout(r, frameDelayMs * 0.4));
      }

      recorder.stop();
    } catch (err) {
      reject(err);
    }
  });
}
