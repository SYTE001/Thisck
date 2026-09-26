import React, { useState } from 'react';
import { Music, Search, Wand2, FileText, Check, AlertCircle } from 'lucide-react';
import type { LyricLine, TrackMetadata, TimingSource } from '../types/lyrics';
import { parseLrc } from '../lib/lyrics/lrc-parser';
import { parseTxtLyrics } from '../lib/lyrics/txt-parser';
import { parseJsonLyrics } from '../lib/lyrics/json-parser';
import { LrclibProvider, type LyricsSearchResult } from '../lib/sync/sync-provider';

interface InputPanelProps {
  track: TrackMetadata;
  lines: LyricLine[];
  timingSource: TimingSource;
  audioFileName: string | null;
  audioDuration: number | null;
  isAligning: boolean;
  onLyricsLoaded: (lines: LyricLine[], metadata?: Partial<TrackMetadata>, source?: TimingSource) => void;
  onAudioFileSelected: (file: File) => void;
  onUpdateMetadata: (metadata: Partial<TrackMetadata>) => void;
  onRunAudioAlignment: () => void;
  onLoadPresetLyrics: (preset: 'lrc' | 'enhanced' | 'txt') => void;
}

export const InputPanel: React.FC<InputPanelProps> = ({
  track,
  lines,
  timingSource,
  audioFileName,
  audioDuration,
  isAligning,
  onLyricsLoaded,
  onAudioFileSelected,
  onUpdateMetadata,
  onRunAudioAlignment,
  onLoadPresetLyrics,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<LyricsSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [showSearchModal, setShowSearchModal] = useState(false);

  const handleLyricsFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const ext = file.name.split('.').pop()?.toLowerCase();

      try {
        if (ext === 'json') {
          const parsed = parseJsonLyrics(content);
          onLyricsLoaded(
            parsed.lines,
            parsed.track,
            parsed.lines[0]?.startTime !== null ? 'SOURCE_LRC' : 'SOURCE_UNKNOWN'
          );
        } else if (ext === 'txt') {
          const parsed = parseTxtLyrics(content);
          onLyricsLoaded(parsed.lines, { title: file.name.replace(/\.[^/.]+$/, '') }, 'SOURCE_UNKNOWN');
        } else {
          // Default: LRC
          const parsed = parseLrc(content);
          onLyricsLoaded(
            parsed.lines,
            {
              title: parsed.metadata.title || file.name.replace(/\.[^/.]+$/, ''),
              artist: parsed.metadata.artist || '',
              album: parsed.metadata.album || '',
            },
            parsed.timingSource
          );
        }
      } catch (err: any) {
        alert(`Error parsing lyrics file: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAudioFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onAudioFileSelected(file);
    e.target.value = '';
  };

  const handleSearchLrclib = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchError(null);

    const provider = new LrclibProvider();
    try {
      const results = await provider.search({
        track: searchQuery.trim(),
        artist: track.artist,
      });
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError('No synced lyrics found for this query.');
      }
    } catch (err: any) {
      setSearchError(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = async (result: LyricsSearchResult) => {
    const provider = new LrclibProvider();
    setIsSearching(true);
    try {
      const synced = await provider.getSyncedLyrics(result.id);
      onLyricsLoaded(
        synced.lines,
        {
          title: result.trackName,
          artist: result.artistName,
          album: result.albumName,
          duration: result.duration,
        },
        'SOURCE_SYNC_PROVIDER'
      );
      setShowSearchModal(false);
      setSearchResults([]);
    } catch (err: any) {
      setSearchError(`Failed to fetch lyrics: ${err.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const hasMissingTimestamps = lines.some((l) => l.startTime === null);

  return (
    <aside className="panel input-panel">
      <div className="panel-header">
        <h2 className="panel-title">Track & Source</h2>
      </div>

      <div className="panel-body">
        {/* Track Metadata Inputs */}
        <div className="form-group">
          <label htmlFor="track-title-input" className="form-label">Song Title</label>
          <input
            id="track-title-input"
            type="text"
            className="form-input"
            value={track.title}
            onChange={(e) => onUpdateMetadata({ title: e.target.value })}
            placeholder="e.g. Midnight Drive"
          />
        </div>

        <div className="form-group">
          <label htmlFor="track-artist-input" className="form-label">Artist</label>
          <input
            id="track-artist-input"
            type="text"
            className="form-input"
            value={track.artist}
            onChange={(e) => onUpdateMetadata({ artist: e.target.value })}
            placeholder="e.g. The Paper Kites"
          />
        </div>

        {/* Lyrics Upload Dropzone */}
        <div className="upload-section">
          <label className="section-subtitle">Lyrics File (.lrc, .txt, .json)</label>
          <label className="file-dropzone" htmlFor="lyrics-file-input">
            <input
              id="lyrics-file-input"
              type="file"
              accept=".lrc,.txt,.json"
              className="visually-hidden"
              onChange={handleLyricsFileUpload}
            />
            <FileText size={20} className="dropzone-icon" />
            <div className="dropzone-text">
              <span className="dropzone-cta">Select lyrics file</span>
              <span className="dropzone-hint">Preserves exact millisecond timestamps</span>
            </div>
          </label>
        </div>

        {/* Audio Track Upload (Optional) */}
        <div className="upload-section">
          <div className="section-header-row">
            <label className="section-subtitle">Audio Track (Optional)</label>
            {audioFileName && <span className="audio-status-tag">Connected</span>}
          </div>
          <label className="file-dropzone audio-dropzone" htmlFor="audio-file-input">
            <input
              id="audio-file-input"
              type="file"
              accept="audio/*,.mp3,.wav,.m4a,.ogg"
              className="visually-hidden"
              onChange={handleAudioFileUpload}
            />
            <Music size={20} className="dropzone-icon" />
            <div className="dropzone-text">
              <span className="dropzone-cta">
                {audioFileName ? audioFileName : 'Select user audio track'}
              </span>
              <span className="dropzone-hint">
                {audioDuration
                  ? `Duration: ${Math.floor(audioDuration / 60)}:${Math.floor(audioDuration % 60).toString().padStart(2, '0')}`
                  : 'For synchronized MP4 or audio alignment'}
              </span>
            </div>
          </label>
        </div>

        {/* Missing Timestamp Resolver Prompt */}
        {hasMissingTimestamps && (
          <div className="missing-timestamps-card">
            <div className="card-header-row">
              <AlertCircle size={16} className="text-rose-400" />
              <span className="card-title">Timestamp Data Required</span>
            </div>
            <p className="card-desc">
              This lyrics file contains plain text without timestamps. To maintain exact synchronization without guessing:
            </p>
            <div className="card-actions">
              <button
                type="button"
                className="btn btn-sm btn-outline"
                onClick={() => {
                  setSearchQuery(track.title || '');
                  setShowSearchModal(true);
                }}
              >
                <Search size={13} />
                <span>Find Synced Lyrics</span>
              </button>

              {audioFileName && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={onRunAudioAlignment}
                  disabled={isAligning}
                >
                  <Wand2 size={13} />
                  <span>{isAligning ? 'Aligning...' : 'Align with Audio'}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Presets & Demonstrations */}
        <div className="demo-presets-section">
          <span className="section-subtitle">Sample Demonstrations</span>
          <div className="demo-button-grid">
            <button
              type="button"
              className="demo-btn"
              onClick={() => onLoadPresetLyrics('lrc')}
            >
              Exact LRC Demo
            </button>
            <button
              type="button"
              className="demo-btn"
              onClick={() => onLoadPresetLyrics('enhanced')}
            >
              Word-Level Demo
            </button>
            <button
              type="button"
              className="demo-btn"
              onClick={() => onLoadPresetLyrics('txt')}
            >
              Plain TXT Demo
            </button>
          </div>
        </div>

        {/* Line Summary */}
        <div className="lines-summary-card">
          <div className="summary-stat">
            <span className="stat-label">Total Lines</span>
            <span className="stat-val">{lines.length}</span>
          </div>
          <div className="summary-stat">
            <span className="stat-label">Timed Lines</span>
            <span className="stat-val">
              {lines.filter((l) => l.startTime !== null).length}
            </span>
          </div>
          <div className="summary-stat">
            <span className="stat-label">Timing Resolution</span>
            <span className="stat-val">
              {timingSource === 'SOURCE_ENHANCED_LRC' ? 'Word-level' : 'Line-level'}
            </span>
          </div>
        </div>
      </div>

      {/* Synced Lyrics Search Modal */}
      {showSearchModal && (
        <div className="modal-backdrop" onClick={() => setShowSearchModal(false)}>
          <div className="search-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Search Synchronized Lyrics</h3>
              <button
                type="button"
                className="close-btn"
                onClick={() => setShowSearchModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="search-input-row">
                <input
                  type="text"
                  className="form-input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Enter song title..."
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchLrclib()}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSearchLrclib}
                  disabled={isSearching}
                >
                  {isSearching ? 'Searching...' : 'Search'}
                </button>
              </div>

              {searchError && <p className="error-hint">{searchError}</p>}

              <div className="search-results-list">
                {searchResults.map((res) => (
                  <div
                    key={res.id}
                    className="search-result-item"
                    onClick={() => handleSelectSearchResult(res)}
                  >
                    <div className="result-track-info">
                      <span className="result-title">{res.trackName}</span>
                      <span className="result-artist">{res.artistName}</span>
                    </div>
                    {res.syncedLyrics && (
                      <span className="result-badge">
                        <Check size={12} /> Synced
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
