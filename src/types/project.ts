import type { LyricLine, TrackMetadata, TimingSource } from './lyrics';
import type { TextAnimationPreset } from '../lib/render/text-animation';
import type { RainOverlayConfig } from '../lib/layers/rain-overlay';
import type { WatermarkConfig } from '../lib/layers/watermark';
import type { VideoTransitionsConfig } from '../lib/layers/video-transitions';
import type { ArrangeSettings, LyricsViewMode } from '../lib/lyrics/auto-arrange';

export type ActiveTab = 'projects' | 'lyrics' | 'timeline' | 'design' | 'preview' | 'export' | 'settings';

export type PresetName = 
  | 'Deep Forest' 
  | 'Olive Editorial' 
  | 'Sand Paper' 
  | 'Off White Editorial' 
  | 'Editorial Burgundy' 
  | 'Cream Editorial' 
  | 'Midnight Vintage' 
  | 'Custom';

export interface StyleConfig {
  presetName: PresetName | string;
  primaryBg: string;
  secondaryBg: string;
  primaryTextColor: string;
  secondaryTextColor: string;
  accentColor: string;
  fontFamily: 'Cormorant Garamond' | 'Playfair Display' | 'DM Serif Display' | 'Libre Baskerville' | string;
  fontSizeRatio: number; // 0.8 - 1.5, default 1.0
  lineHeight: number; // default 1.15
  letterSpacing: number; // in px
  textAlign: 'center' | 'left';
  grainIntensity: number; // 0.0 to 1.0, default 0.18
  vignetteIntensity: number; // 0.0 to 1.0, default 0.25
  alternatingScenes: boolean; // alternate primary / secondary
  showStarDecoration: boolean; // 4-point star at bottom
  maxLinesOnScreen: number; // 1 or 2, default 2
  showSupportingLyrics?: boolean;
  supportingLyricPolicy?: 'AUTO' | 'ALWAYS' | 'NEVER';
}

export type OutputRangeMode = 'AUTO' | 'MANUAL' | 'LYRICS' | 'AUDIO' | 'VIDEO' | 'CUSTOM';

export interface OutputRange {
  startTime: number;
  endTime: number;
  mode: OutputRangeMode;
}

export interface ExportSettings {
  width: number; // default 1080
  height: number; // default 1920
  aspectRatio: '9:16' | '1:1' | '16:9';
  fps: 24 | 30 | 60; // default 30 (PRD Section 6)
  bitrateKbps: number; // default 8000
  includeAudio: boolean; // true if project audio exists, false for silent MP4
  format: 'mp4' | 'webm';
  outputRange?: OutputRange;
}

import type { LyricsType, LyricsEffect, LyricsEffectConfig } from '../lib/render/lyricsAnimation/types';

/**
 * Motion layers configuration.
 * PRD Section 19-25: extensible compositing layer system.
 * Specification: Complete independent separation of LYRICS TYPE and LYRICS EFFECT.
 */
export interface MotionLayersConfig {
  /** Lyrics Type: determines content and display behavior (solid & stable) */
  lyricsType?: LyricsType;
  /** Lyrics Effect: determines visual motion and animation behavior */
  lyricsEffect?: LyricsEffect;
  /** Detailed configuration for the lyrics effect */
  lyricsEffectConfig?: LyricsEffectConfig;

  /** Legacy text animation preset (kept for backward compatibility) */
  textAnimation: TextAnimationPreset;
  /** Legacy custom settings for text animation (kept for backward compatibility) */
  textAnimationConfig?: {
    intensity?: number;
    enterDuration?: number;
    exitDuration?: number;
    highlightIntensity?: number;
    activeWordScale?: number;
    wordStagger?: number;
    blurAmount?: number;
    verticalMovement?: number;
  };
  /** Rain overlay settings */
  rain: RainOverlayConfig;
  /** Watermark layer settings */
  watermark: WatermarkConfig;
  /** Video transitions settings */
  videoTransitions?: VideoTransitionsConfig;
}

export interface AudioTrackState {
  enabled: boolean;
  source: 'USER_UPLOAD' | 'NONE';
  fileName: string | null;
  duration: number | null;
  audioBlobUrl: string | null;
  audioBuffer?: AudioBuffer | null;
  /**
   * The original encoded upload, retained (runtime-only) so API-mode AI Sync
   * can send it to a transcription endpoint. Never serialized to project JSON.
   */
  audioFile?: File | null;
  peaks?: number[]; // for waveform display
}

export interface ProjectState {
  version: 1;
  id: string;
  name: string;
  updatedAt: string;
  track: TrackMetadata;

  /**
   * The IMMUTABLE source of truth: the raw LRC as imported, with multi-timestamp
   * expansion already applied once. Auto Arrange never mutates this array.
   * `lines` below is kept as the backward-compatible alias for it.
   */
  originalLines: LyricLine[];

  /**
   * Output of the Auto Arrange stage (Wrap Only | Smart Split | Audio Sync).
   * Optional and absent in older project files: when missing, the app derives it
   * from originalLines and the current arrangeSettings.
   */
  processedLines?: LyricLine[];

  /** Auto Arrange configuration. Optional for backward compatibility. */
  arrangeSettings?: ArrangeSettings;

  /**
   * Which list is currently shown. Instant and non-destructive: switching only
   * changes the resolution point, never the stored data.
   */
  viewMode?: LyricsViewMode;

  /**
   * Backward-compatible alias. Always mirrors `originalLines` on save; on load,
   * an old file's `lines` populates `originalLines`.
   */
  lines: LyricLine[];

  style: StyleConfig;
  exportSettings: ExportSettings;
  timingSource: TimingSource;
  maxHoldDurationSec: number; // default 4.5s for lines without explicit end time
  motionLayers?: MotionLayersConfig; // optional; added in v2
}
