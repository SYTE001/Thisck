import React, { useRef, useState } from 'react';
import {
  Scissors,
  Layers,
  ZoomIn,
  ZoomOut,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';
import type { LyricLine } from '../types/lyrics';
import { formatSecondsToTimecode } from '../lib/lyrics/lrc-parser';
import {
  formatTimingField,
  parseTimingField,
  nudgeDeltaMsForKey,
} from '../lib/timeline/timing-edit';
import { snapTime, DEFAULT_SNAP_MODE, type SnapMode } from '../lib/timeline/snapping';
import { detectOverlaps } from '../lib/timeline/timeline-model';
import { WaveformCanvas } from './WaveformCanvas';

/**
 * Numeric Start / End / Length editor for the selected line (PRD 6.1).
 * Fields accept MM:SS.mmm or plain seconds. Arrow keys nudge by ±10ms,
 * Shift ±100ms, Ctrl/Cmd ±1000ms. Committed values are snapped.
 */
const NumericTimingEditor: React.FC<{
  line: LyricLine;
  snapMode: SnapMode;
  onUpdateLineTiming: (lineId: string, start: number, end: number) => void;
}> = ({ line, snapMode, onUpdateLineTiming }) => {
  const start = line.startTime as number;
  const end = line.endTime as number;
  const length = Math.max(0, end - start);

  const [draft, setDraft] = useState<{ field: 'start' | 'end' | 'length'; value: string } | null>(
    null
  );

  const snap = (t: number) => snapTime(Math.max(0, t), snapMode, { fps: 30 });

  const commit = (field: 'start' | 'end' | 'length', raw: string) => {
    const parsed = parseTimingField(raw);
    setDraft(null);
    if (parsed === null) return;
    if (field === 'start') onUpdateLineTiming(line.id, snap(parsed), end);
    else if (field === 'end') onUpdateLineTiming(line.id, start, snap(parsed));
    else onUpdateLineTiming(line.id, start, snap(start + parsed));
  };

  const nudge = (field: 'start' | 'end' | 'length', e: React.KeyboardEvent) => {
    const deltaMs = nudgeDeltaMsForKey(e.key, e);
    if (deltaMs === null) {
      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      return;
    }
    e.preventDefault();
    const d = deltaMs / 1000;
    if (field === 'start') onUpdateLineTiming(line.id, snap(start + d), end);
    else if (field === 'end') onUpdateLineTiming(line.id, start, snap(end + d));
    else onUpdateLineTiming(line.id, start, snap(start + Math.max(0, length + d)));
  };

  const fieldValue = (field: 'start' | 'end' | 'length', actual: number) =>
    draft?.field === field ? draft.value : formatTimingField(actual);

  const renderField = (field: 'start' | 'end' | 'length', label: string, actual: number) => (
    <div className="timing-field">
      <label htmlFor={`timing-${field}`}>{label}</label>
      <input
        id={`timing-${field}`}
        type="text"
        inputMode="decimal"
        value={fieldValue(field, actual)}
        onChange={(e) => setDraft({ field, value: e.target.value })}
        onBlur={(e) => commit(field, e.target.value)}
        onKeyDown={(e) => nudge(field, e)}
        aria-label={`${label} (MM:SS.mmm). Arrow keys nudge 10ms, Shift 100ms, Ctrl 1000ms.`}
      />
    </div>
  );

  return (
    <div className="timing-editor" role="group" aria-label="Selected line timing">
      {renderField('start', 'Start', start)}
      {renderField('end', 'End', end)}
      {renderField('length', 'Length', length)}
    </div>
  );
};

interface TimelineEditorProps {
  lines: LyricLine[];
  currentTime: number;
  totalDuration: number;
  audioPeaks?: number[];
  selectedLineId: string | null;
  onSelectLine: (lineId: string) => void;
  onSeek: (time: number) => void;
  onUpdateLineTiming: (lineId: string, newStart: number, newEnd: number) => void;
  onNudgeLine: (lineId: string, deltaMs: number) => void;
  onSplitLine: (lineId: string) => void;
  onMergeWithNext: (lineId: string) => void;
}

export const TimelineEditor: React.FC<TimelineEditorProps> = ({
  lines,
  currentTime,
  totalDuration,
  audioPeaks,
  selectedLineId,
  onSelectLine,
  onSeek,
  onUpdateLineTiming,
  onSplitLine,
  onMergeWithNext,
}) => {
  const [zoom, setZoom] = useState(1.0);
  const [snapMode, setSnapMode] = useState<SnapMode>(DEFAULT_SNAP_MODE);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const selectedLine = lines.find((l) => l.id === selectedLineId);

  // Collision awareness (PRD 6.3): warn when the selected line overlaps a
  // neighbour by more than 50ms. We never silently alter neighbouring lines.
  const overlapIds = new Set<string>();
  for (const o of detectOverlaps(lines, 0.05)) {
    overlapIds.add(o.firstId);
    overlapIds.add(o.secondId);
  }
  const selectedOverlaps = selectedLine ? overlapIds.has(selectedLine.id) : false;

  // Pixel width per second based on zoom (e.g. 50px/sec at 1.0x)
  const pxPerSec = 52 * zoom;
  const totalTrackWidth = Math.max(900, totalDuration * pxPerSec);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + trackRef.current.scrollLeft;
    const clickedTime = Math.max(0, Math.min(totalDuration, clickX / pxPerSec));
    onSeek(snapTime(clickedTime, snapMode, { fps: 30 }));
  };

  const playheadPositionPx = currentTime * pxPerSec;

  return (
    <section className="timeline-panel">
      {/* Top Toolbar */}
      <div className="timeline-toolbar">

        {selectedLine && (
          <div className="toolbar-group selected-actions">
            <span className="selected-line-label">
              Selected: "{selectedLine.text.slice(0, 16)}..."
            </span>
            {selectedLine.startTime !== null && selectedLine.endTime !== null && (
              <NumericTimingEditor
                line={selectedLine}
                snapMode={snapMode}
                onUpdateLineTiming={onUpdateLineTiming}
              />
            )}
            {selectedOverlaps && (
              <span
                className="timeline-overlap-warning"
                title="This line overlaps a neighbour by more than 50ms"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--status-amber)', fontSize: '11px' }}
              >
                <AlertTriangle size={12} /> Overlaps neighbour
              </span>
            )}
            <button
              type="button"
              className="btn btn-xs btn-outline"
              onClick={() => onSplitLine(selectedLine.id)}
              title="Split line into two phrases"
            >
              <Scissors size={11} /> Split
            </button>
            <button
              type="button"
              className="btn btn-xs btn-outline"
              onClick={() => onMergeWithNext(selectedLine.id)}
              title="Merge with adjacent line"
            >
              <Layers size={11} /> Merge
            </button>
          </div>
        )}

        <div className="toolbar-group zoom-group">
          <label className="snap-select-label" style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            Snap
            <select
              value={snapMode}
              onChange={(e) => setSnapMode(e.target.value as SnapMode)}
              aria-label="Snap resolution"
              style={{ fontSize: '11px', padding: '2px 4px' }}
            >
              <option value="off">Off</option>
              <option value="frame">Frame</option>
              <option value="50ms">50 ms</option>
              <option value="100ms">100 ms</option>
              <option value="beat">Beat</option>
            </select>
          </label>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setZoom(Math.max(0.6, zoom - 0.25))}
            title="Zoom out timeline"
          >
            <ZoomOut size={13} />
          </button>
          <span className="zoom-text">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setZoom(Math.min(3.0, zoom + 0.25))}
            title="Zoom in timeline"
          >
            <ZoomIn size={13} />
          </button>
        </div>
      </div>

      {/* Interactive Horizontal Scroll Track */}
      <div className="timeline-scroll-container" ref={trackRef} onClick={handleTrackClick}>
        <div className="timeline-track-canvas" style={{ width: `${totalTrackWidth}px` }}>
          {/* Time Ruler (Seconds markers) */}
          <div className="time-ruler">
            {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, sec) => (
              <div
                key={sec}
                className="ruler-mark"
                style={{ left: `${sec * pxPerSec}px` }}
              >
                <span className="ruler-number">{sec % 5 === 0 ? formatSecondsToTimecode(sec, false) : ''}</span>
              </div>
            ))}
          </div>

          {/* Audio Waveform Track (Canvas — PRD 26) */}
          {audioPeaks && audioPeaks.length > 0 && (
            <div className="waveform-track">
              <WaveformCanvas peaks={audioPeaks} width={totalTrackWidth} height={40} />
            </div>
          )}

          {/* Lyric Blocks Track */}
          <div className="lyric-blocks-track">
            {lines.map((line, idx) => {
              const isUntimed = line.startTime === null || line.endTime === null;
              if (isUntimed) {
                // Stack untimed items in a warning row
                return (
                  <div
                    key={line.id}
                    className={`lyric-block untimed-block ${line.id === selectedLineId ? 'selected' : ''}`}
                    style={{ left: `${idx * 140}px`, width: '130px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectLine(line.id);
                    }}
                  >
                    <AlertCircle size={11} className="text-rose-400" />
                    <span className="block-text">{line.text}</span>
                  </div>
                );
              }

              const leftPx = line.startTime! * pxPerSec;
              const widthPx = Math.max(24, (line.endTime! - line.startTime!) * pxPerSec);
              const isSelected = line.id === selectedLineId;
              const isActiveNow =
                currentTime >= line.startTime! && currentTime < line.endTime!;

              return (
                <div
                  key={line.id}
                  className={`lyric-block ${isSelected ? 'selected' : ''} ${isActiveNow ? 'active' : ''}`}
                  style={{ left: `${leftPx}px`, width: `${widthPx}px` }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectLine(line.id);
                    onSeek(line.startTime!);
                  }}
                >
                  <span className="block-num">{idx + 1}</span>
                  <span className="block-text" title={line.text}>
                    {line.text}
                  </span>
                  <span className="block-time">
                    {formatSecondsToTimecode(line.startTime!, true)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Red Playhead */}
          <div
            className="timeline-playhead"
            style={{ transform: `translateX(${playheadPositionPx}px)` }}
          >
            <div className="playhead-head" />
            <div className="playhead-line" />
          </div>
        </div>
      </div>
    </section>
  );
};
