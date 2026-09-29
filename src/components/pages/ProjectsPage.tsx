import React, { useState } from 'react';
import { 
  Plus, 
  FolderOpen, 
  Download, 
  Sparkles, 
  FileText, 
  Music, 
  Clock, 
  ArrowRight,
  Disc
} from 'lucide-react';
import type { TrackMetadata, LyricLine, TimingSource } from '../../types/lyrics';
import type { ActiveTab } from '../../types/project';

interface ProjectsPageProps {
  track: TrackMetadata;
  lines: LyricLine[];
  timingSource: TimingSource;
  totalDuration: number;
  hasAudio: boolean;
  onUpdateMetadata: (meta: Partial<TrackMetadata>) => void;
  onLoadPresetLyrics: (preset: 'lrc' | 'enhanced' | 'srt' | 'txt') => void;
  onLoadProject: () => void;
  onSaveProject: () => void;
  onNewProject: () => void;
  onNavigateTab: (tab: ActiveTab) => void;
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  track,
  lines,
  timingSource,
  totalDuration,
  hasAudio,
  onUpdateMetadata,
  onLoadPresetLyrics,
  onLoadProject,
  onSaveProject,
  onNewProject,
  onNavigateTab,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(track.title || '');
  const [tempArtist, setTempArtist] = useState(track.artist || '');
  const [tempAlbum, setTempAlbum] = useState(track.album || '');

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleSaveMetadata = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateMetadata({
      title: tempTitle.trim() || 'Untitled Track',
      artist: tempArtist.trim(),
      album: tempAlbum.trim(),
    });
    setIsEditingTitle(false);
  };

  return (
    <div className="workspace-page projects-page">
      <div className="page-header">
        <div className="page-header-text">
          <span className="page-eyebrow">Workspace Hub</span>
          <h1 className="page-title">Projects & Sessions</h1>
          <p className="page-description">
            Organize lyrics video compositions, import project packages, or load curated editorial demos.
          </p>
        </div>

        <div className="page-header-actions">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onLoadProject}
          >
            <FolderOpen size={15} />
            <span>Open JSON</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onSaveProject}
          >
            <Download size={15} />
            <span>Export JSON</span>
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onNewProject}
          >
            <Plus size={15} />
            <span>New Session</span>
          </button>
        </div>
      </div>

      <div className="projects-grid">
        {/* Active Project Card */}
        <section className="editorial-card active-project-card">
          <div className="card-header">
            <div className="card-badge">
              <span className="status-indicator live" />
              <span>Current Session</span>
            </div>
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                setTempTitle(track.title || '');
                setTempArtist(track.artist || '');
                setTempAlbum(track.album || '');
                setIsEditingTitle(!isEditingTitle);
              }}
            >
              {isEditingTitle ? 'Cancel' : 'Edit Metadata'}
            </button>
          </div>

          {isEditingTitle ? (
            <form onSubmit={handleSaveMetadata} className="metadata-edit-form">
              <div className="form-group">
                <label htmlFor="proj-title">Track Title</label>
                <input
                  id="proj-title"
                  type="text"
                  value={tempTitle}
                  onChange={(e) => setTempTitle(e.target.value)}
                  className="input-text"
                  placeholder="e.g. Secrets"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="proj-artist">Artist / Performer</label>
                  <input
                    id="proj-artist"
                    type="text"
                    value={tempArtist}
                    onChange={(e) => setTempArtist(e.target.value)}
                    className="input-text"
                    placeholder="e.g. Editorial Sound"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="proj-album">Album / Collection</label>
                  <input
                    id="proj-album"
                    type="text"
                    value={tempAlbum}
                    onChange={(e) => setTempAlbum(e.target.value)}
                    className="input-text"
                    placeholder="e.g. Motion Sessions"
                  />
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="btn btn-primary btn-sm">
                  Save Changes
                </button>
              </div>
            </form>
          ) : (
            <div className="active-project-hero">
              <div className="project-display-title">
                <h2>{track.title || 'Untitled Track'}</h2>
                <span className="project-display-artist">{track.artist || 'Editorial Sound'}</span>
                {track.album && <span className="project-display-album">— {track.album}</span>}
              </div>

              <div className="project-stats-strip">
                <div className="stat-item">
                  <FileText size={15} className="stat-icon" />
                  <span className="stat-value">{lines.length}</span>
                  <span className="stat-label">Lines</span>
                </div>
                <div className="stat-item">
                  <Clock size={15} className="stat-icon" />
                  <span className="stat-value">{formatTime(totalDuration)}</span>
                  <span className="stat-label">Duration</span>
                </div>
                <div className="stat-item">
                  <Disc size={15} className="stat-icon" />
                  <span className="stat-value">
                    {timingSource === 'SOURCE_ENHANCED_LRC' ? 'Word Sync' : 'Line Sync'}
                  </span>
                  <span className="stat-label">Timing</span>
                </div>
                <div className="stat-item">
                  <Music size={15} className="stat-icon" />
                  <span className="stat-value">{hasAudio ? 'Linked' : 'Silent'}</span>
                  <span className="stat-label">Audio</span>
                </div>
              </div>

              <div className="card-footer-nav">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onNavigateTab('lyrics')}
                >
                  <span>Edit Lyrics & Timing</span>
                  <ArrowRight size={14} />
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onNavigateTab('design')}
                >
                  <span>Open Design Studio</span>
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Curated Editorial Demos */}
        <section className="editorial-card demo-presets-card">
          <div className="card-header">
            <div className="card-badge">
              <Sparkles size={13} />
              <span>Curated Demo Presets</span>
            </div>
          </div>

          <div className="demo-list">
            <div className="demo-item">
              <div className="demo-info">
                <h4>Hold You Down — Native SRT Subtitles</h4>
                <p>Standard SubRip subtitle format with exact millisecond start and end timecodes.</p>
                <div className="demo-tags">
                  <span className="tag-pill tag-accent">SRT</span>
                  <span className="tag-pill">Millisecond Precision</span>
                  <span className="tag-pill">Auto Smart Split</span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onLoadPresetLyrics('srt')}
              >
                Load Preset
              </button>
            </div>

            <div className="demo-item">
              <div className="demo-info">
                <h4>Secrets — Standard LRC</h4>
                <p>Classic line-by-line editorial timestamp synchronization (1080x1920 9:16).</p>
                <div className="demo-tags">
                  <span className="tag-pill">LRC</span>
                  <span className="tag-pill">Line Timing</span>
                  <span className="tag-pill">60 FPS</span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onLoadPresetLyrics('lrc')}
              >
                Load Preset
              </button>
            </div>

            <div className="demo-item">
              <div className="demo-info">
                <h4>Secrets — Word-Level Enhanced LRC</h4>
                <p>High-precision syllable & word timestamps for karaoke/kinetic motion.</p>
                <div className="demo-tags">
                  <span className="tag-pill tag-accent">Enhanced LRC</span>
                  <span className="tag-pill">Word Sync</span>
                  <span className="tag-pill">Continuous Clock</span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onLoadPresetLyrics('enhanced')}
              >
                Load Preset
              </button>
            </div>

            <div className="demo-item">
              <div className="demo-info">
                <h4>Secrets — Untimed Raw TXT</h4>
                <p>Plain text format without timestamps; ideal for audio-driven alignment testing.</p>
                <div className="demo-tags">
                  <span className="tag-pill">Plain TXT</span>
                  <span className="tag-pill">Mode C Align</span>
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onLoadPresetLyrics('txt')}
              >
                Load Preset
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
