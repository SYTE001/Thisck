export type TimingSource =
  | 'SOURCE_LRC'
  | 'SOURCE_ENHANCED_LRC'
  | 'SOURCE_SYNC_PROVIDER'
  | 'SOURCE_AUDIO_ALIGNMENT'
  | 'SOURCE_MANUAL'
  | 'SOURCE_UNKNOWN';

export type LyricType = 'PRIMARY' | 'SUPPORTING' | 'ADLIB' | 'UNKNOWN';

export interface Word {
  id: string;
  text: string;
  startTime: number; // in seconds
  endTime: number; // in seconds
  confidence?: number;
  type?: LyricType;
}

export interface LyricLine {
  id: string;
  text: string;
  startTime: number | null; // in seconds, null if plain TXT un-timed
  endTime: number | null; // in seconds
  words?: Word[];
  confidence?: number;
  source: TimingSource;
  customStyleSeed?: number;
  type?: LyricType;
}

export interface TrackMetadata {
  title: string;
  artist: string;
  album?: string;
  duration?: number | null; // in seconds
  audioSource: 'NONE' | 'USER_UPLOAD';
  timingSource: TimingSource;
  timingConfidence?: number;
}

export interface ValidationIssue {
  id: string;
  type: 'error' | 'warning' | 'info';
  lineId?: string;
  message: string;
  remedy: string;
  blocking: boolean;
}

export interface QualityValidationResult {
  readyToExport: boolean;
  issues: ValidationIssue[];
  totalLines: number;
  timedLines: number;
  timingSource: TimingSource;
  totalDuration: number;
}

export type VisualLayoutType =
  | 'single-line'
  | 'balanced-2-line'
  | 'stacked-3-line'
  | 'offset-stagger'
  | 'centered-hero';

export interface VisualLyricBlock {
  id: string;
  sourceLineId: string;
  text: string;
  lines: string[];
  startTime: number;
  endTime: number;
  duration: number;
  layoutType: VisualLayoutType;
  words?: Word[];
  sceneIndex: number;
  fontSizeMultiplier: number;
  type?: LyricType;
}

