import React, { useState, useMemo } from 'react';
import { 
  Upload, 
  Music, 
  Search, 
  Clock, 
  AlertTriangle, 
  AlertOctagon, 
  Scissors, 
  Merge, 
  Plus, 
  Minus, 
  Play, 
  Sparkles,
  FileText,
  RefreshCw
} from 'lucide-react';
import type { LyricLine, TrackMetadata, TimingSource, QualityValidationResult } from '../../types/lyrics';
import { parseLrc } from '../../lib/lyrics/lrc-parser';
import { parseTxtLyrics } from '../../lib/lyrics/txt-parser';
import { parseJsonLyrics } from '../../lib/lyrics/json-parser';

interface LyricsPageProps {
  lines: LyricLine[];
  track: TrackMetadata;
  timingSource: TimingSource;
  audioFileName: string | null;
  audioDuration: number | null;
  isAligning: boolean;
  selectedLineId: string | null;
  currentTime: number;
  validation: QualityValidationResult;
  onSelectLine: (id: string) => void;
  onSeek: (time: number) => void;
  onLyricsLoaded: (lines: LyricLine[], meta?: Partial<TrackMetadata>, source?: TimingSource) => void;
  onAudioFileSelected: (file: File) => void;
  onRunAudioAlignment: () => void;
  onNudgeLine: (lineId: string, deltaMs: number) => void;
  onSplitLine: (lineId: string) => void;
  onMergeWithNext: (lineId: string) => void;
  onUpdateLineText: (lineId: string, text: string) => void;
  onApplyGlobalOffset: (deltaMs: number) => void;
}

