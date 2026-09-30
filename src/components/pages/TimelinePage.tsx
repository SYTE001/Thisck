import React, { useRef, useState, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  ZoomIn, 
  ZoomOut, 
  Scissors, 
  Merge, 
  Plus, 
  Minus, 
  Magnet, 
  Volume2,
  Sliders
} from 'lucide-react';
import type { LyricLine, QualityValidationResult } from '../../types/lyrics';
import { formatSecondsToTimecode } from '../../lib/lyrics/lrc-parser';

interface TimelinePageProps {
  lines: LyricLine[];
  currentTime: number;
  totalDuration: number;
  resolvedOutputRange?: { startTime: number; endTime: number; mode: string };
  isPlaying: boolean;
  audioPeaks?: number[];
  audioFileName?: string | null;
  selectedLineId: string | null;
  validation: QualityValidationResult;
  onPlayPause: () => void;
  onRestart: () => void;
  onSelectLine: (lineId: string) => void;
  onSeek: (time: number) => void;
  onUpdateLineTiming: (lineId: string, newStart: number, newEnd: number) => void;
  onNudgeLine: (lineId: string, deltaMs: number) => void;
  onSplitLine: (lineId: string) => void;
  onMergeWithNext: (lineId: string) => void;
  onApplyGlobalOffset: (deltaMs: number) => void;
}

