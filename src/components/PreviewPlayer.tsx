import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { LyricLine, VisualLyricBlock } from '../types/lyrics';
import type { StyleConfig, MotionLayersConfig } from '../types/project';
import { renderEditorialFrame } from '../lib/render/canvas-renderer';
import { formatSecondsToTimecode } from '../lib/lyrics/lrc-parser';
import { getActiveVisualBlockAt } from '../lib/layout/lyric-chunker';
import { LayerCompositor } from '../lib/render/layer-compositor';
import { RainOverlayLayer } from '../lib/layers/rain-overlay';
import { WatermarkLayer } from '../lib/layers/watermark';
import { VideoTransitionsLayer } from '../lib/layers/video-transitions';

interface PreviewPlayerProps {
  lines: LyricLine[];
  style: StyleConfig;
  visualBlocks?: VisualLyricBlock[];
  currentTime: number;
  totalDuration: number;
  isPlaying: boolean;
  audioBlobUrl: string | null;
  trackTitle?: string;
  artistName?: string;
  motionLayers?: MotionLayersConfig;
  onTimeUpdate: (time: number) => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onPrevLine: () => void;
  onNextLine: () => void;
}

export const PreviewPlayer: React.FC<PreviewPlayerProps> = ({
  lines,
  style,
  visualBlocks,
  currentTime,
  totalDuration,
  isPlaying,
  audioBlobUrl,
  trackTitle,
  artistName,
  motionLayers,
  onTimeUpdate,
  onPlayPause,
  onRestart,
  onPrevLine,
  onNextLine,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Sync internal audio element with play/pause and time updates
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.playbackRate = playbackSpeed;
    if (isPlaying) {
      if (Math.abs(audioRef.current.currentTime - currentTime) > 0.25) {
        audioRef.current.currentTime = currentTime;
      }
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, playbackSpeed]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (Math.abs(audioRef.current.currentTime - currentTime) > 0.3) {
      audioRef.current.currentTime = currentTime;
    }
  }, [currentTime]);

  const [compositor] = useState(() => new LayerCompositor({ width: 1080, height: 1920, projectSeed: 42 }));
  const [compositorReady, setCompositorReady] = useState(false);

  useEffect(() => {
    let active = true;
    const prepareCompositor = async () => {
      // Clear old layers
      compositor.dispose();
      
      if (motionLayers?.rain?.enabled) {
        compositor.addLayer(new RainOverlayLayer(motionLayers.rain));
      }
      if (motionLayers?.watermark?.enabled) {
        compositor.addLayer(new WatermarkLayer(motionLayers.watermark));
      }
      if (motionLayers?.videoTransitions?.enabled) {
        compositor.addLayer(new VideoTransitionsLayer(motionLayers.videoTransitions));
      }

      await compositor.prepare(true);
      if (active) setCompositorReady(true);
    };
    
    setCompositorReady(false);
    prepareCompositor();
    
    return () => { active = false; };
  }, [motionLayers, compositor]);

  // Render canvas frame on currentTime or style change
  const drawCurrentFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    renderEditorialFrame(ctx, {
      width: 1080,
      height: 1920,
      currentTime,
      lines,
      style,
      visualBlocks,
      trackTitle,
      artistName,
      lyricsType: motionLayers?.lyricsType,
      lyricsEffect: motionLayers?.lyricsEffect,
      lyricsEffectConfig: motionLayers?.lyricsEffectConfig,
      textAnimationPreset: motionLayers?.textAnimation,
      textAnimationConfig: motionLayers?.textAnimationConfig,
      isPreview: true,
    });

    if (compositorReady && compositor.getLayers().length > 0) {
      compositor.renderFrame(ctx, currentTime, totalDuration, true);
    }
  }, [currentTime, lines, style, visualBlocks, trackTitle, artistName, motionLayers, compositor, compositorReady, totalDuration]);

  useEffect(() => {
    drawCurrentFrame();
  }, [drawCurrentFrame]);

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    onTimeUpdate(newTime);
  };

  const handleSpeedToggle = () => {
    const speeds = [0.5, 1.0, 1.5];
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length;
    setPlaybackSpeed(speeds[nextIdx]);
  };

  const { activeBlock } = getActiveVisualBlockAt(visualBlocks || [], currentTime);
  const activeLine = lines.find(l => l.id === activeBlock?.sourceLineId);
  const isSynced = activeLine?.startTime === activeBlock?.startTime;
  const delta = activeLine?.startTime && activeBlock ? Math.abs(activeLine.startTime - activeBlock.startTime) : 0;

  return (
    <main className="preview-container">
      {audioBlobUrl && (
        <audio
          ref={audioRef}
          src={audioBlobUrl}
          muted={isMuted}
          onEnded={onPlayPause}
        />
      )}

      {/* Vertical 9:16 Canvas Box */}
      <div className="canvas-wrapper" style={{ position: 'relative' }}>
        <div className="aspect-ratio-box">
          <canvas
            ref={canvasRef}
            width={1080}
            height={1920}
            className="video-canvas"
          />
          {showDiagnostics && activeBlock && (
            <div style={{
              position: 'absolute',
              top: '10px',
              left: '10px',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              color: '#00ff00',
              padding: '8px',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '12px',
              zIndex: 10
            }}>
              <div>Audio Onset: {activeLine?.startTime?.toFixed(3)}s</div>
              <div>Lyric Start: {activeBlock.startTime.toFixed(3)}s</div>
              <div>Delta: {delta.toFixed(3)}s</div>
              <div style={{ color: isSynced ? '#00ff00' : '#ff3333' }}>
                Status: {isSynced ? 'SYNCED' : 'DESYNCED'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Playback Control Bar */}
      <div className="preview-controls-bar">
        {/* Scrub Bar */}
        <div className="scrub-container">
          <input
            type="range"
            min={0}
            max={Math.max(1, totalDuration)}
            step={0.01}
            value={currentTime}
            onChange={handleScrub}
            className="scrub-range"
            aria-label="Timeline scrub"
          />
          <div className="timecode-display">
            <span className="current-time">{formatSecondsToTimecode(currentTime)}</span>
            <span className="divider">/</span>
            <span className="total-time">{formatSecondsToTimecode(totalDuration)}</span>
          </div>
        </div>

        {/* Buttons Row */}
        <div className="controls-row">
          <div className="controls-left">
            <button
              type="button"
              className="ctrl-btn"
              onClick={onRestart}
              title="Restart from beginning"
            >
              <RotateCcw size={16} />
            </button>
            <button
              type="button"
              className="ctrl-btn"
              onClick={onPrevLine}
              title="Previous lyric line"
            >
              <SkipBack size={16} />
            </button>
            <button
              type="button"
              className="ctrl-btn ctrl-btn-play"
              onClick={onPlayPause}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
            </button>
            <button
              type="button"
              className="ctrl-btn"
              onClick={onNextLine}
              title="Next lyric line"
            >
              <SkipForward size={16} />
            </button>
          </div>

          <div className="controls-right">
            <button
              type="button"
              className="ctrl-btn text-btn"
              onClick={handleSpeedToggle}
              title="Playback speed"
            >
              {playbackSpeed}x
            </button>

            {audioBlobUrl && (
              <button
                type="button"
                className="ctrl-btn"
                onClick={() => setIsMuted(!isMuted)}
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            )}
            
            <button
              type="button"
              className={`ctrl-btn text-btn ${showDiagnostics ? 'active' : ''}`}
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              title="Toggle Sync Diagnostics"
              style={{ color: showDiagnostics ? '#00ff00' : 'inherit' }}
            >
              SYNC
            </button>
          </div>
        </div>
      </div>
    </main>
  );
};
