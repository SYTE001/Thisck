export type TimingSource =
  | 'SOURCE_LRC'
  | 'SOURCE_ENHANCED_LRC'
  | 'SOURCE_SRT'
  | 'SOURCE_SYNC_PROVIDER'
  | 'SOURCE_AUDIO_ALIGNMENT'
  | 'SOURCE_MANUAL'
  | 'SOURCE_UNKNOWN';

/**
 * The file format a lyric line was parsed from.
 *
 * Every supported input format is parsed into the SAME normalized LyricLine
 * model below, so rendering, animation, Auto Arrange and export never need to
 * know which format the data came from. `sourceFormat` is retained purely as
 * metadata: for the UI indicator, for choosing an export format, and for
 * preserving source behaviour.
 */
export type SourceFormat = 'lrc' | 'srt' | 'txt' | 'json';

/** A structurally invalid SRT block, reported with its 1-based block number. */
export interface SrtBlockError {
  /** 1-based block number as it appears in the file; 0 for file-level errors. */
  block: number;
  /** Human-readable, block-scoped message, e.g. "Block 7 contains an invalid timestamp." */
  message: string;
  reason?:
    | 'invalid timestamp'
    | 'invalid timestamp separator'
    | 'missing arrow'
    | 'missing text'
    | 'end before start'
    | 'malformed block';
}

export type LyricType = 'PRIMARY' | 'SUPPORTING' | 'ADLIB' | 'UNKNOWN';

export interface Word {
  id: string;
  text: string;
  startTime: number; // in seconds
  endTime: number; // in seconds
  confidence?: number;
  type?: LyricType;
}

/**
 * Marker describing which Auto Arrange stage produced a line.
 * Stored on LyricLine so processed output is traceable back to its source cue.
 */
export type GeneratedBy = 'original' | 'wrap' | 'smart-split' | 'audio-sync';

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

  // ─── Source provenance (normalized model) ──────────────────────────────────
  /** Which file format this line was parsed from. */
  sourceFormat?: SourceFormat;
  /**
   * The original subtitle / lyric index as written in the source file.
   * Display and debugging only: timing NEVER depends on this.
   */
  originalIndex?: number;
  /**
   * The EXACT source text, including any line breaks and inline styling tags.
   * Parsers never destroy the original content; `text` is the normalized
   * single-line form used for segmentation and display.
   */
  originalText?: string;

  // ─── Auto Arrange (non-destructive) ────────────────────────────────────────
  /** Id of the ORIGINAL cue this line was derived from. Undefined on original lines. */
  sourceLineId?: string;
  /** Which Auto Arrange stage produced this line. Undefined on original lines. */
  generatedBy?: GeneratedBy;
  /**
   * Visual line breaks decided by Auto Arrange (Wrap Only / Smart Split), or the
   * line breaks found in the source file (multi-line SRT). Purely cosmetic data:
   * `text` remains the single source of visible characters and the visual
   * chunker still owns layout. Serialized so a saved project round-trips
   * identically.
   */
  visualLines?: string[];
}

export interface TrackMetadata {
  title: string;
  artist: string;
  album?: string;
  duration?: number | null; // in seconds
  audioSource: 'NONE' | 'USER_UPLOAD';
  timingSource: TimingSource;
  timingConfidence?: number;
  /** Format of the currently loaded lyrics, for the UI indicator and export. */
  sourceFormat?: SourceFormat;
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