export const TimelinePage: React.FC<TimelinePageProps> = ({
  lines,
  currentTime,
  totalDuration,
  resolvedOutputRange,
  isPlaying,
  audioPeaks,
  audioFileName,
  selectedLineId,
  validation: _validation,
  onPlayPause,
  onRestart,
  onSelectLine,
  onSeek,
  onUpdateLineTiming,
  onNudgeLine,
  onSplitLine,
  onMergeWithNext,
  onApplyGlobalOffset,
}) => {
  const [zoom, setZoom] = useState(1.2);
  const [snapping, setSnapping] = useState(true);
  const trackContainerRef = useRef<HTMLDivElement | null>(null);

  // Dragging state for trim handles
  const [dragState, setDragState] = useState<{
    lineId: string;
    type: 'start' | 'end';
    startX: number;
    initialStart: number;
    initialEnd: number;
  } | null>(null);

  const selectedLine = lines.find((l) => l.id === selectedLineId);

  // Pixels per second calculation
  const pxPerSec = 64 * zoom;
  const totalTrackWidth = Math.max(1200, totalDuration * pxPerSec);

  // Ruler markers every 1s or 5s depending on zoom
  const stepSec = zoom >= 2.0 ? 1 : zoom >= 1.0 ? 2 : 5;
  const markerCount = Math.ceil(totalDuration / stepSec) + 1;
  const markers = Array.from({ length: markerCount }, (_, i) => i * stepSec);

  // Playhead click & scrub
  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackContainerRef.current) return;
    const rect = trackContainerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left + trackContainerRef.current.scrollLeft;
    let clickedTime = Math.max(0, Math.min(totalDuration, clickX / pxPerSec));
    if (snapping) {
      // Snap to nearest 100ms
      clickedTime = Math.round(clickedTime * 10) / 10;
    }
    onSeek(clickedTime);
  };

  // Drag handle listeners
  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaPx = e.clientX - dragState.startX;
      const deltaSec = deltaPx / pxPerSec;

      if (dragState.type === 'start') {
        let newStart = dragState.initialStart + deltaSec;
        if (snapping) newStart = Math.round(newStart * 20) / 20; // 50ms snap
        newStart = Math.max(0, Math.min(dragState.initialEnd - 0.2, newStart));
        onUpdateLineTiming(dragState.lineId, newStart, dragState.initialEnd);
      } else {
        let newEnd = dragState.initialEnd + deltaSec;
        if (snapping) newEnd = Math.round(newEnd * 20) / 20;
        newEnd = Math.max(dragState.initialStart + 0.2, Math.min(totalDuration, newEnd));
        onUpdateLineTiming(dragState.lineId, dragState.initialStart, newEnd);
      }
    };

    const handleMouseUp = () => {
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, pxPerSec, snapping, totalDuration, onUpdateLineTiming]);

  // Auto-scroll track with playhead when playing
  useEffect(() => {
    if (!isPlaying || !trackContainerRef.current) return;
    const playheadPx = currentTime * pxPerSec;
    const container = trackContainerRef.current;
    const halfWidth = container.clientWidth / 2;

    if (playheadPx > container.scrollLeft + halfWidth + 100 || playheadPx < container.scrollLeft) {
      container.scrollLeft = playheadPx - 100;
    }
  }, [currentTime, isPlaying, pxPerSec]);

  return (
    <div className="workspace-page timeline-page">
      {/* Top Transport & Tooling Bar */}
      <div className="timeline-page-toolbar">
        <div className="transport-controls">
          <button
            type="button"
            className="transport-btn play-btn"
            onClick={onPlayPause}
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button
            type="button"
            className="transport-btn"
            onClick={onRestart}
            title="Rewind to start"
          >
            <RotateCcw size={15} />
          </button>

          <div className="timecode-display">
            <span className="current-time">{formatSecondsToTimecode(currentTime)}</span>
            <span className="time-separator">/</span>
            <span className="total-time">{formatSecondsToTimecode(resolvedOutputRange?.endTime || totalDuration)}</span>
          </div>
        </div>

        <div className="toolbar-divider" />

        {/* Global Offset Controls */}
        <div className="global-offset-tools">
          <span className="tools-label">Global Offset:</span>
          <button
            type="button"
            className="offset-chip"
            onClick={() => onApplyGlobalOffset(-250)}
            title="Shift all lines back by 250ms"
          >
            -250ms
          </button>
          <button
            type="button"
            className="offset-chip"
            onClick={() => onApplyGlobalOffset(-100)}
            title="Shift all lines back by 100ms"
          >
            -100ms
          </button>
          <button
            type="button"
            className="offset-chip"
            onClick={() => onApplyGlobalOffset(100)}
            title="Shift all lines forward by 100ms"
          >
            +100ms
          </button>
          <button
            type="button"
            className="offset-chip"
            onClick={() => onApplyGlobalOffset(250)}
            title="Shift all lines forward by 250ms"
          >
            +250ms
          </button>
        </div>

        <div className="toolbar-divider" />

        {/* Zoom & Snapping */}
        <div className="zoom-snap-tools">
          <button
            type="button"
            className={`tool-toggle-btn ${snapping ? 'is-active' : ''}`}
            onClick={() => setSnapping(!snapping)}
            title="Toggle Magnet Snapping"
          >
            <Magnet size={14} />
            <span>Snap</span>
          </button>

          <div className="zoom-stepper">
            <button
              type="button"
              className="zoom-btn"
              onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
              title="Zoom out"
            >
              <ZoomOut size={13} />
            </button>
            <span className="zoom-label">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              className="zoom-btn"
              onClick={() => setZoom((z) => Math.min(3.0, z + 0.2))}
              title="Zoom in"
            >
              <ZoomIn size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Main Track Workspace */}
      <div className="timeline-track-workspace">
        <div className="track-scroll-container" ref={trackContainerRef} onClick={handleTrackClick}>
          <div className="track-canvas-area" style={{ width: `${totalTrackWidth}px` }}>
            {/* PRD Section 6: visually mute outside output range */}
            {resolvedOutputRange && (
              <>
                <div style={{
                  position: 'absolute',
                  top: 0, bottom: 0, left: 0,
                  width: `${resolvedOutputRange.startTime * pxPerSec}px`,
                  backgroundColor: 'rgba(25, 49, 61, 0.32)',
                  pointerEvents: 'none',
                  zIndex: 20
                }} />
                <div style={{
                  position: 'absolute',
                  top: 0, bottom: 0,
                  left: `${resolvedOutputRange.endTime * pxPerSec}px`,
                  right: 0,
                  backgroundColor: 'rgba(25, 49, 61, 0.32)',
                  pointerEvents: 'none',
                  zIndex: 20
                }} />
              </>
            )}

            {/* Time Ruler */}
            <div className="timeline-ruler">
              {markers.map((sec) => (
                <div
                  key={sec}
                  className="ruler-tick-mark"
                  style={{ left: `${sec * pxPerSec}px` }}
                >
                  <span className="ruler-label">{formatSecondsToTimecode(sec)}</span>
                  <div className="tick-line" />
                </div>
              ))}
            </div>

            {/* Audio Waveform Track */}
            <div className="timeline-audio-track">
              <div className="track-header-tag">
                <Volume2 size={12} />
                <span>{audioFileName ? 'Audio Master Track' : 'No Audio Linked (Silent Clock)'}</span>
              </div>
              <div className="waveform-display">
                {audioPeaks && audioPeaks.length > 0 ? (
                  audioPeaks.map((peak, idx) => (
                    <div
                      key={idx}
                      className="wave-bar"
                      style={{
                        height: `${Math.max(4, peak * 42)}px`,
                        left: `${(idx / audioPeaks.length) * totalTrackWidth}px`,
                      }}
                    />
                  ))
                ) : (
                  <div className="waveform-placeholder-line" />
                )}
              </div>
            </div>

            {/* Lyrics Block Track */}
            <div className="timeline-lyrics-track">
              <div className="track-header-tag">
                <Sliders size={12} />
                <span>Lyric Phrase Blocks</span>
              </div>

              <div className="blocks-lane">
                {lines.map((line, idx) => {
                  if (line.startTime === null || line.endTime === null) return null;
                  const leftPx = line.startTime * pxPerSec;
                  const widthPx = Math.max(24, (line.endTime - line.startTime) * pxPerSec);
                  const isSelected = selectedLineId === line.id;
                  const isPlayingActive = currentTime >= line.startTime && currentTime < line.endTime;

                  return (
                    <div
                      key={line.id}
                      className={`timeline-lyric-block ${isSelected ? 'is-selected' : ''} ${isPlayingActive ? 'is-active' : ''}`}
                      style={{
                        left: `${leftPx}px`,
                        width: `${widthPx}px`,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectLine(line.id);
                        onSeek(line.startTime!);
                      }}
                    >
                      {/* Left Trim Handle */}
                      <div
                        className="trim-handle trim-handle-left"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setDragState({
                            lineId: line.id,
                            type: 'start',
                            startX: e.clientX,
                            initialStart: line.startTime!,
                            initialEnd: line.endTime!,
                          });
                        }}
                        title="Drag to adjust phrase start"
                      />

                      <div className="block-content">
                        <span className="block-num">{(idx + 1).toString().padStart(2, '0')}</span>
                        <span className="block-text">{line.text}</span>
                        <span className="block-dur">
                          {(line.endTime - line.startTime).toFixed(2)}s
                        </span>
                      </div>

                      {/* Right Trim Handle */}
                      <div
                        className="trim-handle trim-handle-right"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setDragState({
                            lineId: line.id,
                            type: 'end',
                            startX: e.clientX,
                            initialStart: line.startTime!,
                            initialEnd: line.endTime!,
                          });
                        }}
                        title="Drag to adjust phrase end"
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Scrubbing Playhead */}
            <div
              className="timeline-playhead-line"
              style={{ left: `${currentTime * pxPerSec}px` }}
            >
              <div className="playhead-head" />
            </div>
          </div>
        </div>
      </div>

      {/* Selected Block Inspector Drawer */}
      {selectedLine && (
        <div className="selected-block-inspector">
          <div className="inspector-left">
            <span className="inspector-label">Selected Phrase:</span>
            <span className="inspector-quote">"{selectedLine.text}"</span>
          </div>

          <div className="inspector-timing-inputs">
            <div className="input-with-label">
              <label>Start (sec)</label>
              <input
                type="number"
                step="0.05"
                min="0"
                value={selectedLine.startTime ?? 0}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) {
                    onUpdateLineTiming(selectedLine.id, val, selectedLine.endTime ?? val + 2);
                  }
                }}
                className="inspector-num-input"
              />
            </div>

            <span className="timing-dash">—</span>

            <div className="input-with-label">
              <label>End (sec)</label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                value={selectedLine.endTime ?? 0}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val)) {
                    onUpdateLineTiming(selectedLine.id, selectedLine.startTime ?? 0, val);
                  }
                }}
                className="inspector-num-input"
              />
            </div>

            <div className="input-with-label">
              <label>Duration</label>
              <span className="computed-duration">
                {selectedLine.startTime !== null && selectedLine.endTime !== null
                  ? `${(selectedLine.endTime - selectedLine.startTime).toFixed(2)}s`
                  : '--'}
              </span>
            </div>
          </div>

          <div className="inspector-actions">
            <button
              type="button"
              className="inspector-btn"
              onClick={() => onNudgeLine(selectedLine.id, -100)}
              title="Nudge -100ms"
            >
              <Minus size={13} />
              <span>100ms</span>
            </button>
            <button
              type="button"
              className="inspector-btn"
              onClick={() => onNudgeLine(selectedLine.id, 100)}
              title="Nudge +100ms"
            >
              <Plus size={13} />
              <span>100ms</span>
            </button>
            <button
              type="button"
              className="inspector-btn"
              onClick={() => onSplitLine(selectedLine.id)}
              title="Split line at midpoint"
            >
              <Scissors size={13} />
              <span>Split</span>
            </button>
            <button
              type="button"
              className="inspector-btn"
              onClick={() => onMergeWithNext(selectedLine.id)}
              title="Merge with next line"
            >
              <Merge size={13} />
              <span>Merge</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
