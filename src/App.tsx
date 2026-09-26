import { useState, useEffect, useRef, useMemo } from 'react';
import type { LyricLine, TrackMetadata, TimingSource } from './types/lyrics';
import type { StyleConfig, ExportSettings, AudioTrackState, ProjectState } from './types/project';
import { Header } from './components/Header';
import { InputPanel } from './components/InputPanel';
import { PreviewPlayer } from './components/PreviewPlayer';
import { TimelineEditor } from './components/TimelineEditor';
import { StylePanel } from './components/StylePanel';
import { ExportModal } from './components/ExportModal';

import { parseLrc } from './lib/lyrics/lrc-parser';
import { parseTxtLyrics } from './lib/lyrics/txt-parser';
import { exportProjectToJson, parseJsonLyrics } from './lib/lyrics/json-parser';
import { EDITORIAL_BURGUNDY, STYLE_PRESETS } from './lib/styles/presets';
import { validateProjectQuality } from './lib/validation/quality-validator';
import { chunkAllLyricLines } from './lib/layout/lyric-chunker';
import {
  nudgeLine,
  updateLineTiming,
  splitLine,
  mergeLines,
  getTotalDuration,
} from './lib/timeline/timeline-engine';
import { audioManager } from './lib/audio/audio-manager';
import { DEMO_LRC, DEMO_ENHANCED_LRC, DEMO_TXT } from './lib/data/demo-tracks';

