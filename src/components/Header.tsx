import React from 'react';
import { Download, FolderOpen, Save, CheckCircle2, AlertTriangle, AlertOctagon, Music } from 'lucide-react';
import type { TimingSource } from '../types/lyrics';
import type { QualityValidationResult } from '../types/lyrics';

interface HeaderProps {
  title: string;
  artist: string;
  timingSource: TimingSource;
  validation: QualityValidationResult;
  hasAudio: boolean;
  onOpenExport: () => void;
  onSaveProject: () => void;
  onLoadProject: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  artist,
  timingSource,
  validation,
  hasAudio,
  onOpenExport,
  onSaveProject,
  onLoadProject,
}) => {
  const getTimingBadge = () => {
    switch (timingSource) {
      case 'SOURCE_ENHANCED_LRC':
        return {
          label: 'Word-Level LRC',
          icon: <CheckCircle2 size={13} className="text-emerald-400" />,
          className: 'badge-exact',
        };
      case 'SOURCE_SRT':
        return {
          label: 'Exact SRT Timestamps',
          icon: <CheckCircle2 size={13} className="text-emerald-400" />,
          className: 'badge-exact',
        };
      case 'SOURCE_LRC':
        return {
          label: 'Exact LRC Timestamps',
          icon: <CheckCircle2 size={13} className="text-emerald-400" />,
          className: 'badge-exact',
        };
      case 'SOURCE_SYNC_PROVIDER':
        return {
          label: 'Synced Provider',
          icon: <CheckCircle2 size={13} className="text-emerald-400" />,
          className: 'badge-exact',
        };
      case 'SOURCE_AUDIO_ALIGNMENT':
        return {
          label: 'Audio Aligned',
          icon: <CheckCircle2 size={13} className="text-amber-400" />,
          className: 'badge-aligned',
        };
      case 'SOURCE_MANUAL':
        return {
          label: 'Manual Timing',
          icon: <AlertTriangle size={13} className="text-amber-400" />,
          className: 'badge-manual',
        };
      default:
        return {
          label: 'Timestamp Required',
          icon: <AlertOctagon size={13} className="text-rose-400" />,
          className: 'badge-missing',
        };
    }
  };

  const badge = getTimingBadge();

  return (
    <header className="app-header">
      <div className="header-left">
        <div className="brand-group">
          <span className="brand-star">✦</span>
          <span className="brand-title">Lyrics Motion Generator</span>
        </div>
        <div className="track-display">
          <span className="track-name">{title || 'Untitled Track'}</span>
          {artist && <span className="track-artist">— {artist}</span>}
        </div>
      </div>

      <div className="header-center">
        <div className={`timing-badge ${badge.className}`}>
          {badge.icon}
          <span>{badge.label}</span>
        </div>

        {hasAudio && (
          <div className="audio-badge">
            <Music size={12} />
            <span>Audio Linked</span>
          </div>
        )}
      </div>

      <div className="header-right">
        <button
          type="button"
          onClick={onLoadProject}
          className="btn btn-secondary btn-sm"
          title="Open saved project JSON"
        >
          <FolderOpen size={14} />
          <span>Open</span>
        </button>

        <button
          type="button"
          onClick={onSaveProject}
          className="btn btn-secondary btn-sm"
          title="Save project JSON"
        >
          <Save size={14} />
          <span>Save</span>
        </button>

        <button
          type="button"
          onClick={onOpenExport}
          className={`btn btn-primary btn-sm ${!validation.readyToExport ? 'btn-has-issues' : ''}`}
          title={validation.readyToExport ? 'Export video' : 'Check timeline issues before export'}
        >
          <Download size={14} />
          <span>Export Video</span>
          {!validation.readyToExport && (
            <span className="error-count-bubble">
              {validation.issues.filter((i) => i.blocking).length}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};
