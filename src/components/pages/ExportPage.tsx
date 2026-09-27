import React, { useState, useCallback } from 'react';
import { 
  Download, 
  Film, 
  CheckCircle2, 
  AlertOctagon, 
  Volume2, 
  VolumeX, 
  RefreshCw,
  XCircle,
  Layers,
  Droplets,
  Stamp,
  Type,
} from 'lucide-react';
import type { ExportSettings, StyleConfig, MotionLayersConfig } from '../../types/project';
import type { LyricLine, VisualLyricBlock, QualityValidationResult } from '../../types/lyrics';
import { exportVideo, type ExportProgress, type RenderJobState } from '../../lib/render/video-exporter';
import { formatSecondsToTimecode } from '../../lib/lyrics/lrc-parser';
import type { TextAnimationPreset } from '../../lib/render/text-animation';
import type { RainOverlayConfig } from '../../lib/layers/rain-overlay';
import type { WatermarkConfig, WatermarkPosition, WatermarkAnimationPreset } from '../../lib/layers/watermark';

interface ExportPageProps {
  lines: LyricLine[];
  style: StyleConfig;
  visualBlocks?: VisualLyricBlock[];
  exportSettings: ExportSettings;
  audioBuffer?: AudioBuffer | null;
  trackTitle: string;
  artistName: string;
  validation: QualityValidationResult;
  totalDuration: number;
  motionLayers: MotionLayersConfig;
  resolvedOutputRange?: { startTime: number; endTime: number; mode: string };
  lyricTimelineDuration?: number;
  mediaDuration?: number | null;
  onUpdateExportSettings: (settings: Partial<ExportSettings>) => void;
  onUpdateMotionLayers: (layers: Partial<MotionLayersConfig>) => void;
}

