import React, { useRef, useState, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Minimize2, 
  Layers, 
  ArrowRight,
  CheckCircle2
} from 'lucide-react';
import type { LyricLine, VisualLyricBlock, TimingSource } from '../../types/lyrics';
import type { StyleConfig, ActiveTab, MotionLayersConfig } from '../../types/project';
import { formatSecondsToTimecode } from '../../lib/lyrics/lrc-parser';
import { getActiveVisualBlockAt } from '../../lib/layout/lyric-chunker';
import { renderEditorialFrame } from '../../lib/render/canvas-renderer';
import { createRenderContext } from '../../lib/render/render-context';

interface PreviewPageProps {
  lines: LyricLine[];
  style: StyleConfig;
  visualBlocks: VisualLyricBlock[];
  currentTime: number;
  totalDuration: number;
  isPlaying: boolean;
  audioBlobUrl: string | null;
  trackTitle: string;
  artistName: string;
  timingSource: TimingSource;
  onTimeUpdate: (time: number) => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onPrevLine: () => void;
  onNextLine: () => void;
  onNavigateTab: (tab: ActiveTab) => void;
  resolvedOutputRange?: { startTime: number; endTime: number; mode: string };
  exportSettings?: any;
  onUpdateExportSettings?: (settings: any) => void;
  motionLayers?: MotionLayersConfig;
  /** PRD Section 5: playback speed/mute are owned by App's audio clock. */
  playbackSpeed?: number;
  isMuted?: boolean;
  onSpeedChange?: (speed: number) => void;
  onToggleMute?: () => void;
}