export function App() {
  // 1. Initial State loaded with default editorial LRC
  const initialParsed = parseLrc(DEMO_LRC);

  const [lines, setLines] = useState<LyricLine[]>(initialParsed.lines);
  const [track, setTrack] = useState<TrackMetadata>({
    title: initialParsed.metadata.title || 'Secrets',
    artist: initialParsed.metadata.artist || 'Editorial Sound',
    album: initialParsed.metadata.album || 'Motion Sessions',
    audioSource: 'NONE',
    timingSource: 'SOURCE_LRC',
    duration: null,
  });

  const [style, setStyle] = useState<StyleConfig>(EDITORIAL_BURGUNDY);
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    fps: 60, // 60 FPS default (Section 14)
    bitrateKbps: 8000,
    includeAudio: false,
    format: 'mp4',
  });

  // Visual Chunking Layer: LRC Timeline -> Visual Chunker -> Visual Lyric Blocks
  const visualBlocks = useMemo(() => chunkAllLyricLines(lines, 42), [lines]);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(
    lines[0]?.id || null
  );
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isAligning, setIsAligning] = useState(false);

  const [audioState, setAudioState] = useState<AudioTrackState>({
    enabled: false,
    source: 'NONE',
    fileName: null,
    duration: null,
    audioBlobUrl: null,
    audioBuffer: null,
    peaks: [],
  });

  // Calculate total project duration
  const totalDuration = getTotalDuration(lines, audioState.duration);

  // Run Quality Validation
  const validation = validateProjectQuality(lines, audioState.duration, track.timingSource);

  // Playhead Animation Loop
  const playheadReqRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());

  useEffect(() => {
    if (!isPlaying) {
      if (playheadReqRef.current) cancelAnimationFrame(playheadReqRef.current);
      return;
    }

    lastTimeRef.current = performance.now();

    const tick = (now: number) => {
      const deltaSec = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      setCurrentTime((prev) => {
        const nextTime = prev + deltaSec;
        if (nextTime >= totalDuration) {
          setIsPlaying(false);
          return 0;
        }
        return nextTime;
      });

      playheadReqRef.current = requestAnimationFrame(tick);
    };

    playheadReqRef.current = requestAnimationFrame(tick);

    return () => {
      if (playheadReqRef.current) cancelAnimationFrame(playheadReqRef.current);
    };
  }, [isPlaying, totalDuration]);

  // Handlers for Lyrics Upload and Demonstrations
  const handleLyricsLoaded = (
    newLines: LyricLine[],
    meta?: Partial<TrackMetadata>,
    source: TimingSource = 'SOURCE_LRC'
  ) => {
    setLines(newLines);
    setSelectedLineId(newLines[0]?.id || null);
    setCurrentTime(0);
    setIsPlaying(false);
    setTrack((prev) => ({
      ...prev,
      title: meta?.title ?? prev.title,
      artist: meta?.artist ?? prev.artist,
      album: meta?.album ?? prev.album,
      timingSource: source,
    }));
  };

  const handleLoadPresetLyrics = (preset: 'lrc' | 'enhanced' | 'txt') => {
    if (preset === 'lrc') {
      const parsed = parseLrc(DEMO_LRC);
      handleLyricsLoaded(parsed.lines, parsed.metadata, 'SOURCE_LRC');
    } else if (preset === 'enhanced') {
      const parsed = parseLrc(DEMO_ENHANCED_LRC);
      handleLyricsLoaded(parsed.lines, parsed.metadata, 'SOURCE_ENHANCED_LRC');
    } else {
      const parsed = parseTxtLyrics(DEMO_TXT);
      handleLyricsLoaded(parsed.lines, { title: 'Secrets (Untimed)' }, 'SOURCE_UNKNOWN');
    }
  };

  // Handler for Audio Upload
  const handleAudioFileSelected = async (file: File) => {
    try {
      const loaded = await audioManager.loadAudioFile(file);
      setAudioState({
        enabled: true,
        source: 'USER_UPLOAD',
        fileName: file.name,
        duration: loaded.duration,
        audioBlobUrl: loaded.blobUrl,
        audioBuffer: loaded.buffer,
        peaks: loaded.peaks,
      });
      setExportSettings((prev) => ({ ...prev, includeAudio: true }));
      setTrack((prev) => ({
        ...prev,
        duration: loaded.duration,
        audioSource: 'USER_UPLOAD',
      }));
    } catch (err: any) {
      alert(`Could not decode audio file: ${err.message}`);
    }
  };

  // Mode C: Audio-to-lyrics alignment trigger
  const handleRunAudioAlignment = () => {
    if (!audioState.audioBuffer || !audioState.duration) {
      alert('Please upload an audio file first to align untimed lyrics.');
      return;
    }

    setIsAligning(true);
    try {
      const { alignedLines } = audioManager.alignLyricsToAudio(
        lines,
        audioState.audioBuffer,
        audioState.duration
      );
      setLines(alignedLines);
      setTrack((prev) => ({
        ...prev,
        timingSource: 'SOURCE_AUDIO_ALIGNMENT',
      }));
    } catch (err: any) {
      alert(`Alignment failed: ${err.message}`);
    } finally {
      setIsAligning(false);
    }
  };

  // Timeline Handlers
  const handleNudgeLine = (lineId: string, deltaMs: number) => {
    const updated = nudgeLine(lines, lineId, deltaMs);
    setLines(updated);
  };

  const handleSplitLine = (lineId: string) => {
    const updated = splitLine(lines, lineId);
    setLines(updated);
  };

  const handleMergeWithNext = (lineId: string) => {
    const idx = lines.findIndex((l) => l.id === lineId);
    if (idx >= 0 && idx < lines.length - 1) {
      const updated = mergeLines(lines, lineId, lines[idx + 1].id);
      setLines(updated);
    }
  };

  const handleUpdateLineTiming = (lineId: string, start: number, end: number) => {
    const updated = updateLineTiming(lines, lineId, start, end);
    setLines(updated);
  };

  // Stepping Prev/Next Line in Preview
  const handlePrevLine = () => {
    const currentIndex = lines.findIndex(
      (l) => l.startTime !== null && currentTime >= l.startTime && currentTime < (l.endTime || l.startTime + 1)
    );
    if (currentIndex > 0) {
      const prevLine = lines[currentIndex - 1];
      if (prevLine.startTime !== null) {
        setCurrentTime(prevLine.startTime);
        setSelectedLineId(prevLine.id);
      }
    } else if (lines.length > 0 && lines[0].startTime !== null) {
      setCurrentTime(lines[0].startTime);
      setSelectedLineId(lines[0].id);
    }
  };

  const handleNextLine = () => {
    for (const l of lines) {
      if (l.startTime !== null && l.startTime > currentTime + 0.1) {
        setCurrentTime(l.startTime);
        setSelectedLineId(l.id);
        break;
      }
    }
  };

  // Project Persistence (Save / Open JSON)
  const handleSaveProject = () => {
    const project: ProjectState = {
      version: 1,
      id: `proj-${Date.now()}`,
      name: track.title || 'Untitled Project',
      updatedAt: new Date().toISOString(),
      track,
      lines,
      style,
      exportSettings,
      timingSource: track.timingSource,
      maxHoldDurationSec: 4.5,
    };

    const json = exportProjectToJson(project);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(track.title || 'project').toLowerCase().replace(/\s+/g, '-')}-project.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleLoadProject = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const parsed = parseJsonLyrics(content);
          if (parsed.project) {
            setLines(parsed.project.lines);
            setTrack(parsed.project.track);
            setStyle(parsed.project.style);
            setExportSettings(parsed.project.exportSettings);
          } else {
            handleLyricsLoaded(parsed.lines, parsed.track);
          }
        } catch (err: any) {
          alert(`Failed to load project: ${err.message}`);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  return (
    <div className="app-container">
      {/* 1. Header */}
      <Header
        title={track.title}
        artist={track.artist}
        timingSource={track.timingSource}
        validation={validation}
        hasAudio={!!audioState.audioBlobUrl}
        onOpenExport={() => setIsExportModalOpen(true)}
        onSaveProject={handleSaveProject}
        onLoadProject={handleLoadProject}
      />

      {/* 2. Studio Workspace */}
      <div className="studio-workspace">
        {/* Left: Input & Source Panel */}
        <InputPanel
          track={track}
          lines={lines}
          timingSource={track.timingSource}
          audioFileName={audioState.fileName}
          audioDuration={audioState.duration}
          isAligning={isAligning}
          onLyricsLoaded={handleLyricsLoaded}
          onAudioFileSelected={handleAudioFileSelected}
          onUpdateMetadata={(meta) => setTrack((prev) => ({ ...prev, ...meta }))}
          onRunAudioAlignment={handleRunAudioAlignment}
          onLoadPresetLyrics={handleLoadPresetLyrics}
        />

        {/* Center: Deterministic Preview Player */}
        <PreviewPlayer
          lines={lines}
          style={style}
          visualBlocks={visualBlocks}
          currentTime={currentTime}
          totalDuration={totalDuration}
          isPlaying={isPlaying}
          audioBlobUrl={audioState.audioBlobUrl}
          trackTitle={track.title}
          artistName={track.artist}
          onTimeUpdate={(t) => setCurrentTime(t)}
          onPlayPause={() => setIsPlaying(!isPlaying)}
          onRestart={() => {
            setCurrentTime(0);
            setIsPlaying(false);
          }}
          onPrevLine={handlePrevLine}
          onNextLine={handleNextLine}
        />

        {/* Right: Style & Quality Check Panel */}
        <StylePanel
          style={style}
          validation={validation}
          onUpdateStyle={(newS) => setStyle((prev) => ({ ...prev, ...newS }))}
          onApplyPreset={(pName) => {
            if (STYLE_PRESETS[pName]) {
              setStyle(STYLE_PRESETS[pName]);
            }
          }}
          onSelectIssueLine={(lineId) => {
            if (lineId) {
              setSelectedLineId(lineId);
              const target = lines.find((l) => l.id === lineId);
              if (target && target.startTime !== null) {
                setCurrentTime(target.startTime);
              }
            }
          }}
        />
      </div>

      {/* 3. Bottom Timeline Editor */}
      <TimelineEditor
        lines={lines}
        currentTime={currentTime}
        totalDuration={totalDuration}
        audioPeaks={audioState.peaks}
        selectedLineId={selectedLineId}
        onSelectLine={(id) => setSelectedLineId(id)}
        onSeek={(t) => setCurrentTime(t)}
        onUpdateLineTiming={handleUpdateLineTiming}
        onNudgeLine={handleNudgeLine}
        onSplitLine={handleSplitLine}
        onMergeWithNext={handleMergeWithNext}
      />

      {/* 4. Export Modal */}
      {isExportModalOpen && (
        <ExportModal
          lines={lines}
          style={style}
          visualBlocks={visualBlocks}
          exportSettings={exportSettings}
          audioBuffer={audioState.audioBuffer}
          trackTitle={track.title}
          artistName={track.artist}
          validation={validation}
          onClose={() => setIsExportModalOpen(false)}
          onUpdateExportSettings={(s) => setExportSettings((prev) => ({ ...prev, ...s }))}
        />
      )}
    </div>
  );
}

export default App;