export const ExportPage: React.FC<ExportPageProps> = ({
  lines,
  style,
  visualBlocks,
  exportSettings,
  audioBuffer,
  trackTitle,
  artistName,
  validation,
  totalDuration,
  motionLayers,
  resolvedOutputRange,
  lyricTimelineDuration = 0,
  mediaDuration = null,
  onUpdateExportSettings,
  onUpdateMotionLayers,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [jobState, setJobState] = useState<RenderJobState | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isCancelled, setIsCancelled] = useState(false);
  const [completedVideoUrl, setCompletedVideoUrl] = useState<string | null>(null);
  const [completedFilename, setCompletedFilename] = useState<string>('');
  const [activeMotionTab, setActiveMotionTab] = useState<'text' | 'overlay' | 'watermark'>('text');

  const hasAudio = !!audioBuffer && audioBuffer.duration > 0;

  const blockingIssues = validation.issues.filter((i) => i.blocking);
  const warnings = validation.issues.filter((i) => !i.blocking && i.type === 'warning');

  // Check lyrics outside output range
  const lyricsOutsideRange = lines.filter(l => l.startTime !== null && (l.startTime > (resolvedOutputRange?.endTime || totalDuration) || (l.endTime || l.startTime) < (resolvedOutputRange?.startTime || 0))).length;
  
  // Custom Validation checks for PRD 11
  const outputDuration = (resolvedOutputRange?.endTime || totalDuration) - (resolvedOutputRange?.startTime || 0);
  let localBlockingIssues = [...blockingIssues];
  let localWarnings = [...warnings];

  if (lyricsOutsideRange > 0) {
    localWarnings.push({ 
      id: 'local-warn-range',
      type: 'warning', 
      message: `${lyricsOutsideRange} lyric lines extend beyond the current output range.`,
      remedy: 'Adjust trim range to include these lines, or ignore if intentional.',
      blocking: false
    });
  }

  if (resolvedOutputRange && mediaDuration && resolvedOutputRange.endTime > mediaDuration && hasAudio) {
    localWarnings.push({ 
      id: 'local-warn-audio',
      type: 'warning', 
      message: `Output end time (${formatSecondsToTimecode(resolvedOutputRange.endTime)}) exceeds actual audio duration (${formatSecondsToTimecode(mediaDuration)}). Audio track will have silence at the end.`,
      remedy: 'Adjust end time to be within audio duration.',
      blocking: false
    });
  }

  if (resolvedOutputRange && resolvedOutputRange.startTime >= resolvedOutputRange.endTime) {
    localBlockingIssues.push({ 
      id: 'local-err-timing',
      type: 'error', 
      message: 'Invalid trim range: Start time must be less than end time.',
      remedy: 'Fix trim range to be valid.',
      blocking: true
    });
  }

  const isExportReady = localBlockingIssues.length === 0;

  const handleStartExport = useCallback(async () => {
    if (!isExportReady) return;

    setIsExporting(true);
    setExportError(null);
    setIsCancelled(false);
    setCompletedVideoUrl(null);
    setJobState(null);

    let cancelFlag = false;

    try {
      const blob = await exportVideo({
        lines,
        style,
        exportSettings,
        visualBlocks,
        audioBuffer: exportSettings.includeAudio ? audioBuffer : null,
        trackTitle,
        artistName,
        motionLayers,
        onProgress: (p) => setProgress(p),
        onJobStateChange: (s) => setJobState(s),
        shouldCancel: () => cancelFlag || isCancelled,
      });

      const filename = `${(trackTitle || 'lyrics-video').toLowerCase().replace(/\s+/g, '-')}-motion.${exportSettings.format || 'mp4'}`;
      const url = URL.createObjectURL(blob);
      setCompletedVideoUrl(url);
      setCompletedFilename(filename);

      // Auto trigger download
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      if (err.message !== 'Export cancelled by user.') {
        setExportError(err.message || 'Export failed.');
      }
    } finally {
      setIsExporting(false);
      setProgress(null);
      // Keep jobState for reference
    }

    // Assign cancel flag via ref-like pattern (closure capture)
    void cancelFlag;
  }, [
    isExportReady, lines, style, exportSettings, visualBlocks,
    audioBuffer, trackTitle, artistName, motionLayers, isCancelled,
  ]);

  const handleCancel = () => {
    setIsCancelled(true);
  };


  // Format estimated remaining time
  const formatEta = (ms: number | null): string | null => {
    if (ms === null) return null;
    const s = Math.ceil(ms / 1000);
    if (s < 60) return `~${s}s`;
    const m = Math.floor(s / 60);
    const remaining = s % 60;
    return `~${m}m ${remaining}s`;
  };

  const currentPercentage = jobState?.percentage ?? progress?.percentage ?? 0;
  const currentStatusText = jobState?.statusText ?? progress?.statusText ?? 'Rendering frames...';
  const currentFrame = jobState?.currentFrame ?? progress?.currentFrame ?? 0;
  const currentTotalFrames = jobState?.totalFrames ?? progress?.totalFrames ?? 0;
  const eta = formatEta(jobState?.estimatedRemainingMs ?? null);

  // ─── Motion layer update helpers ────────────────────────────────────────────

  const updateRain = (update: Partial<RainOverlayConfig>) => {
    onUpdateMotionLayers({ rain: { ...motionLayers.rain, ...update } });
  };

  const updateWatermark = (update: Partial<WatermarkConfig>) => {
    onUpdateMotionLayers({ watermark: { ...motionLayers.watermark, ...update } });
  };

  const updateTextAnimation = (preset: TextAnimationPreset) => {
    onUpdateMotionLayers({ textAnimation: preset });
  };


  return (
    <div className="workspace-page export-page">
      <div className="page-header">
        <div className="page-header-text">
          <span className="page-eyebrow">Production Delivery</span>
          <h1 className="page-title">Export Lyrics Video</h1>
          <p className="page-description">
            High-fidelity frame-by-frame rendering with deterministic typography and MP4 muxing.
          </p>
        </div>
      </div>

      <div className="export-grid-layout">
        {/* Left Column: Pre-Flight Check & Project Summary */}
        <div className="export-summary-column">
          <section className="editorial-card">
            <h3 className="section-title">Pre-Flight Quality Audit</h3>

            <div className={`status-banner ${isExportReady ? 'banner-success' : 'banner-error'}`}>
              {isExportReady ? (
                <>
                  <CheckCircle2 size={18} className="text-emerald" />
                  <div className="banner-text">
                    <strong>Timeline Verified &amp; Ready</strong>
                    <span>All lyric lines contain valid timestamps and fall within valid output bounds.</span>
                  </div>
                </>
              ) : (
                <>
                  <AlertOctagon size={18} className="text-rose" />
                  <div className="banner-text">
                    <strong>Export Blocked — Action Required</strong>
                    <span>Resolve the timing errors below in the Lyrics or Timeline workspace.</span>
                  </div>
                </>
              )}
            </div>

            {localBlockingIssues.length > 0 && (
              <div className="issues-box blocking-issues">
                <h4>Blocking Issues ({localBlockingIssues.length})</h4>
                <ul>
                  {localBlockingIssues.map((issue, idx) => (
                    <li key={idx}>
                      <span className="issue-bullet">•</span>
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {localWarnings.length > 0 && (
              <div className="issues-box warnings-issues">
                <h4>Quality Advisories ({localWarnings.length})</h4>
                <ul>
                  {localWarnings.map((warn, idx) => (
                    <li key={idx}>
                      <span className="warn-bullet">•</span>
                      <span>{warn.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="preflight-specs-table">
              <div className="spec-row">
                <span className="spec-name">Composition</span>
                <span className="spec-val">Vertical 9:16 Short-Form</span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Output Range</span>
                <span className="spec-val">
                  {formatSecondsToTimecode(resolvedOutputRange?.startTime || 0)} → {formatSecondsToTimecode(resolvedOutputRange?.endTime || totalDuration)}
                </span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Output Duration</span>
                <span className="spec-val">
                  {formatSecondsToTimecode(outputDuration)} ({outputDuration.toFixed(1)}s)
                </span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Audio Duration</span>
                <span className="spec-val">
                  {mediaDuration ? `${formatSecondsToTimecode(mediaDuration)} (${mediaDuration.toFixed(1)}s)` : 'Silent / Muted Track'}
                </span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Lyrics Timeline Duration</span>
                <span className="spec-val">
                  {formatSecondsToTimecode(lyricTimelineDuration)} ({lyricTimelineDuration.toFixed(1)}s)
                </span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Phrase Count</span>
                <span className="spec-val">{lines.length} lines ({visualBlocks?.length || lines.length} visual blocks)</span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Active Theme</span>
                <span className="spec-val">{style.presetName} ({style.fontFamily})</span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Text Animation</span>
                <span className="spec-val">{motionLayers.textAnimation}</span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Rain Overlay</span>
                <span className="spec-val">{motionLayers.rain.enabled ? 'Enabled' : 'Off'}</span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Watermark</span>
                <span className="spec-val">{motionLayers.watermark.enabled ? 'Enabled' : 'Off'}</span>
              </div>
            </div>
          </section>

          {/* Motion Layers Panel — PRD Section 34 */}
          <section className="editorial-card motion-layers-card">
            <div className="motion-layers-header">
              <Layers size={16} />
              <h3 className="section-title">Motion Layers</h3>
            </div>

            {/* Tab Switcher */}
            <div className="motion-tab-row">
              <button
                type="button"
                className={`motion-tab ${activeMotionTab === 'text' ? 'is-active' : ''}`}
                onClick={() => setActiveMotionTab('text')}
              >
                <Type size={12} />
                <span>Text</span>
              </button>
              <button
                type="button"
                className={`motion-tab ${activeMotionTab === 'overlay' ? 'is-active' : ''}`}
                onClick={() => setActiveMotionTab('overlay')}
              >
                <Droplets size={12} />
                <span>Overlay</span>
              </button>
              <button
                type="button"
                className={`motion-tab ${activeMotionTab === 'watermark' ? 'is-active' : ''}`}
                onClick={() => setActiveMotionTab('watermark')}
              >
                <Stamp size={12} />
                <span>Watermark</span>
              </button>
            </div>

            {/* Text Animation Tab */}
            {activeMotionTab === 'text' && (
              <div className="motion-panel">
                <div className="form-group">
                  <label className="form-label-sm">Animation Preset</label>
                  <select
                    className="select-field"
                    value={motionLayers.textAnimation}
                    onChange={(e) => updateTextAnimation(e.target.value as TextAnimationPreset)}
                    disabled={isExporting}
                  >
                    <option value="slide-up">Slide Up (Default)</option>
                    <option value="slide-down">Slide Down</option>
                    <option value="fade">Fade Only</option>
                    <option value="scale-in">Scale In</option>
                    <option value="blur-to-sharp">Blur to Sharp</option>
                    <option value="tracking-reveal">Tracking Reveal</option>
                    <option value="word-by-word">Word by Word</option>
                    <option value="mask-reveal">Mask Reveal</option>
                  </select>
                  <p className="form-hint-sm">Animation adapts to each lyric's actual duration. No fixed timings.</p>
                </div>
              </div>
            )}

            {/* Rain Overlay Tab */}
            {activeMotionTab === 'overlay' && (
              <div className="motion-panel">
                <div className="toggle-row">
                  <label className="toggle-label">Rain Overlay</label>
                  <button
                    type="button"
                    className={`toggle-pill ${motionLayers.rain.enabled ? 'is-on' : ''}`}
                    onClick={() => updateRain({ enabled: !motionLayers.rain.enabled })}
                    disabled={isExporting}
                  >
                    <span className="toggle-knob" />
                  </button>
                </div>

                {motionLayers.rain.enabled && (
                  <>
                    <div className="form-group">
                      <label className="form-label-sm">Density ({motionLayers.rain.density})</label>
                      <input
                        type="range"
                        min={30}
                        max={300}
                        value={motionLayers.rain.density}
                        onChange={(e) => updateRain({ density: Number(e.target.value) })}
                        disabled={isExporting}
                        className="range-input"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label-sm">Speed ({motionLayers.rain.speed.toFixed(1)}x)</label>
                      <input
                        type="range"
                        min={20}
                        max={200}
                        value={Math.round(motionLayers.rain.speed * 100)}
                        onChange={(e) => updateRain({ speed: Number(e.target.value) / 100 })}
                        disabled={isExporting}
                        className="range-input"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label-sm">Opacity ({Math.round(motionLayers.rain.opacity * 100)}%)</label>
                      <input
                        type="range"
                        min={5}
                        max={80}
                        value={Math.round(motionLayers.rain.opacity * 100)}
                        onChange={(e) => updateRain({ opacity: Number(e.target.value) / 100 })}
                        disabled={isExporting}
                        className="range-input"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label-sm">Direction ({motionLayers.rain.direction}°)</label>
                      <input
                        type="range"
                        min={-30}
                        max={30}
                        value={motionLayers.rain.direction}
                        onChange={(e) => updateRain({ direction: Number(e.target.value) })}
                        disabled={isExporting}
                        className="range-input"
                      />
                    </div>
                    <div className="form-row-inline">
                      <label className="form-label-sm">Start</label>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={motionLayers.rain.startTime}
                        onChange={(e) => updateRain({ startTime: Math.max(0, Number(e.target.value)) })}
                        disabled={isExporting}
                        className="number-input"
                      />
                      <label className="form-label-sm">End (0 = full)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={isFinite(motionLayers.rain.endTime) ? motionLayers.rain.endTime : 0}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          updateRain({ endTime: v <= 0 ? Infinity : v });
                        }}
                        disabled={isExporting}
                        className="number-input"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Watermark Tab */}
            {activeMotionTab === 'watermark' && (
              <div className="motion-panel">
                <div className="toggle-row">
                  <label className="toggle-label">Watermark</label>
                  <button
                    type="button"
                    className={`toggle-pill ${motionLayers.watermark.enabled ? 'is-on' : ''}`}
                    onClick={() => updateWatermark({ enabled: !motionLayers.watermark.enabled })}
                    disabled={isExporting}
                  >
                    <span className="toggle-knob" />
                  </button>
                </div>

                {motionLayers.watermark.enabled && (
                  <>
                    <div className="form-group">
                      <label className="form-label-sm">Image URL or Data URL</label>
                      <input
                        type="url"
                        placeholder="https://… or data:image/…"
                        value={motionLayers.watermark.imageUrl ?? ''}
                        onChange={(e) => updateWatermark({ imageUrl: e.target.value || null })}
                        disabled={isExporting}
                        className="text-input"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label-sm">Position</label>
                      <select
                        className="select-field"
                        value={motionLayers.watermark.position}
                        onChange={(e) => updateWatermark({ position: e.target.value as WatermarkPosition })}
                        disabled={isExporting}
                      >
                        <option value="top-left">Top Left</option>
                        <option value="top-center">Top Center</option>
                        <option value="top-right">Top Right</option>
                        <option value="bottom-left">Bottom Left</option>
                        <option value="bottom-center">Bottom Center</option>
                        <option value="bottom-right">Bottom Right</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="form-label-sm">Size ({Math.round(motionLayers.watermark.sizeFraction * 100)}% width)</label>
                      <input
                        type="range"
                        min={3}
                        max={25}
                        value={Math.round(motionLayers.watermark.sizeFraction * 100)}
                        onChange={(e) => updateWatermark({ sizeFraction: Number(e.target.value) / 100 })}
                        disabled={isExporting}
                        className="range-input"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label-sm">Opacity ({Math.round(motionLayers.watermark.opacity * 100)}%)</label>
                      <input
                        type="range"
                        min={10}
                        max={100}
                        value={Math.round(motionLayers.watermark.opacity * 100)}
                        onChange={(e) => updateWatermark({ opacity: Number(e.target.value) / 100 })}
                        disabled={isExporting}
                        className="range-input"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label-sm">Animation</label>
                      <select
                        className="select-field"
                        value={motionLayers.watermark.animationPreset}
                        onChange={(e) => updateWatermark({ animationPreset: e.target.value as WatermarkAnimationPreset })}
                        disabled={isExporting}
                      >
                        <option value="none">None</option>
                        <option value="fade-in">Fade In</option>
                        <option value="fade-out">Fade Out</option>
                        <option value="fade-in-out">Fade In &amp; Out</option>
                        <option value="subtle-scale">Subtle Scale</option>
                        <option value="subtle-slide">Subtle Slide</option>
                        <option value="pulse">Pulse</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Right Column: Settings & Render Execution */}
        <div className="export-controls-column">
          <section className="editorial-card">
            <h3 className="section-title">Delivery Settings</h3>

            {/* Presets Grid — PRD Section 6: 30 FPS Standard is default */}
            <div className="export-preset-selection">
              <button
                type="button"
                className={`export-preset-chip ${exportSettings.fps === 30 && exportSettings.height === 1920 ? 'is-active' : ''}`}
                onClick={() =>
                  onUpdateExportSettings({
                    width: 1080,
                    height: 1920,
                    fps: 30,
                    bitrateKbps: 5000,
                  })
                }
              >
                <span className="chip-title">1080p 30 FPS</span>
                {/* PRD Section 6: "30 FPS — Standard" */}
                <span className="chip-sub">Standard · Recommended</span>
              </button>

              <button
                type="button"
                className={`export-preset-chip ${exportSettings.fps === 60 && exportSettings.height === 1920 ? 'is-active' : ''}`}
                onClick={() =>
                  onUpdateExportSettings({
                    width: 1080,
                    height: 1920,
                    fps: 60,
                    bitrateKbps: 8000,
                  })
                }
              >
                <span className="chip-title">1080p 60 FPS</span>
                {/* PRD Section 6: "60 FPS — Smooth Motion" */}
                <span className="chip-sub">Smooth Motion</span>
              </button>

              <button
                type="button"
                className={`export-preset-chip ${exportSettings.height === 1280 ? 'is-active' : ''}`}
                onClick={() =>
                  onUpdateExportSettings({
                    width: 720,
                    height: 1280,
                    fps: 30,
                    bitrateKbps: 3500,
                  })
                }
              >
                <span className="chip-title">720p 30 FPS</span>
                <span className="chip-sub">Fast Draft Export</span>
              </button>
            </div>

            {/* Detailed Controls */}
            <div className="export-settings-fields">
              <div className="form-row">
                <div className="form-group">
                  <label>Resolution</label>
                  <select
                    className="select-field"
                    value={`${exportSettings.width}x${exportSettings.height}`}
                    onChange={(e) => {
                      const [w, h] = e.target.value.split('x').map(Number);
                      onUpdateExportSettings({ width: w, height: h });
                    }}
                  >
                    <option value="1080x1920">1080 × 1920 (9:16 Full HD)</option>
                    <option value="720x1280">720 × 1280 (9:16 HD)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Frame Rate</label>
                  <select
                    className="select-field"
                    value={exportSettings.fps}
                    onChange={(e) => onUpdateExportSettings({ fps: Number(e.target.value) as any })}
                  >
                    {/* PRD Section 6: Show labels as specified */}
                    <option value="30">30 FPS — Standard</option>
                    <option value="60">60 FPS — Smooth Motion</option>
                    <option value="24">24 FPS — Cinematic</option>
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Video Bitrate</label>
                  <select
                    className="select-field"
                    value={exportSettings.bitrateKbps}
                    onChange={(e) => onUpdateExportSettings({ bitrateKbps: Number(e.target.value) })}
                  >
                    <option value="12000">12,000 kbps (Maximum Quality)</option>
                    <option value="8000">8,000 kbps (Recommended)</option>
                    <option value="5000">5,000 kbps (Standard)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Audio Inclusion</label>
                  <div className="audio-toggle-box">
                    <button
                      type="button"
                      className={`btn-subtle-toggle ${exportSettings.includeAudio && hasAudio ? 'is-active' : ''}`}
                      disabled={!hasAudio}
                      onClick={() => onUpdateExportSettings({ includeAudio: !exportSettings.includeAudio })}
                    >
                      {exportSettings.includeAudio && hasAudio ? (
                        <>
                          <Volume2 size={14} />
                          <span>Audio Muxed</span>
                        </>
                      ) : (
                        <>
                          <VolumeX size={14} />
                          <span>{hasAudio ? 'Mute in Export' : 'No Audio File'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Error message */}
            {exportError && (
              <div className="export-error-callout">
                <AlertOctagon size={16} />
                <span>{exportError}</span>
              </div>
            )}

            {/* Render Progress or Action */}
            <div className="export-action-container">
              {isExporting ? (
                <div className="render-progress-card">
                  {/* PRD Section 16: Distinguish render / encode / mux phases */}
                  <div className="progress-phase-label">
                    {jobState?.status === 'PREPARING' && 'Preparing project...'}
                    {jobState?.status === 'RENDERING' && 'Rendering frames...'}
                    {jobState?.status === 'ENCODING' && 'Encoding video...'}
                    {jobState?.status === 'MUXING' && 'Muxing audio...'}
                    {!jobState && 'Initializing...'}
                  </div>

                  <div className="progress-info-row">
                    <span className="progress-title">
                      <RefreshCw size={14} className="spin-animation" />
                      <span>{currentStatusText}</span>
                    </span>
                    <span className="progress-percent">
                      {Math.round(currentPercentage)}%
                    </span>
                  </div>

                  <div className="render-progress-bar">
                    <div
                      className="progress-fill"
                      style={{ transform: `scaleX(${currentPercentage / 100})` }}
                    />
                  </div>

                  <div className="progress-stats-row">
                    <span>
                      Frame {currentFrame} of {currentTotalFrames}
                    </span>
                    {eta && <span>ETA: {eta}</span>}
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary btn-sm cancel-btn"
                    onClick={handleCancel}
                  >
                    <XCircle size={14} />
                    <span>Cancel Render</span>
                  </button>
                </div>
              ) : completedVideoUrl ? (
                <div className="render-completed-card">
                  <div className="completed-header">
                    <CheckCircle2 size={24} className="text-emerald" />
                    <div>
                      <h4>Export Completed Successfully</h4>
                      <p>{completedFilename}</p>
                    </div>
                  </div>

                  <div className="completed-preview-video">
                    <video src={completedVideoUrl} controls autoPlay loop className="export-video-preview" />
                  </div>

                  <div className="completed-actions">
                    <a
                      href={completedVideoUrl}
                      download={completedFilename}
                      className="btn btn-primary btn-block"
                    >
                      <Download size={15} />
                      <span>Download Video (.mp4)</span>
                    </a>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-xl btn-block render-btn"
                  disabled={!validation.readyToExport}
                  onClick={handleStartExport}
                >
                  <Film size={18} />
                  <span>Start MP4 Export</span>
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