export const LyricsPage: React.FC<LyricsPageProps> = ({
  lines,
  track: _track,
  timingSource,
  audioFileName,
  audioDuration: _audioDuration,
  isAligning,
  selectedLineId,
  currentTime,
  validation,
  onSelectLine,
  onSeek,
  onLyricsLoaded,
  onAudioFileSelected,
  onRunAudioAlignment,
  onNudgeLine,
  onSplitLine,
  onMergeWithNext,
  onUpdateLineText,
  onApplyGlobalOffset,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const formatSeconds = (sec: number | null) => {
    if (sec === null) return '--:--.--';
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toFixed(2);
    return `${m.toString().padStart(2, '0')}:${s.padStart(5, '0')}`;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const lower = file.name.toLowerCase();

      try {
        if (lower.endsWith('.lrc')) {
          const parsed = parseLrc(content);
          const isEnhanced = parsed.lines.some((l) => l.words && l.words.length > 0);
          onLyricsLoaded(
            parsed.lines,
            parsed.metadata,
            isEnhanced ? 'SOURCE_ENHANCED_LRC' : 'SOURCE_LRC'
          );
        } else if (lower.endsWith('.json')) {
          const parsed = parseJsonLyrics(content);
          onLyricsLoaded(parsed.lines, parsed.track, parsed.project?.timingSource || 'SOURCE_UNKNOWN');
        } else {
          const parsed = parseTxtLyrics(content);
          onLyricsLoaded(parsed.lines, { title: file.name.replace(/\.[^/.]+$/, '') }, 'SOURCE_UNKNOWN');
        }
      } catch (err: any) {
        alert(`Failed to parse lyrics: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onAudioFileSelected(file);
    }
    e.target.value = '';
  };

  const filteredLines = useMemo(() => {
    if (!searchQuery.trim()) return lines;
    const q = searchQuery.toLowerCase();
    return lines.filter((l) => l.text.toLowerCase().includes(q));
  }, [lines, searchQuery]);

  const blockingIssues = useMemo(() => validation.issues.filter((i) => i.blocking), [validation]);
  const warnings = useMemo(() => validation.issues.filter((i) => !i.blocking && i.type === 'warning'), [validation]);

  // Map issue lines
  const lineErrorsMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of blockingIssues) {
      if (b.lineId) map.set(b.lineId, b.message);
    }
    for (const w of warnings) {
      if (w.lineId && !map.has(w.lineId)) map.set(w.lineId, w.message);
    }
    return map;
  }, [blockingIssues, warnings]);

  return (
    <div className="workspace-page lyrics-page">
      {/* Top Controls Toolbar */}
      <div className="lyrics-toolbar">
        <div className="toolbar-left">
          <label className="btn btn-primary btn-sm">
            <Upload size={14} />
            <span>Upload Lyrics (.lrc, .txt, .json)</span>
            <input
              type="file"
              accept=".lrc,.txt,.json"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
          </label>

          <label className="btn btn-secondary btn-sm">
            <Music size={14} />
            <span>{audioFileName ? `Audio: ${audioFileName}` : 'Link Audio (.mp3, .wav)'}</span>
            <input
              type="file"
              accept="audio/*"
              onChange={handleAudioUpload}
              style={{ display: 'none' }}
            />
          </label>

          {audioFileName && timingSource === 'SOURCE_UNKNOWN' && (
            <button
              type="button"
              className="btn btn-accent btn-sm"
              onClick={onRunAudioAlignment}
              disabled={isAligning}
            >
              <RefreshCw size={13} className={isAligning ? 'spin-animation' : ''} />
              <span>{isAligning ? 'Aligning...' : 'Mode C: Align to Audio'}</span>
            </button>
          )}
        </div>

        <div className="toolbar-center">
          <div className="search-box">
            <Search size={14} className="search-icon" />
            <input
              type="text"
              placeholder="Search lyrics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
          </div>
        </div>

        <div className="toolbar-right">
          <div className="global-offset-group">
            <span className="offset-label">Global Shift:</span>
            <button
              type="button"
              className="btn-offset"
              onClick={() => onApplyGlobalOffset(-500)}
              title="Shift all timestamps -500ms"
            >
              -500ms
            </button>
            <button
              type="button"
              className="btn-offset"
              onClick={() => onApplyGlobalOffset(-100)}
              title="Shift all timestamps -100ms"
            >
              -100ms
            </button>
            <button
              type="button"
              className="btn-offset"
              onClick={() => onApplyGlobalOffset(100)}
              title="Shift all timestamps +100ms"
            >
              +100ms
            </button>
            <button
              type="button"
              className="btn-offset"
              onClick={() => onApplyGlobalOffset(500)}
              title="Shift all timestamps +500ms"
            >
              +500ms
            </button>
          </div>
        </div>
      </div>

      {/* Validation Alert Banner if issues exist */}
      {blockingIssues.length > 0 && (
        <div className="validation-alert-banner">
          <AlertOctagon size={16} className="alert-icon-error" />
          <div className="alert-content">
            <span className="alert-title">{blockingIssues.length} Timing Issues Found</span>
            <span className="alert-desc">
              {blockingIssues[0]?.message} (Export is blocked until resolved)
            </span>
          </div>
        </div>
      )}

      {/* Main Lyric Table / Editorial Document */}
      <div className="lyrics-table-container">
        <div className="lyrics-table-header">
          <div className="col-num">#</div>
          <div className="col-time">Time Range</div>
          <div className="col-source">Timing Type</div>
          <div className="col-text">Lyric Text</div>
          <div className="col-duration">Duration</div>
          <div className="col-actions">Actions</div>
        </div>

        <div className="lyrics-list-body">
          {filteredLines.length === 0 ? (
            <div className="lyrics-empty-state">
              <FileText size={32} className="empty-icon" />
              <h3>No lyric lines match your filter</h3>
              <p>Upload a lyrics file or load a demo to begin editing.</p>
            </div>
          ) : (
            filteredLines.map((line, idx) => {
              const isSelected = selectedLineId === line.id;
              const hasWordSync = !!(line.words && line.words.length > 0);
              const issueMsg = lineErrorsMap.get(line.id);
              const isCurrentlyPlaying = 
                line.startTime !== null && 
                currentTime >= line.startTime && 
                currentTime < (line.endTime || line.startTime + 1);

              return (
                <div
                  key={line.id}
                  className={`lyric-row ${isSelected ? 'is-selected' : ''} ${isCurrentlyPlaying ? 'is-playing' : ''} ${issueMsg ? 'has-issue' : ''}`}
                  onClick={() => onSelectLine(line.id)}
                >
                  <div className="col-num">
                    <span className="line-index">{(idx + 1).toString().padStart(2, '0')}</span>
                  </div>

                  <div className="col-time">
                    {line.startTime !== null ? (
                      <button
                        type="button"
                        className="time-tag"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSeek(line.startTime!);
                        }}
                        title="Click to seek playhead here"
                      >
                        <Clock size={11} />
                        <span>{formatSeconds(line.startTime)}</span>
                        <span className="time-arrow">→</span>
                        <span>{formatSeconds(line.endTime)}</span>
                      </button>
                    ) : (
                      <span className="untimed-pill">Untimed</span>
                    )}
                  </div>

                  <div className="col-source">
                    {hasWordSync ? (
                      <span className="pill-type pill-word">
                        <Sparkles size={11} />
                        <span>Word-Level</span>
                      </span>
                    ) : line.startTime !== null ? (
                      <span className="pill-type pill-line">Line-Level</span>
                    ) : (
                      <span className="pill-type pill-none">No Clock</span>
                    )}
                  </div>

                  <div className="col-text">
                    {editingLineId === line.id ? (
                      <input
                        type="text"
                        value={editingText}
                        autoFocus
                        onChange={(e) => setEditingText(e.target.value)}
                        onBlur={() => {
                          onUpdateLineText(line.id, editingText);
                          setEditingLineId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            onUpdateLineText(line.id, editingText);
                            setEditingLineId(null);
                          } else if (e.key === 'Escape') {
                            setEditingLineId(null);
                          }
                        }}
                        className="row-edit-input"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div 
                        className="row-text-content"
                        onDoubleClick={() => {
                          setEditingLineId(line.id);
                          setEditingText(line.text);
                        }}
                      >
                        <span className="lyric-main-text">{line.text}</span>
                        {hasWordSync && (
                          <div className="word-pills-row">
                            {line.words?.map((w, wIdx) => (
                              <span key={wIdx} className="word-pill" title={`${w.startTime.toFixed(2)}s - ${w.endTime.toFixed(2)}s`}>
                                {w.text}
                              </span>
                            ))}
                          </div>
                        )}
                        {issueMsg && (
                          <span className="row-issue-badge" title={issueMsg}>
                            <AlertTriangle size={12} />
                            <span>{issueMsg}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="col-duration">
                    <span className="duration-tag">
                      {line.startTime !== null && line.endTime !== null
                        ? `${(line.endTime - line.startTime).toFixed(2)}s`
                        : '--'}
                    </span>
                  </div>

                  <div className="col-actions">
                    <button
                      type="button"
                      className="row-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNudgeLine(line.id, -100);
                      }}
                      title="Nudge -100ms"
                    >
                      <Minus size={13} />
                    </button>
                    <button
                      type="button"
                      className="row-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNudgeLine(line.id, 100);
                      }}
                      title="Nudge +100ms"
                    >
                      <Plus size={13} />
                    </button>
                    <button
                      type="button"
                      className="row-action-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSplitLine(line.id);
                      }}
                      title="Split line at midpoint"
                    >
                      <Scissors size={13} />
                    </button>
                    {idx < lines.length - 1 && (
                      <button
                        type="button"
                        className="row-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onMergeWithNext(line.id);
                        }}
                        title="Merge with next line"
                      >
                        <Merge size={13} />
                      </button>
                    )}
                    {line.startTime !== null && (
                      <button
                        type="button"
                        className="row-action-btn play-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSeek(line.startTime!);
                        }}
                        title="Play from here"
                      >
                        <Play size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
