import React, { useState } from 'react';
import { Download, CheckCircle2, AlertOctagon, Film, Volume2, VolumeX, X } from 'lucide-react';
import type { ExportSettings, StyleConfig } from '../types/project';
import type { LyricLine, VisualLyricBlock, QualityValidationResult } from '../types/lyrics';
import { exportVideo, type ExportProgress } from '../lib/render/video-exporter';

interface ExportModalProps {
  lines: LyricLine[];
  style: StyleConfig;
  visualBlocks?: VisualLyricBlock[];
  exportSettings: ExportSettings;
  audioBuffer?: AudioBuffer | null;
  trackTitle?: string;
  artistName?: string;
  validation: QualityValidationResult;
  onClose: () => void;
  onUpdateExportSettings: (settings: Partial<ExportSettings>) => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  lines,
  style,
  visualBlocks,
  exportSettings,
  audioBuffer,
  trackTitle,
  artistName,
  validation,
  onClose,
  onUpdateExportSettings,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isCancelled, setIsCancelled] = useState(false);

  const hasAudio = !!audioBuffer && audioBuffer.duration > 0;

  const handleStartExport = async () => {
    if (!validation.readyToExport) return;

    setIsExporting(true);
    setExportError(null);
    setIsCancelled(false);

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

      // Trigger instant download
      const filename = `${(trackTitle || 'lyrics-video').toLowerCase().replace(/\s+/g, '-')}-motion.${exportSettings.format || 'mp4'}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      onClose();
    } catch (err: any) {
      if (err.message !== 'Export cancelled by user.') {
        setExportError(err.message || 'Export failed.');
      }
    } finally {
      setIsExporting(false);
      setProgress(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={!isExporting ? onClose : undefined}>
      <div className="export-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-group">
            <Film size={18} className="text-amber-400" />
            <h3 className="modal-title">Export Lyrics Motion Video</h3>
          </div>
          {!isExporting && (
            <button type="button" className="close-btn" onClick={onClose}>
              <X size={16} />
            </button>
          )}
        </div>

        <div className="modal-body">
          {/* Quality Readiness Check */}
          <div
            className={`quality-status-banner ${
              validation.readyToExport ? 'status-ready' : 'status-issues'
            }`}
          >
            {validation.readyToExport ? (
              <>
                <CheckCircle2 size={16} />
                <span>READY TO EXPORT — All {validation.timedLines} lines timed</span>
              </>
            ) : (
              <>
                <AlertOctagon size={16} />
                <span>
                  EXPORT BLOCKED — {validation.issues.filter((i) => i.blocking).length} issues must be resolved
                </span>
              </>
            )}
          </div>

          {/* Export Settings */}
          <div className="export-grid">
            <div className="form-group">
              <label className="form-label">Dimensions & Aspect Ratio</label>
              <select
                className="form-select"
                value={`${exportSettings.width}x${exportSettings.height}`}
                disabled={isExporting}
                onChange={(e) => {
                  const [w, h] = e.target.value.split('x').map(Number);
                  onUpdateExportSettings({ width: w, height: h });
                }}
              >
                <option value="1080x1920">1080 × 1920 (9:16 Vertical Reel/Short/Story)</option>
                <option value="1080x1080">1080 × 1080 (1:1 Square Post)</option>
                <option value="1920x1080">1920 × 1080 (16:9 Landscape)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Frame Rate (FPS)</label>
              <select
                className="form-select"
                value={exportSettings.fps}
                disabled={isExporting}
                onChange={(e) => onUpdateExportSettings({ fps: Number(e.target.value) as any })}
              >
                <option value="30">30 fps (Standard Smooth)</option>
                <option value="24">24 fps (Cinematic Film)</option>
                <option value="60">60 fps (Ultra Smooth)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Audio Track Mode</label>
              <div className="audio-mode-selector">
                <button
                  type="button"
                  className={`mode-btn ${!exportSettings.includeAudio ? 'active' : ''}`}
                  disabled={isExporting}
                  onClick={() => onUpdateExportSettings({ includeAudio: false })}
                >
                  <VolumeX size={14} />
                  <span>Silent MP4 (Mode A)</span>
                </button>
                <button
                  type="button"
                  className={`mode-btn ${exportSettings.includeAudio ? 'active' : ''}`}
                  disabled={isExporting || !hasAudio}
                  onClick={() => onUpdateExportSettings({ includeAudio: true })}
                >
                  <Volume2 size={14} />
                  <span>Mux Audio Track (Mode B)</span>
                </button>
              </div>
              {!hasAudio && (
                <span className="form-hint">
                  No audio track linked. Video will export as clean silent MP4 (H.264).
                </span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">Output Format</label>
              <div className="format-badges">
                <span className="badge-format">MP4 (H.264 AVC)</span>
                {exportSettings.includeAudio && hasAudio && (
                  <span className="badge-format">AAC Audio</span>
                )}
              </div>
            </div>
          </div>

          {/* Live Progress Bar */}
          {isExporting && progress && (
            <div className="export-progress-section">
              <div className="progress-bar-bg">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>
              <div className="progress-info-row">
                <span className="progress-status-text">{progress.statusText}</span>
                <span className="progress-percent-text">{progress.percentage}%</span>
              </div>
            </div>
          )}

          {exportError && <div className="export-error-card">{exportError}</div>}
        </div>

        <div className="modal-footer">
          {isExporting ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsCancelled(true)}
            >
              Cancel Export
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!validation.readyToExport}
                onClick={handleStartExport}
              >
                <Download size={14} />
                <span>Start Video Render</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
