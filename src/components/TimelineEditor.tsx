import React, { useRef, useState } from 'react';
import {
  Scissors,
  Layers,
  FastForward,
  Rewind,
  ZoomIn,
  ZoomOut,
  AlertCircle,
} from 'lucide-react';
import type { LyricLine } from '../types/lyrics';
import { formatSecondsToTimecode } from '../lib/lyrics/lrc-parser';

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
  onNudgeLine,
  onSplitLine,
  onMergeWithNext,
}) => {
  const [zoom, setZoom] = useState(1.0);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const selectedLine = lines.find((l) => l.id === selectedLineId);

  // Pixel width per second based on zoom (e.g. 50px/sec at 1.0x)
  const pxPerSec = 52 * zoom;
  const totalTrackWidth = Math.max(900, totalDuration * pxPerSec);

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + trackRef.current.scrollLeft;
    const clickedTime = Math.max(0, Math.min(totalDuration, clickX / pxPerSec));
    onSeek(clickedTime);
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
              <span className="time-edit-group" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  style={{ width: '56px', padding: '2px 4px', fontSize: '11px', background: '#252220', border: '1px solid #444', color: '#fff', borderRadius: '3px' }}
                  value={selectedLine.startTime}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) onUpdateLineTiming(selectedLine.id, val, selectedLine.endTime!);
                  }}
                  title="Line Start (seconds)"
                />
                <span>-</span>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  style={{ width: '56px', padding: '2px 4px', fontSize: '11px', background: '#252220', border: '1px solid #444', color: '#fff', borderRadius: '3px' }}
                  value={selectedLine.endTime}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) onUpdateLineTiming(selectedLine.id, selectedLine.startTime!, val);
                  }}
                  title="Line End (seconds)"
                />
                <span style={{ fontSize: '10px', color: '#888' }}>s</span>
              </span>
            )}
            <button
              type="button"
              className="btn btn-xs btn-outline"
              onClick={() => onNudgeLine(selectedLine.id, -100)}
              title="Nudge line -100ms"
            >
              <Rewind size={11} /> -100ms
            </button>
            <button
              type="button"
              className="btn btn-xs btn-outline"
              onClick={() => onNudgeLine(selectedLine.id, 100)}
              title="Nudge line +100ms"
            >
              <FastForward size={11} /> +100ms
            </button>
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

          {/* Audio Waveform Track (if available) */}
          {audioPeaks && audioPeaks.length > 0 && (
            <div className="waveform-track">
              {audioPeaks.map((peak, idx) => {
                const leftPercent = (idx / audioPeaks.length) * 100;
                const barHeight = Math.max(2, Math.round(peak * 32));
                return (
                  <div
                    key={idx}
                    className="waveform-bar"
                    style={{
                      left: `${leftPercent}%`,
                      height: `${barHeight}px`,
                    }}
                  />
                );
              })}
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
