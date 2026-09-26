import React, { useState } from 'react';
import { 
  Download, 
  Film, 
  CheckCircle2, 
  AlertOctagon, 
  Volume2, 
  VolumeX, 
  RefreshCw,
  XCircle
} from 'lucide-react';
import type { ExportSettings, StyleConfig } from '../../types/project';
import type { LyricLine, VisualLyricBlock, QualityValidationResult } from '../../types/lyrics';
import { exportVideo, type ExportProgress } from '../../lib/render/video-exporter';
import { formatSecondsToTimecode } from '../../lib/lyrics/lrc-parser';

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
  onUpdateExportSettings: (settings: Partial<ExportSettings>) => void;
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
  onUpdateExportSettings,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isCancelled, setIsCancelled] = useState(false);
  const [completedVideoUrl, setCompletedVideoUrl] = useState<string | null>(null);
  const [completedFilename, setCompletedFilename] = useState<string>('');

  const hasAudio = !!audioBuffer && audioBuffer.duration > 0;

  const handleStartExport = async () => {
    if (!validation.readyToExport) return;

    setIsExporting(true);
    setExportError(null);
    setIsCancelled(false);
    setCompletedVideoUrl(null);

    try {
      const blob = await exportVideo({
        lines,
        style,
        exportSettings,
        visualBlocks,
        audioBuffer: exportSettings.includeAudio ? audioBuffer : null,
        trackTitle,
        artistName,
        onProgress: (p) => setProgress(p),
        shouldCancel: () => isCancelled,
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
    }
  };

  const handleCancel = () => {
    setIsCancelled(true);
  };

  const blockingIssues = validation.issues.filter((i) => i.blocking);
  const warnings = validation.issues.filter((i) => !i.blocking && i.type === 'warning');

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

            <div className={`status-banner ${validation.readyToExport ? 'banner-success' : 'banner-error'}`}>
              {validation.readyToExport ? (
                <>
                  <CheckCircle2 size={18} className="text-emerald" />
                  <div className="banner-text">
                    <strong>Timeline Verified & Ready</strong>
                    <span>All lyric lines contain valid timestamps and non-overlapping layout bounds.</span>
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

            {blockingIssues.length > 0 && (
              <div className="issues-box blocking-issues">
                <h4>Blocking Issues ({blockingIssues.length})</h4>
                <ul>
                  {blockingIssues.map((issue, idx) => (
                    <li key={idx}>
                      <span className="issue-bullet">•</span>
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {warnings.length > 0 && (
              <div className="issues-box warnings-issues">
                <h4>Quality Advisories ({warnings.length})</h4>
                <ul>
                  {warnings.map((warn, idx) => (
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
                <span className="spec-name">Duration</span>
                <span className="spec-val">{formatSecondsToTimecode(totalDuration)} ({totalDuration.toFixed(1)}s)</span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Phrase Count</span>
                <span className="spec-val">{lines.length} lines ({visualBlocks?.length || lines.length} visual blocks)</span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Audio State</span>
                <span className="spec-val">{hasAudio ? 'Master Audio Buffer Linked' : 'Silent / Muted Track'}</span>
              </div>
              <div className="spec-row">
                <span className="spec-name">Active Theme</span>
                <span className="spec-val">{style.presetName} ({style.fontFamily})</span>
              </div>
            </div>
          </section>
        </div>

        {/* Right Column: Settings & Render Execution */}
        <div className="export-controls-column">
          <section className="editorial-card">
            <h3 className="section-title">Delivery Settings</h3>

            {/* Presets Grid */}
            <div className="export-preset-selection">
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
                <span className="chip-sub">High Quality Editorial</span>
              </button>

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
                <span className="chip-sub">Standard Social Web</span>
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
                    <option value="60">60 FPS (Ultra Smooth Motion)</option>
                    <option value="30">30 FPS (Standard)</option>
                    <option value="24">24 FPS (Cinematic)</option>
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
                  <div className="progress-info-row">
                    <span className="progress-title">
                      <RefreshCw size={14} className="spin-animation" />
                      <span>Rendering Frame By Frame...</span>
                    </span>
                    <span className="progress-percent">
                      {progress ? Math.round(progress.percentage) : 0}%
                    </span>
                  </div>

                  <div className="render-progress-bar">
                    <div
                      className="progress-fill"
                      style={{ transform: `scaleX(${progress ? progress.percentage / 100 : 0})` }}
                    />
                  </div>

                  <div className="progress-stats-row">
                    <span>
                      Frame {progress?.currentFrame || 0} of {progress?.totalFrames || 0}
                    </span>
                    <span>{progress?.statusText || 'Rendering frames...'}</span>
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
