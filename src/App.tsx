import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { LyricLine, TrackMetadata, TimingSource } from './types/lyrics';
import type { StyleConfig, ExportSettings, AudioTrackState, ProjectState, ActiveTab, MotionLayersConfig } from './types/project';
import { DEFAULT_RAIN_CONFIG } from './lib/layers/rain-overlay';
import { DEFAULT_WATERMARK_CONFIG } from './lib/layers/watermark';
import { Navigation } from './components/Navigation';
import { ProjectsPage } from './components/pages/ProjectsPage';
import { LyricsPage } from './components/pages/LyricsPage';
import { TimelinePage } from './components/pages/TimelinePage';
import { DesignPage } from './components/pages/DesignPage';
import { PreviewPage } from './components/pages/PreviewPage';
import { ExportPage } from './components/pages/ExportPage';
import { SettingsPage } from './components/pages/SettingsPage';

import { parseLrc } from './lib/lyrics/lrc-parser';
import { parseTxtLyrics } from './lib/lyrics/txt-parser';
import { exportProjectToJson, parseJsonLyrics } from './lib/lyrics/json-parser';
import { DEEP_FOREST, STYLE_PRESETS } from './lib/styles/presets';
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
  const [activeTab, setActiveTab] = useState<ActiveTab>('lyrics');

  // Initial State loaded with default editorial LRC
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

  const [style, setStyle] = useState<StyleConfig>(DEEP_FOREST);
  // PRD Section 6: 30 FPS is the default export preset.
  const [exportSettings, setExportSettings] = useState<ExportSettings>({
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    fps: 30,
    bitrateKbps: 8000,
    includeAudio: false,
    format: 'mp4',
  });

  // Visual Chunking Layer: LRC Timeline -> Visual Chunker -> Visual Lyric Blocks
  const visualBlocks = useMemo(() => chunkAllLyricLines(lines, 42), [lines]);

  // PRD Section 19-25: Motion layer configuration (text animation, overlays, watermark)
  const [motionLayers, setMotionLayers] = useState<MotionLayersConfig>({
    textAnimation: 'slide-up',
    rain: { ...DEFAULT_RAIN_CONFIG },
    watermark: { ...DEFAULT_WATERMARK_CONFIG },
  });

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(
    lines[0]?.id || null
  );
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

  // Calculate raw lyric timeline duration
  const lyricTimelineDuration = getTotalDuration(lines, null); // pure lyric duration
  
  // Resolve output range per PRD Section 1-7
  const resolvedOutputRange = useMemo(() => {
    const range = exportSettings.outputRange;
    const mode = range?.mode || 'AUTO';
    const mediaDuration = audioState.duration || null;
    
    let start = 0;
    let end = lyricTimelineDuration;
    
    if (mode === 'AUTO') {
      end = mediaDuration || lyricTimelineDuration;
    } else if (mode === 'AUDIO' && mediaDuration) {
      end = mediaDuration;
    } else if (mode === 'LYRICS') {
      end = lyricTimelineDuration;
    } else if (mode === 'MANUAL' || mode === 'CUSTOM') {
      start = range?.startTime || 0;
      end = range?.endTime || (mediaDuration || lyricTimelineDuration);
    }
    
    return { startTime: start, endTime: end, mode };
  }, [exportSettings.outputRange, audioState.duration, lyricTimelineDuration]);

  // Max extent for scrubbing
  const totalDuration = Math.max(lyricTimelineDuration, audioState.duration || 0);
  const activeDuration = resolvedOutputRange.endTime;

  // Run Quality Validation
  const validation = validateProjectQuality(lines, audioState.duration, track.timingSource);

  // Playhead Animation Loop
  const playheadReqRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

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
        if (nextTime >= activeDuration) {
          setIsPlaying(false);
          return resolvedOutputRange.startTime;
        }
        return nextTime;
      });

      playheadReqRef.current = requestAnimationFrame(tick);
    };

    playheadReqRef.current = requestAnimationFrame(tick);

    return () => {
      if (playheadReqRef.current) cancelAnimationFrame(playheadReqRef.current);
    };
  }, [isPlaying, activeDuration, resolvedOutputRange.startTime]);

  // Stepping Prev/Next Line in Preview
  const handlePrevLine = useCallback(() => {
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
  }, [lines, currentTime]);

  const handleNextLine = useCallback(() => {
    for (const l of lines) {
      if (l.startTime !== null && l.startTime > currentTime + 0.1) {
        setCurrentTime(l.startTime);
        setSelectedLineId(l.id);
        break;
      }
    }
  }, [lines, currentTime]);

  // Global Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.key === '[') {
        e.preventDefault();
        handlePrevLine();
      } else if (e.key === ']') {
        e.preventDefault();
        handleNextLine();
      } else if (e.key === 'Home' || e.key === '0') {
        e.preventDefault();
        setCurrentTime(resolvedOutputRange.startTime);
        setIsPlaying(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrevLine, handleNextLine, resolvedOutputRange.startTime]);

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

  const handleUpdateLineText = (lineId: string, text: string) => {
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, text: text.trim() } : l))
    );
  };

  // Global Offset (e.g. +100ms, -250ms across every timed line)
  const handleApplyGlobalOffset = (deltaMs: number) => {
    const deltaSec = deltaMs / 1000;
    setLines((prev) =>
      prev.map((l) => {
        if (l.startTime === null) return l;
        const newStart = Math.max(0, l.startTime + deltaSec);
        const newEnd = l.endTime !== null ? Math.max(newStart + 0.1, l.endTime + deltaSec) : null;
        return {
          ...l,
          startTime: newStart,
          endTime: newEnd,
        };
      })
    );
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

  const handleNewProject = () => {
    if (confirm('Create new blank project session? Unsaved changes will be discarded.')) {
      setLines([]);
      setTrack({
        title: 'New Session',
        artist: '',
        album: '',
        audioSource: 'NONE',
        timingSource: 'SOURCE_UNKNOWN',
        duration: null,
      });
      setSelectedLineId(null);
      setCurrentTime(0);
      setIsPlaying(false);
      setAudioState({
        enabled: false,
        source: 'NONE',
        fileName: null,
        duration: null,
        audioBlobUrl: null,
        audioBuffer: null,
        peaks: [],
      });
      setActiveTab('lyrics');
    }
  };

  return (
    <div className="app-container">
      {/* Persistent Minimal Editorial Navigation */}
      <Navigation
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        trackTitle={track.title}
        artistName={track.artist}
        timingSource={track.timingSource}
        validation={validation}
        hasAudio={!!audioState.audioBlobUrl}
        onSaveProject={handleSaveProject}
        onLoadProject={handleLoadProject}
      />

      {/* Main Product Area Viewport */}
      <main className="main-viewport-content">
        {activeTab === 'projects' && (
          <ProjectsPage
            track={track}
            lines={lines}
            timingSource={track.timingSource}
            totalDuration={totalDuration}
            hasAudio={!!audioState.audioBlobUrl}
            onUpdateMetadata={(meta) => setTrack((prev) => ({ ...prev, ...meta }))}
            onLoadPresetLyrics={handleLoadPresetLyrics}
            onLoadProject={handleLoadProject}
            onSaveProject={handleSaveProject}
            onNewProject={handleNewProject}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'lyrics' && (
          <LyricsPage
            lines={lines}
            track={track}
            timingSource={track.timingSource}
            audioFileName={audioState.fileName}
            audioDuration={audioState.duration}
            isAligning={isAligning}
            selectedLineId={selectedLineId}
            currentTime={currentTime}
            validation={validation}
            onSelectLine={(id) => setSelectedLineId(id)}
            onSeek={(t) => setCurrentTime(t)}
            onLyricsLoaded={handleLyricsLoaded}
            onAudioFileSelected={handleAudioFileSelected}
            onRunAudioAlignment={handleRunAudioAlignment}
            onNudgeLine={handleNudgeLine}
            onSplitLine={handleSplitLine}
            onMergeWithNext={handleMergeWithNext}
            onUpdateLineText={handleUpdateLineText}
            onApplyGlobalOffset={handleApplyGlobalOffset}
          />
        )}

        {activeTab === 'timeline' && (
          <TimelinePage
            lines={lines}
            currentTime={currentTime}
            totalDuration={totalDuration}
            resolvedOutputRange={resolvedOutputRange}
            isPlaying={isPlaying}
            audioPeaks={audioState.peaks}
            audioFileName={audioState.fileName}
            selectedLineId={selectedLineId}
            validation={validation}
            onPlayPause={() => setIsPlaying(!isPlaying)}
            onRestart={() => {
              setCurrentTime(resolvedOutputRange.startTime);
              setIsPlaying(false);
            }}
            onSelectLine={(id) => setSelectedLineId(id)}
            onSeek={(t) => setCurrentTime(t)}
            onUpdateLineTiming={handleUpdateLineTiming}
            onNudgeLine={handleNudgeLine}
            onSplitLine={handleSplitLine}
            onMergeWithNext={handleMergeWithNext}
            onApplyGlobalOffset={handleApplyGlobalOffset}
          />
        )}

        {activeTab === 'design' && (
          <DesignPage
            lines={lines}
            style={style}
            visualBlocks={visualBlocks}
            currentTime={currentTime}
            totalDuration={totalDuration}
            isPlaying={isPlaying}
            audioBlobUrl={audioState.audioBlobUrl}
            trackTitle={track.title}
            artistName={track.artist}
            validation={validation}
            onUpdateStyle={(newS) => setStyle((prev) => ({ ...prev, ...newS }))}
            onApplyPreset={(pName) => {
              if (STYLE_PRESETS[pName]) {
                setStyle(STYLE_PRESETS[pName]);
              }
            }}
            onTimeUpdate={(t) => setCurrentTime(t)}
            onPlayPause={() => setIsPlaying(!isPlaying)}
            onRestart={() => {
              setCurrentTime(resolvedOutputRange.startTime);
              setIsPlaying(false);
            }}
            onPrevLine={handlePrevLine}
            onNextLine={handleNextLine}
          />
        )}

        {activeTab === 'preview' && (
          <PreviewPage
            lines={lines}
            style={style}
            visualBlocks={visualBlocks}
            currentTime={currentTime}
            totalDuration={totalDuration}
            resolvedOutputRange={resolvedOutputRange}
            exportSettings={exportSettings}
            isPlaying={isPlaying}
            audioBlobUrl={audioState.audioBlobUrl}
            trackTitle={track.title}
            artistName={track.artist}
            timingSource={track.timingSource}
            onUpdateExportSettings={(s) => setExportSettings((prev) => ({ ...prev, ...s }))}
            onTimeUpdate={(t) => setCurrentTime(t)}
            onPlayPause={() => setIsPlaying(!isPlaying)}
            onRestart={() => {
              setCurrentTime(resolvedOutputRange.startTime);
              setIsPlaying(false);
            }}
            onPrevLine={handlePrevLine}
            onNextLine={handleNextLine}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'export' && (
          <ExportPage
            lines={lines}
            style={style}
            visualBlocks={visualBlocks}
            exportSettings={exportSettings}
            audioBuffer={audioState.audioBuffer}
            trackTitle={track.title}
            artistName={track.artist}
            validation={validation}
            totalDuration={totalDuration}
            motionLayers={motionLayers}
            resolvedOutputRange={resolvedOutputRange}
            lyricTimelineDuration={lyricTimelineDuration}
            mediaDuration={audioState.duration || null}
            onUpdateExportSettings={(s) => setExportSettings((prev) => ({ ...prev, ...s }))}
            onUpdateMotionLayers={(ml) => setMotionLayers((prev) => ({ ...prev, ...ml }))}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPage
            exportSettings={exportSettings}
            onUpdateExportSettings={(s) => setExportSettings((prev) => ({ ...prev, ...s }))}
          />
        )}
      </main>
    </div>
  );
}

export default App;
