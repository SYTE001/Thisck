import React from 'react';
import { Sparkles, RotateCcw, Wand2, AlertTriangle, Loader2 } from 'lucide-react';
import type { LyricLine } from '../types/lyrics';
import {
  describeArrangeStats,
  type ArrangeMode,
  type ArrangeSettings,
  type LyricsViewMode,
} from '../lib/lyrics/auto-arrange';

interface AutoArrangePanelProps {
  originalLines: LyricLine[];
  processedLines: LyricLine[];
  arrangeSettings: ArrangeSettings;
  viewMode: LyricsViewMode;
  hasAudio: boolean;
  isAudioSyncLoading: boolean;
  audioSyncProgress: number;
  audioSyncError: string | null;
  log: string[];
  onSettingsChange: (settings: ArrangeSettings) => void;
  onApply: () => void;
  onReset: () => void;
  onViewModeChange: (mode: LyricsViewMode) => void;
}

/**
 * AUTO ARRANGE PANEL
 *
 * Compact, non-destructive controls for the segmentation stage. This component
 * only decides WHICH cues exist and WHEN they appear. It has no knowledge of
 * lyrics types, lyrics effects or animation.
 */
export const AutoArrangePanel: React.FC<AutoArrangePanelProps> = ({
  originalLines,
  processedLines,
  arrangeSettings,
  viewMode,
  hasAudio,
  isAudioSyncLoading,
  audioSyncProgress,
  audioSyncError,
  log,
  onSettingsChange,
  onApply,
  onReset,
  onViewModeChange,
}) => {
  const set = <K extends keyof ArrangeSettings>(key: K, value: ArrangeSettings[K]) =>
    onSettingsChange({ ...arrangeSettings, [key]: value });

  const hasProcessed = processedLines.length > 0;
  const statLine = describeArrangeStats(originalLines.length, processedLines.length);

  const modes: Array<{ id: ArrangeMode; label: string; hint: string; disabled?: boolean }> = [
    { id: 'wrap-only', label: 'Wrap Only', hint: 'Line breaks only. Timing untouched.' },
    { id: 'smart-split', label: 'Smart Split', hint: 'Recommended for 9:16 readability.' },
    {
      id: 'audio-sync',
      label: 'Audio Sync',
      hint: hasAudio
        ? 'Uses word-level timings from your audio.'
        : 'Load an audio file to enable word-level timing.',
      disabled: !hasAudio,
    },
  ];

  const selectField = (
    id: string,
    label: string,
    value: number,
    options: number[],
    onChange: (n: number) => void
  ) => (
    <div className="aa-field">
      <label className="form-label-sm" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="select-field"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {options.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );

  const toggle = (label: string, on: boolean, onClick: () => void) => (
    <div className="aa-toggle-row">
      <span className="form-label-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={`toggle-pill ${on ? 'is-on' : ''}`}
        onClick={onClick}
      >
        <span className="toggle-knob" />
      </button>
    </div>
  );

  return (
    <div className="auto-arrange-panel">
      <div className="aa-header">
        <span className="aa-title">
          <Sparkles size={13} /> Auto Arrange
        </span>
        <span className="aa-stat" title={statLine}>
          {statLine}
        </span>
      </div>

      <div className="button-group-segment aa-modes" role="group" aria-label="Auto Arrange mode">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`segment-btn ${arrangeSettings.mode === m.id ? 'is-active' : ''}`}
            onClick={() => set('mode', m.id)}
            disabled={m.disabled}
            title={m.hint}
            aria-pressed={arrangeSettings.mode === m.id}
          >
            {m.id === 'smart-split' ? 'Smart Split ★' : m.label}
          </button>
        ))}
      </div>

      <div className="aa-settings">
        {selectField(
          'aa-max-words',
          'Max words per cue',
          arrangeSettings.maxWordsPerCue,
          [4, 5, 6, 7, 8, 10, 12],
          (n) => set('maxWordsPerCue', n)
        )}
        {selectField(
          'aa-max-chars',
          'Max chars per line',
          arrangeSettings.maxCharsPerLine,
          [20, 24, 28, 32, 36, 42],
          (n) => set('maxCharsPerLine', n)
        )}
        {selectField('aa-max-lines', 'Max lines', arrangeSettings.maxLines, [1, 2, 3], (n) =>
          set('maxLines', n)
        )}

        <div className="aa-field aa-field-wide">
          <div className="slider-label-row">
            <label className="form-label-sm" htmlFor="aa-aggression">
              Split aggressiveness
            </label>
            <span className="slider-value">{arrangeSettings.splitAggressiveness}</span>
          </div>
          <input
            id="aa-aggression"
            type="range"
            className="range-slider"
            min={0}
            max={100}
            step={5}
            value={arrangeSettings.splitAggressiveness}
            onChange={(e) => set('splitAggressiveness', Number(e.target.value))}
          />
          <p className="slider-hint">Never exceeds the max words per cue above.</p>
        </div>
      </div>

      <div className="aa-toggles">
        {toggle('Preserve punctuation', arrangeSettings.preservePunctuation, () =>
          set('preservePunctuation', !arrangeSettings.preservePunctuation)
        )}
        {toggle('Preserve original boundaries', arrangeSettings.preserveOriginalBoundaries, () =>
          set('preserveOriginalBoundaries', !arrangeSettings.preserveOriginalBoundaries)
        )}
      </div>

      <div className="aa-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onApply}
          disabled={isAudioSyncLoading}
        >
          {isAudioSyncLoading ? (
            <Loader2 size={13} className="spin-animation" />
          ) : (
            <Wand2 size={13} />
          )}
          <span>{isAudioSyncLoading ? 'Analysing...' : 'Apply to All'}</span>
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onReset}
          disabled={!hasProcessed}
          title="Discard the processed cues and show the original LRC again"
        >
          <RotateCcw size={13} />
          <span>Reset to Original</span>
        </button>
      </div>

      {isAudioSyncLoading && (
        <p className="aa-status">Loading word timings: {Math.round(audioSyncProgress * 100)}%</p>
      )}
      {audioSyncError && (
        <p className="aa-status aa-status-error">
          <AlertTriangle size={12} /> {audioSyncError}
        </p>
      )}

      <div className="aa-viewmode">
        <div className="button-group-segment" role="group" aria-label="Lyrics view mode">
          <button
            type="button"
            className={`segment-btn ${viewMode === 'original' ? 'is-active' : ''}`}
            onClick={() => onViewModeChange('original')}
            aria-pressed={viewMode === 'original'}
          >
            Original LRC
          </button>
          <button
            type="button"
            className={`segment-btn ${viewMode === 'processed' ? 'is-active' : ''}`}
            onClick={() => onViewModeChange('processed')}
            disabled={!hasProcessed}
            title={hasProcessed ? undefined : 'Apply Auto Arrange first'}
            aria-pressed={viewMode === 'processed'}
          >
            Processed
          </button>
        </div>
        <p className="aa-hint">
          {viewMode === 'original'
            ? 'Showing the imported LRC exactly as written.'
            : 'Showing arranged cues. Edits here apply to the processed list.'}
        </p>
      </div>

      {log.length > 0 && (
        <ul className="aa-log">
          {log.slice(0, 3).map((msg, i) => (
            <li key={i}>{msg}</li>
          ))}
        </ul>
      )}

      {!hasProcessed && (
        <p className="aa-hint">
          Tip: Smart Split is on by default. Press “Apply to All” to generate shorter,
          mobile-friendly cues from your LRC.
        </p>
      )}
    </div>
  );
};