export const PreviewPage: React.FC<PreviewPageProps> = ({
  lines: _lines,
  style,
  visualBlocks,
  currentTime,
  totalDuration,
  isPlaying,
  audioBlobUrl,
  trackTitle,
  artistName,
  timingSource,
  onTimeUpdate,
  onPlayPause,
  onRestart,
  onPrevLine,
  onNextLine,
  onNavigateTab,
  resolvedOutputRange,
  exportSettings,
  onUpdateExportSettings,
  motionLayers,
  playbackSpeed = 1.0,
  isMuted = false,
  onSpeedChange,
  onToggleMute,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [showSafeAreas, setShowSafeAreas] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Audio playback is owned by App's single authoritative audio element
  // (PRD Section 5). This page only renders the canvas and transport controls.

  // Render canvas frame on time change or style change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderEditorialFrame(
      ctx,
      createRenderContext(
        {
          lines: _lines,
          style,
          visualBlocks,
          trackTitle,
          artistName,
          motion: motionLayers,
        },
        currentTime,
        { width: canvas.width, height: canvas.height, isPreview: true }
      )
    );
  }, [_lines, currentTime, style, visualBlocks, trackTitle, artistName, motionLayers]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  // Active block information
  const { activeBlock, activeIndex } = getActiveVisualBlockAt(visualBlocks, currentTime);

  return (
    <div className="workspace-page preview-page" ref={containerRef}>
      {/* Main Review Stage */}
      <div className="preview-stage-layout">
        <div className="preview-canvas-wrapper">
          <canvas
            ref={canvasRef}
            width={1080}
            height={1920}
            className="preview-editorial-canvas"
            onClick={onPlayPause}
          />

          {showSafeAreas && (
            <div className="preview-safe-overlay">
              <div className="safe-margin-top">Safe Top (Header / Notch)</div>
              <div className="safe-margin-right">Actions Sidebar</div>
              <div className="safe-margin-bottom">Caption / Sound Info</div>
            </div>
          )}
        </div>

        {/* Right Info Strip */}
        <div className="preview-info-strip">
          <div className="info-card-block">
            <span className="info-label">Active Phrase</span>
            <p className="active-lyric-display">
              {activeBlock ? `"${activeBlock.text}"` : <span className="text-dim">Between phrases...</span>}
            </p>
            {activeBlock && (
              <div className="phrase-meta-row">
                <span className="badge-subtle">Index: {activeIndex + 1} / {visualBlocks.length}</span>
                <span className="badge-subtle">Layout: {activeBlock.layoutType}</span>
                <span className="badge-subtle">{(activeBlock.duration).toFixed(2)}s</span>
              </div>
            )}
          </div>

          <div className="info-card-block">
            <span className="info-label">Synchronization Engine</span>
            <div className="engine-status-list">
              <div className="engine-status-item">
                <CheckCircle2 size={13} className="text-emerald" />
                <span>Deterministic 60 FPS clock</span>
              </div>
              <div className="engine-status-item">
                <CheckCircle2 size={13} className="text-emerald" />
                <span>Exact Canvas-to-Export Parity</span>
              </div>
              <div className="engine-status-item">
                <span>Source: {timingSource}</span>
              </div>
            </div>
          </div>

          {/* TRIM / CUT CONTROLS (PRD Section 5) */}
          {exportSettings && onUpdateExportSettings && resolvedOutputRange && (
            <div className="info-card-block">
              <span className="info-label">Output Range (Trim/Cut)</span>
              
              <div className="trim-mode-grid">
                <button 
                  className={`btn btn-xs ${resolvedOutputRange.mode === 'AUTO' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => onUpdateExportSettings({ outputRange: { ...exportSettings.outputRange, mode: 'AUTO' } })}
                >
                  Auto
                </button>
                <button 
                  className={`btn btn-xs ${resolvedOutputRange.mode === 'MANUAL' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => onUpdateExportSettings({ outputRange: { ...exportSettings.outputRange, mode: 'MANUAL', startTime: resolvedOutputRange.startTime, endTime: resolvedOutputRange.endTime } })}
                >
                  Custom Range
                </button>
                <button 
                  className={`btn btn-xs ${resolvedOutputRange.mode === 'AUDIO' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => onUpdateExportSettings({ outputRange: { ...exportSettings.outputRange, mode: 'AUDIO' } })}
                >
                  Audio Duration
                </button>
                <button 
                  className={`btn btn-xs ${resolvedOutputRange.mode === 'LYRICS' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => onUpdateExportSettings({ outputRange: { ...exportSettings.outputRange, mode: 'LYRICS' } })}
                >
                  Lyrics Duration
                </button>
              </div>

              {['MANUAL', 'CUSTOM'].includes(resolvedOutputRange.mode) && (
                <div className="trim-inputs-row">
                  <div className="trim-input-group">
                    <label>Start (s)</label>
                    <input 
                      type="number" 
                      min="0" 
                      step="0.1" 
                      className="input-text"
                      value={resolvedOutputRange.startTime}
                      onChange={(e) => onUpdateExportSettings({ 
                        outputRange: { ...exportSettings.outputRange, mode: 'MANUAL', startTime: parseFloat(e.target.value) || 0, endTime: resolvedOutputRange.endTime } 
                      })}
                    />
                  </div>
                  <div className="trim-input-group">
                    <label>End (s)</label>
                    <input 
                      type="number" 
                      min="0" 
                      step="0.1" 
                      className="input-text"
                      value={resolvedOutputRange.endTime}
                      onChange={(e) => onUpdateExportSettings({ 
                        outputRange: { ...exportSettings.outputRange, mode: 'MANUAL', startTime: resolvedOutputRange.startTime, endTime: parseFloat(e.target.value) || 1 } 
                      })}
                    />
                  </div>
                </div>
              )}

              <p className="trim-range-badge">
                Active Range: {formatSecondsToTimecode(resolvedOutputRange.startTime)} → {formatSecondsToTimecode(resolvedOutputRange.endTime)}
              </p>
            </div>
          )}

          <div className="info-card-block cta-block">
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => onNavigateTab('export')}
            >
              <span>Ready to Export Video</span>
              <ArrowRight size={14} />
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => onNavigateTab('design')}
            >
              <span>Back to Design Controls</span>
            </button>
          </div>
        </div>
      </div>

      {/* Persistent Cinema Transport Bar */}
      <div className="cinema-transport-bar">
        {/* Scrubber */}
        <div className="transport-scrub-row">
          <input
            type="range"
            min={resolvedOutputRange?.startTime || 0}
            max={resolvedOutputRange?.endTime || (totalDuration || 1)}
            step="0.02"
            value={currentTime}
            onChange={(e) => onTimeUpdate(parseFloat(e.target.value))}
            className="transport-scrubber"
          />
        </div>

        <div className="transport-button-row">
          <div className="transport-group-left">
            <button
              type="button"
              className="transport-btn play-main-btn"
              onClick={onPlayPause}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button
              type="button"
              className="transport-btn"
              onClick={onRestart}
              title="Restart"
            >
              <RotateCcw size={15} />
            </button>
            <button
              type="button"
              className="transport-btn"
              onClick={onPrevLine}
              title="Previous Lyric ([)"
            >
              <SkipBack size={15} />
            </button>
            <button
              type="button"
              className="transport-btn"
              onClick={onNextLine}
              title="Next Lyric (])"
            >
              <SkipForward size={15} />
            </button>

            <div className="cinema-timecode">
              <span className="current">{formatSecondsToTimecode(currentTime)}</span>
              <span className="sep">/</span>
              <span className="total">{formatSecondsToTimecode(resolvedOutputRange?.endTime || totalDuration)}</span>
            </div>
          </div>

          <div className="transport-group-right">
            {/* Speed Selector */}
            <div className="speed-selector">
              {[0.5, 1.0, 1.5, 2.0].map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`speed-btn ${playbackSpeed === s ? 'is-active' : ''}`}
                  onClick={() => onSpeedChange?.(s)}
                >
                  {s}x
                </button>
              ))}
            </div>

            {/* Mute Toggle */}
            {audioBlobUrl && (
              <button
                type="button"
                className={`transport-btn ${isMuted ? 'text-dim' : ''}`}
                onClick={() => onToggleMute?.()}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            )}

            {/* Safe Area Toggle */}
            <button
              type="button"
              className={`transport-btn ${showSafeAreas ? 'is-highlighted' : ''}`}
              onClick={() => setShowSafeAreas(!showSafeAreas)}
              title="Toggle TikTok / Reels Safe Margins"
            >
              <Layers size={16} />
            </button>

            {/* Fullscreen */}
            <button
              type="button"
              className="transport-btn"
              onClick={toggleFullscreen}
              title="Toggle Fullscreen"
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
