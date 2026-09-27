import React from 'react';
import { 
  Folder, 
  FileText, 
  Sliders, 
  Palette, 
  PlayCircle, 
  Download, 
  Settings, 
  Music, 
  Save, 
  FolderOpen,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon
} from 'lucide-react';
import type { ActiveTab } from '../types/project';
import type { TimingSource, QualityValidationResult } from '../types/lyrics';

interface NavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  trackTitle: string;
  artistName: string;
  timingSource: TimingSource;
  validation: QualityValidationResult;
  hasAudio: boolean;
  onSaveProject: () => void;
  onLoadProject: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  trackTitle,
  artistName,
  timingSource,
  validation,
  hasAudio,
  onSaveProject,
  onLoadProject,
}) => {
  const getTimingBadge = () => {
    switch (timingSource) {
      case 'SOURCE_ENHANCED_LRC':
        return { label: 'Word-Level Sync', icon: <CheckCircle2 size={12} />, status: 'exact' };
      case 'SOURCE_LRC':
        return { label: 'LRC Timed', icon: <CheckCircle2 size={12} />, status: 'exact' };
      case 'SOURCE_SYNC_PROVIDER':
        return { label: 'Provider Synced', icon: <CheckCircle2 size={12} />, status: 'exact' };
      case 'SOURCE_AUDIO_ALIGNMENT':
        return { label: 'Audio Aligned', icon: <CheckCircle2 size={12} />, status: 'aligned' };
      case 'SOURCE_MANUAL':
        return { label: 'Manual Timing', icon: <AlertTriangle size={12} />, status: 'manual' };
      default:
        return { label: 'Untimed', icon: <AlertOctagon size={12} />, status: 'missing' };
    }
  };

  const badge = getTimingBadge();
  const blockingIssues = validation.issues.filter((i) => i.blocking);
  const warnings = validation.issues.filter((i) => !i.blocking && i.type === 'warning');
  const hasErrors = blockingIssues.length > 0;
  const hasWarnings = warnings.length > 0;

  const tabs: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'projects', label: 'Projects', icon: <Folder size={14} /> },
    { id: 'lyrics', label: 'Lyrics', icon: <FileText size={14} /> },
    { id: 'timeline', label: 'Timeline', icon: <Sliders size={14} /> },
    { id: 'design', label: 'Design', icon: <Palette size={14} /> },
    { id: 'preview', label: 'Preview', icon: <PlayCircle size={14} /> },
    { id: 'export', label: 'Export', icon: <Download size={14} /> },
    { id: 'settings', label: 'Settings', icon: <Settings size={14} /> },
  ];

  return (
    <header className="site-navigation" role="navigation" aria-label="Main Navigation">
      <div className="nav-left">
        <div className="nav-brand" onClick={() => onTabChange('projects')} role="button" tabIndex={0}>
          <span className="brand-symbol">✦</span>
          <span className="brand-name">Thisck</span>
          <span className="brand-tag">Motion</span>
        </div>

        <div className="nav-divider" />

        <div className="nav-project-meta" title={`${trackTitle || 'Untitled'} - ${artistName || 'Artist'}`}>
          <Music size={12} className="meta-icon" />
          <span className="meta-title">{trackTitle || 'Untitled Track'}</span>
          {artistName && <span className="meta-artist">/ {artistName}</span>}
        </div>
      </div>

      <nav className="nav-tabs">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`nav-tab-item ${isActive ? 'is-active' : ''}`}
              onClick={() => onTabChange(tab.id)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
              {tab.id === 'export' && hasErrors && (
                <span className="tab-dot dot-error" title={`${blockingIssues.length} blocking issues`} />
              )}
              {tab.id === 'export' && !hasErrors && hasWarnings && (
                <span className="tab-dot dot-warning" title={`${warnings.length} warnings`} />
              )}
            </button>
          );
        })}
      </nav>

      <div className="nav-right">
        <div className={`nav-pill pill-${badge.status}`} title={`Timing Source: ${timingSource}`}>
          {badge.icon}
          <span>{badge.label}</span>
        </div>

        {hasAudio && (
          <div className="nav-pill pill-audio" title="Audio track attached">
            <Music size={12} />
            <span>Audio</span>
          </div>
        )}

        <div className="nav-actions">
          <button
            type="button"
            onClick={onLoadProject}
            className="nav-btn-ghost"
            title="Open saved project JSON"
          >
            <FolderOpen size={14} />
            <span>Open</span>
          </button>
          <button
            type="button"
            onClick={onSaveProject}
            className="nav-btn-save"
            title="Save project JSON"
          >
            <Save size={14} />
            <span>Save</span>
          </button>
        </div>
      </div>
    </header>
  );
};
