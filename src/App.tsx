import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from 'react';
import type { LyricLine, TrackMetadata, TimingSource } from './types/lyrics';
import type { StyleConfig, ExportSettings, AudioTrackState, ProjectState, ActiveTab, MotionLayersConfig } from './types/project';
import { DEFAULT_RAIN_CONFIG } from './lib/layers/rain-overlay';
import { DEFAULT_WATERMARK_CONFIG } from './lib/layers/watermark';
import { DEFAULT_TRANSITIONS_CONFIG } from './lib/layers/video-transitions';
import { Navigation } from './components/Navigation';
import { ProjectsPage } from './components/pages/ProjectsPage';
import { LyricsPage } from './components/pages/LyricsPage';
import { TimelinePage } from './components/pages/TimelinePage';
import { DesignPage } from './components/pages/DesignPage';
import { PreviewPage } from './components/pages/PreviewPage';
import { ExportPage } from './components/pages/ExportPage';
import { SettingsPage } from './components/pages/SettingsPage';

import { parseLrc } from './lib/lyrics/lrc-parser';
import { parseSrt } from './lib/lyrics/srt-parser';
import { parseTxtLyrics } from './lib/lyrics/txt-parser';
import { exportProjectToJson, parseJsonLyrics } from './lib/lyrics/json-parser';
import {
  autoArrange,
  resolveActiveLines,
  DEFAULT_ARRANGE_SETTINGS,
  type ArrangeSettings,
  type LyricsViewMode,
} from './lib/lyrics/auto-arrange';
import { runAudioSync } from './lib/lyrics/audio-sync';
import { runForcedAlignment, type SyncDraft } from './lib/sync/forced-alignment';
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
import { resolveOutputRangeFrom } from './lib/timeline/output-range';
import { hashProject } from './lib/project/project-snapshot';
import { toast } from './lib/ui/toast-bus';
import { ToastHost } from './components/ui/Toasts';
import { ConfirmDialog, type ConfirmDialogProps } from './components/ui/ConfirmDialog';
import { AiSyncModal, type AiSyncRunConfig } from './components/AiSyncModal';
import { DEMO_LRC, DEMO_ENHANCED_LRC, DEMO_SRT, DEMO_TXT } from './lib/data/demo-tracks';

/** Extract a human-readable message from an unknown thrown value. */
function errMessage(err: unknown, fallback = 'Unknown error'): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('lyrics');

  // Initial State loaded with default editorial LRC
  const initialParsed = parseLrc(DEMO_LRC);

  // ─── AUTO ARRANGE STATE ────────────────────────────────────────────────────
  // originalLines is the IMMUTABLE source: raw LRC text + timestamps, with the
  // multi-timestamp expansion already applied once at import. Auto Arrange never
  // mutates it, which is what makes "Reset to Original" exact and lossless.
  const [originalLines, setOriginalLines] = useState<LyricLine[]>(initialParsed.lines);
  const [processedLines, setProcessedLines] = useState<LyricLine[]>([]);
  const [arrangeSettings, setArrangeSettings] = useState<ArrangeSettings>(DEFAULT_ARRANGE_SETTINGS);
  const [viewMode, setViewMode] = useState<LyricsViewMode>('original');
  const [arrangeLog, setArrangeLog] = useState<string[]>([]);

  // Audio Sync loading state. The model is downloaded lazily on first use and
  // never enters the main bundle, so it must sit behind an explicit state.
  const [isAudioSyncLoading, setIsAudioSyncLoading] = useState(false);
  const [audioSyncProgress, setAudioSyncProgress] = useState(0);
  const [audioSyncError, setAudioSyncError] = useState<string | null>(null);

  /**
   * THE single resolution point. Timeline, Preview, Export, quality validation
   * and manual editing all read `activeLines`. No component receives
   * originalLines or processedLines directly.
   */
  const activeLines = useMemo(
    () => resolveActiveLines(originalLines, processedLines, viewMode),
    [originalLines, processedLines, viewMode]
  );

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

  // PRD Section 19-25: Motion layer configuration (text animation, overlays, watermark)
  const [motionLayers, setMotionLayers] = useState<MotionLayersConfig>({
    lyricsType: 'word-by-word',
    lyricsEffect: 'fade',
    lyricsEffectConfig: {
      duration: 400,
      intensity: 1.0,
      easing: 'ease-out',
      direction: 'up',
      stagger: 40,
    },
    textAnimation: 'word-by-word',
    rain: { ...DEFAULT_RAIN_CONFIG },
    watermark: { ...DEFAULT_WATERMARK_CONFIG },
    videoTransitions: { ...DEFAULT_TRANSITIONS_CONFIG },
  });

  // Visual Chunking Layer: activeLines -> Visual Chunker -> Visual Lyric Blocks
  // Preview, Timeline, Export and validation all consume THIS memo, so the block
  // list is identical in every consumer by construction.
  const visualBlocks = useMemo(
    () => chunkAllLyricLines(activeLines, 42, motionLayers.lyricsType),
    [activeLines, motionLayers.lyricsType]
  );

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  // PRD Section 5.3: playback speed lives at the app level so the one
  // authoritative audio element (below) and the silent monotonic clock both
  // honor it. Preview surfaces render the control but no longer own the value.
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(
    activeLines[0]?.id || null
  );
  const [isAligning, setIsAligning] = useState(false);

  // ─── AI Auto Sync (Forced Alignment) ───────────────────────────────────────
  const [aiSyncOpen, setAiSyncOpen] = useState(false);
  const [aiSyncRunning, setAiSyncRunning] = useState(false);
  const [aiSyncPercent, setAiSyncPercent] = useState(0);
  const [aiSyncStage, setAiSyncStage] = useState('');
  const [aiSyncError, setAiSyncError] = useState<string | null>(null);
  // Sync DRAFT (PRD §18): the run never touches the timeline directly; the
  // result is parked here and the user applies or discards it explicitly.
  const [aiSyncDraft, setAiSyncDraft] = useState<SyncDraft | null>(null);
  const aiSyncAbortRef = useRef<AbortController | null>(null);

  const [audioState, setAudioState] = useState<AudioTrackState>({
    enabled: false,
    source: 'NONE',
    fileName: null,
    duration: null,
    audioBlobUrl: null,
    audioBuffer: null,
    peaks: [],
  });

  // ─── Dirty tracking (PRD Section 18) ───────────────────────────────────────
  // Hash the serializable project content and compare against the last saved
  // hash. Runtime-only values (audio buffer, playback state) are excluded, so
  // playing or re-linking audio does not mark the project unsaved.
  const currentProjectHash = useMemo(
    () =>
      hashProject({
        track,
        originalLines,
        processedLines,
        viewMode,
        arrangeSettings,
        style,
        exportSettings,
        motionLayers,
      }),
    [track, originalLines, processedLines, viewMode, arrangeSettings, style, exportSettings, motionLayers]
  );
  const [lastSavedHash, setLastSavedHash] = useState<string | null>(() => currentProjectHash);
  const isDirty = lastSavedHash !== currentProjectHash;
  const saveStatus: 'saved' | 'unsaved' = isDirty ? 'unsaved' : 'saved';

  // ─── Application dialog (replaces native confirm) ──────────────────────────
  const [dialogState, setDialogState] = useState<ConfirmDialogProps | null>(null);

  const confirmDialog = useCallback(
    (opts: {
      title: string;
      message: ReactNode;
      confirmLabel: string;
      danger?: boolean;
    }): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        const close = (result: boolean) => {
          setDialogState(null);
          resolve(result);
        };
        setDialogState({
          open: true,
          title: opts.title,
          message: opts.message,
          onDismiss: () => close(false),
          actions: [
            { label: 'Cancel', variant: 'secondary', onClick: () => close(false) },
            {
              label: opts.confirmLabel,
              variant: opts.danger ? 'danger' : 'primary',
              onClick: () => close(true),
            },
          ],
        });
      }),
    []
  );

  // Calculate raw lyric timeline duration
  const lyricTimelineDuration = getTotalDuration(activeLines, null); // pure lyric duration
  
  // Resolve output range per PRD Section 0.2 / 4 / 7.
  // ONE resolver, shared with Timeline, Preview, Export and the validator.
  const resolvedOutputRange = useMemo(
    () =>
      resolveOutputRangeFrom(
        exportSettings.outputRange,
        lyricTimelineDuration,
        audioState.duration || null
      ),
    [exportSettings.outputRange, audioState.duration, lyricTimelineDuration]
  );

  // Max extent for scrubbing
  const totalDuration = Math.max(lyricTimelineDuration, audioState.duration || 0);
  const activeDuration = resolvedOutputRange.endTime;

  // Run Quality Validation against the SAME active list everything else reads.
  const validation = validateProjectQuality(activeLines, audioState.duration, track.timingSource);

  // ─── Playback Clock (PRD Section 5) ────────────────────────────────────────
  // When audio exists it is the AUTHORITATIVE clock: the render loop reads
  // audio.currentTime every frame instead of accumulating its own time, so the
  // canvas can never drift away from what the user hears. With no audio we fall
  // back to a monotonic performance.now() clock scaled by playback speed.
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const playheadReqRef = useRef<number | null>(null);
  const lastPerfRef = useRef<number>(0);
  const currentTimeRef = useRef<number>(0);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const hasAudio = !!audioState.audioBlobUrl;

  // Keep the audio element's rate/mute in sync with app state.
  useEffect(() => {
    const el = audioElRef.current;
    if (!el) return;
    el.playbackRate = playbackSpeed;
    el.muted = isMuted;
  }, [playbackSpeed, isMuted, hasAudio]);

  /**
   * Central seek — PRD Section 5.2. Clamp to the output range, move the audio
   * element and React state together in one place so they can never enter the
   * old "correct each other" feedback loop.
   */
  const seek = useCallback(
    (time: number) => {
      const clamped = Math.max(0, Math.min(time, totalDuration || time));
      const el = audioElRef.current;
      if (el && hasAudio) {
        try {
          el.currentTime = clamped;
        } catch {
          /* setting currentTime before metadata load can throw; ignored */
        }
      }
      setCurrentTime(clamped);
    },
    [hasAudio, totalDuration]
  );

  useEffect(() => {
    const el = audioElRef.current;

    if (!isPlaying) {
      if (playheadReqRef.current) cancelAnimationFrame(playheadReqRef.current);
      if (el) el.pause();
      return;
    }

    if (hasAudio && el) {
      // Audio-driven: read the audio clock, never write it here.
      el.playbackRate = playbackSpeed;
      if (Math.abs(el.currentTime - currentTimeRef.current) > 0.3) {
        try {
          el.currentTime = currentTimeRef.current;
        } catch {
          /* ignored */
        }
      }
      el.play().catch(() => {});

      const tick = () => {
        const t = el.currentTime;
        if (t >= activeDuration) {
          setIsPlaying(false);
          setCurrentTime(resolvedOutputRange.startTime);
          return;
        }
        setCurrentTime(t);
        playheadReqRef.current = requestAnimationFrame(tick);
      };
      playheadReqRef.current = requestAnimationFrame(tick);
    } else {
      // Silent monotonic clock.
      lastPerfRef.current = performance.now();
      const tick = (now: number) => {
        const deltaSec = ((now - lastPerfRef.current) / 1000) * playbackSpeed;
        lastPerfRef.current = now;
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
    }

    return () => {
      if (playheadReqRef.current) cancelAnimationFrame(playheadReqRef.current);
    };
  }, [isPlaying, activeDuration, resolvedOutputRange.startTime, playbackSpeed, hasAudio]);

  // Stepping Prev/Next Line in Preview
  const handlePrevLine = useCallback(() => {
    const currentIndex = activeLines.findIndex(
      (l) => l.startTime !== null && currentTime >= l.startTime && currentTime < (l.endTime || l.startTime + 1)
    );
    if (currentIndex > 0) {
      const prevLine = activeLines[currentIndex - 1];
      if (prevLine.startTime !== null) {
        seek(prevLine.startTime);
        setSelectedLineId(prevLine.id);
      }
    } else if (activeLines.length > 0 && activeLines[0].startTime !== null) {
      seek(activeLines[0].startTime);
      setSelectedLineId(activeLines[0].id);
    }
  }, [activeLines, currentTime, seek]);

  const handleNextLine = useCallback(() => {
    for (const l of activeLines) {
      if (l.startTime !== null && l.startTime > currentTime + 0.1) {
        seek(l.startTime);
        setSelectedLineId(l.id);
        break;
      }
    }
  }, [activeLines, currentTime, seek]);

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
        seek(resolvedOutputRange.startTime);
        setIsPlaying(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePrevLine, handleNextLine, resolvedOutputRange.startTime, seek]);

  // Handlers for Lyrics Upload and Demonstrations
  // A new import REPLACES originalLines and discards any previous processed
  // result, because that result was derived from the old source.
  const handleLyricsLoaded = (
    newLines: LyricLine[],
    meta?: Partial<TrackMetadata>,
    source: TimingSource = 'SOURCE_LRC'
  ) => {
    setOriginalLines(newLines);
    setProcessedLines([]);
    setViewMode('original');
    setArrangeLog([]);
    setSelectedLineId(newLines[0]?.id || null);
    setCurrentTime(0);
    setIsPlaying(false);
    const resolvedFormat = meta?.sourceFormat ?? newLines[0]?.sourceFormat ?? 'lrc';
    setTrack((prev) => ({
      ...prev,
      title: meta?.title ?? prev.title,
      artist: meta?.artist ?? prev.artist,
      album: meta?.album ?? prev.album,
      timingSource: source,
      sourceFormat: resolvedFormat,
    }));
  };

  const handleLoadPresetLyrics = (preset: 'lrc' | 'enhanced' | 'srt' | 'txt') => {
    if (preset === 'lrc') {
      const parsed = parseLrc(DEMO_LRC);
      handleLyricsLoaded(parsed.lines, parsed.metadata, 'SOURCE_LRC');
    } else if (preset === 'enhanced') {
      const parsed = parseLrc(DEMO_ENHANCED_LRC);
      handleLyricsLoaded(parsed.lines, parsed.metadata, 'SOURCE_ENHANCED_LRC');
    } else if (preset === 'srt') {
      const parsed = parseSrt(DEMO_SRT);
      handleLyricsLoaded(
        parsed.lines,
        { title: 'Hold You Down (SRT Demo)', sourceFormat: 'srt' },
        'SOURCE_SRT'
      );
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
        audioFile: file,
        peaks: loaded.peaks,
      });
      setExportSettings((prev) => ({ ...prev, includeAudio: true }));
      setTrack((prev) => ({
        ...prev,
        duration: loaded.duration,
        audioSource: 'USER_UPLOAD',
      }));
    } catch (err) {
      toast.error('Audio could not be decoded.', `${errMessage(err)} — the current lyric timing is unchanged. Try a WAV or MP3 file.`);
    }
  };

  // Mode C: Audio-to-lyrics alignment trigger
  const handleRunAudioAlignment = () => {
    if (!audioState.audioBuffer || !audioState.duration) {
      toast.warning('No audio loaded.', 'Upload an audio file first to align untimed lyrics.');
      return;
    }

    setIsAligning(true);
    try {
      // Alignment is a source-level operation: it rewrites the ORIGINAL cues.
      const { alignedLines } = audioManager.alignLyricsToAudio(
        originalLines,
        audioState.audioBuffer,
        audioState.duration
      );
      setOriginalLines(alignedLines);
      // The previous processed output was derived from the pre-alignment source.
      setProcessedLines([]);
      setViewMode('original');
      setTrack((prev) => ({
        ...prev,
        timingSource: 'SOURCE_AUDIO_ALIGNMENT',
      }));
      toast.success('Energy-based alignment applied.', 'Review and correct the cues manually — this is a heuristic, not exact word sync.');
    } catch (err) {
      toast.error('Alignment failed.', errMessage(err));
    } finally {
      setIsAligning(false);
    }
  };

  // ─── AI AUTO SYNC (Forced Alignment) ───────────────────────────────────────

  const handleOpenAiSync = () => {
    if (!audioState.audioBuffer) {
      toast.warning('No audio loaded.', 'Link an audio file first, then run AI Auto Sync.');
      return;
    }
    if (originalLines.length === 0) {
      toast.warning('No lyrics loaded.', 'Upload or paste lyrics before running AI Auto Sync.');
      return;
    }
    setAiSyncError(null);
    setAiSyncPercent(0);
    setAiSyncStage('');
    setAiSyncOpen(true);
  };

  const handleCancelAiSync = () => {
    aiSyncAbortRef.current?.abort();
  };

  const handleCloseAiSync = () => {
    if (aiSyncRunning) return;
    // Closing with a pending draft discards it — the timeline was never touched.
    setAiSyncDraft(null);
    setAiSyncOpen(false);
  };

  const handleDiscardAiSync = () => {
    setAiSyncDraft(null);
    setAiSyncOpen(false);
    toast.info('Sync draft discarded.', 'Your lyrics and timeline are unchanged.');
  };

  const handleApplyAiSync = () => {
    const draft = aiSyncDraft;
    if (!draft) return;
    if (!draft.validation.valid) {
      toast.error(
        'Sync result is invalid.',
        draft.validation.errors[0]?.message ??
          'Validation failed — review the errors before applying.'
      );
      return;
    }

    // Forced alignment is a SOURCE-level operation: it rewrites the original
    // cues with real word timings, so any derived processed result is dropped.
    setOriginalLines(draft.lines);
    setProcessedLines([]);
    setViewMode('original');
    setSelectedLineId(draft.lines[0]?.id ?? null);
    setTrack((prev) => ({ ...prev, timingSource: 'SOURCE_AUDIO_ALIGNMENT' }));

    const lowCount = draft.stats.needsReviewLineCount;
    if (lowCount > 0) {
      toast.warning(
        'Sync applied (with low-confidence lines).',
        `${lowCount} line(s) had weak vocal matches and were interpolated — review them on the timeline. Avg confidence ${Math.round(
          draft.overallConfidence * 100
        )}%.`
      );
    } else {
      toast.success(
        'Sync applied.',
        `Aligned ${draft.lines.length} lines from ${draft.stats.recognizedWordCount} recognised words. Use Global Shift to fine-tune audio latency if needed.`
      );
    }
    setAiSyncDraft(null);
    setAiSyncOpen(false);
  };

  const handleStartAiSync = async (config: AiSyncRunConfig) => {
    if (!audioState.audioBuffer) {
      setAiSyncError('Audio is no longer available. Re-link the audio file.');
      return;
    }

    const controller = new AbortController();
    aiSyncAbortRef.current = controller;
    setAiSyncRunning(true);
    setAiSyncError(null);
    setAiSyncDraft(null);
    setAiSyncPercent(0);
    setAiSyncStage('Preparing audio (16kHz)...');

    try {
      const draft = await runForcedAlignment({
        lines: originalLines,
        audioBuffer: audioState.audioBuffer,
        audioFile: audioState.audioFile ?? null,
        fileName: audioState.fileName ?? undefined,
        engine: config.engine,
        apiProvider: config.apiProvider,
        apiKey: config.apiKey,
        language: config.language || undefined,
        signal: controller.signal,
        onProgress: (p) => {
          setAiSyncPercent(p.percent);
          setAiSyncStage(p.message);
        },
      });

      // PRD §18: never overwrite the timeline directly — park the result as a
      // draft and let the user review and apply it.
      setAiSyncRunning(false);
      setAiSyncDraft(draft);
    } catch (err) {
      setAiSyncRunning(false);
      if (err instanceof DOMException && err.name === 'AbortError') {
        setAiSyncStage('');
        setAiSyncPercent(0);
        toast.info('AI Auto Sync cancelled.', 'No changes were made to your lyrics.');
        setAiSyncOpen(false);
        return;
      }
      setAiSyncError(errMessage(err, 'AI Auto Sync failed.'));
    } finally {
      aiSyncAbortRef.current = null;
    }
  };

  // ─── AUTO ARRANGE ACTIONS ──────────────────────────────────────────────────

  /**
   * [Apply to All] — regenerates processedLines from the untouched originalLines.
   *
   * Manual edits made to processedLines DO NOT survive this: the processed list
   * is derived output and re-running the stage is a full overwrite. The user is
   * warned first whenever a processed result already exists, so the loss is
   * never silent.
   */
  const applyProcessed = (result: ReturnType<typeof autoArrange>) => {
    setProcessedLines(result.processedLines);
    setArrangeLog(result.log.map((e) => e.message));
    setViewMode(result.processedLines.length > 0 ? 'processed' : 'original');
    setSelectedLineId(result.processedLines[0]?.id ?? originalLines[0]?.id ?? null);
  };

  const confirmOverwrite = (): Promise<boolean> => {
    if (processedLines.length === 0) return Promise.resolve(true);
    return confirmDialog({
      title: 'Regenerate processed cues?',
      message:
        'Re-running Auto Arrange regenerates every processed cue. Any manual edits you made to the ' +
        'processed list (nudges, splits, merges, text changes) will be discarded. Your original LRC is never affected.',
      confirmLabel: 'Regenerate',
      danger: true,
    });
  };

  const handleApplyAutoArrange = async () => {
    if (arrangeSettings.mode === 'audio-sync') {
      void handleApplyAudioSync();
      return;
    }
    if (!(await confirmOverwrite())) return;
    applyProcessed(autoArrange(originalLines, arrangeSettings));
  };

  /**
   * Audio Sync. Optional and audio-only: Smart Split remains fully functional
   * with no audio loaded. Falls back to the plain Smart Split result whenever
   * the model cannot be loaded or the audio is unavailable.
   */
  const handleApplyAudioSync = async () => {
    if (!audioState.audioBuffer) {
      setAudioSyncError('Audio Sync needs an audio file. Load one to enable it.');
      return;
    }
    if (!(await confirmOverwrite())) return;

    setIsAudioSyncLoading(true);
    setAudioSyncError(null);
    setAudioSyncProgress(0);

    const controller = new AbortController();
    try {
      const { words } = await runAudioSync({
        lines: originalLines,
        audioBuffer: audioState.audioBuffer,
        signal: controller.signal,
        onProgress: (p) => setAudioSyncProgress(p.progress),
      });

      // Same Smart Split segmentation, but the cue boundaries are placed on the
      // real measured word timings.
      applyProcessed(autoArrange(originalLines, arrangeSettings, { alignment: words }));
    } catch (err) {
      setAudioSyncError(errMessage(err, 'Audio Sync failed.'));
      // Fall back so the user still gets a usable processed result.
      applyProcessed(autoArrange(originalLines, { ...arrangeSettings, mode: 'smart-split' }));
    } finally {
      setIsAudioSyncLoading(false);
    }
  };

  /**
   * [Reset to Original] — restores instantly and discards the processed list.
   * originalLines is never touched, so this is always lossless.
   */
  const handleResetToOriginal = () => {
    setProcessedLines([]);
    setArrangeLog([]);
    setViewMode('original');
    setSelectedLineId(originalLines[0]?.id ?? null);
  };

  // Timeline Handlers
  //
  // Manual edits write back to whichever list is currently authoritative. In
  // Processed mode that is processedLines (and the result survives re-renders
  // because the edit is applied to state, not to a derived value). In Original
  // mode the edit is a genuine source edit and updates originalLines.
  const applyToActive = useCallback(
    (updater: (prev: LyricLine[]) => LyricLine[]) => {
      if (viewMode === 'processed' && processedLines.length > 0) {
        setProcessedLines((prev) => updater(prev));
      } else {
        setOriginalLines((prev) => updater(prev));
      }
    },
    [viewMode, processedLines.length]
  );

  const handleNudgeLine = (lineId: string, deltaMs: number) => {
    applyToActive((prev) => nudgeLine(prev, lineId, deltaMs));
  };

  const handleSplitLine = (lineId: string) => {
    applyToActive((prev) => splitLine(prev, lineId));
  };

  const handleMergeWithNext = (lineId: string) => {
    applyToActive((prev) => {
      const idx = prev.findIndex((l) => l.id === lineId);
      if (idx >= 0 && idx < prev.length - 1) {
        return mergeLines(prev, lineId, prev[idx + 1].id);
      }
      return prev;
    });
  };

  const handleUpdateLineTiming = (lineId: string, start: number, end: number) => {
    applyToActive((prev) => updateLineTiming(prev, lineId, start, end));
  };

  const handleUpdateLineText = (lineId: string, text: string) => {
    applyToActive((prev) =>
      prev.map((l) =>
        l.id === lineId
          ? { ...l, text: text.trim(), generatedBy: l.generatedBy ?? 'original' }
          : l
      )
    );
  };

  // Global Offset (e.g. +100ms, -250ms across every timed line)
  const handleApplyGlobalOffset = (deltaMs: number) => {
    const deltaSec = deltaMs / 1000;
    applyToActive((prev) =>
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
      // Serialize BOTH lists plus the Auto Arrange state. `lines` mirrors
      // originalLines so files stay readable by older builds.
      const project: ProjectState = {
        version: 1,
        id: `proj-${Date.now()}`,
        name: track.title || 'Untitled Project',
        updatedAt: new Date().toISOString(),
        track,
        originalLines,
        processedLines,
        arrangeSettings,
        viewMode,
        lines: originalLines,
        style,
        exportSettings,
        timingSource: track.timingSource,
        maxHoldDurationSec: 4.5,
        motionLayers,
      };

    const json = exportProjectToJson(project);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(track.title || 'project').toLowerCase().replace(/\s+/g, '-')}-project.json`;
    a.click();
    URL.revokeObjectURL(url);

    // Mark the current content as the saved baseline (PRD 18).
    setLastSavedHash(currentProjectHash);
    toast.success('Project saved.', `${track.title || 'Untitled'} exported. Audio is not embedded — re-link it on load.`);
  };

  const handleLoadProject = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          const parsed = parseJsonLyrics(content);
          if (parsed.project) {
            // parseJsonLyrics migrates old files: `lines` becomes originalLines
            // and the processed list is derived when the file lacks one.
            const p = parsed.project;
            setOriginalLines(p.originalLines);
            setProcessedLines(p.processedLines ?? []);
            setArrangeSettings(p.arrangeSettings ?? DEFAULT_ARRANGE_SETTINGS);
            setViewMode(p.viewMode ?? 'original');
            setTrack(p.track);
            setStyle(p.style);
            setExportSettings(p.exportSettings);
            if (p.motionLayers) {
              setMotionLayers(p.motionLayers);
            }
            // Runtime audio is never embedded (PRD 17): clear it and tell the
            // user which file to re-link rather than pretending it is present.
            setAudioState({
              enabled: false,
              source: 'NONE',
              fileName: null,
              duration: null,
              audioBlobUrl: null,
              audioBuffer: null,
              peaks: [],
            });
            setIsPlaying(false);
            // The freshly loaded content is the saved baseline (not dirty).
            setLastSavedHash(
              hashProject({
                track: p.track,
                originalLines: p.originalLines,
                processedLines: p.processedLines ?? [],
                viewMode: p.viewMode ?? 'original',
                arrangeSettings: p.arrangeSettings ?? DEFAULT_ARRANGE_SETTINGS,
                style: p.style,
                exportSettings: p.exportSettings,
                motionLayers: p.motionLayers,
              })
            );
            if (p.track?.audioSource === 'USER_UPLOAD') {
              toast.warning('Project loaded — audio must be re-linked.', 'Audio is not stored in the project file. Re-import your audio to preview and export with sound.');
            } else {
              toast.success('Project loaded.', p.name || p.track?.title || 'Untitled');
            }
          } else {
            handleLyricsLoaded(parsed.lines, parsed.track);
          }
        } catch (err) {
          toast.error('Failed to load project.', errMessage(err, 'The file could not be parsed.'));
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const resetToNewProject = () => {
    setOriginalLines([]);
    setProcessedLines([]);
    setArrangeLog([]);
    setViewMode('original');
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
  };

  const handleNewProject = () => {
    // No unsaved work → just start fresh (PRD 18: no native confirm).
    if (!isDirty) {
      resetToNewProject();
      return;
    }
    // Unsaved changes → offer Save / Discard / Cancel.
    setDialogState({
      open: true,
      title: 'Unsaved changes',
      message:
        'You have unsaved changes. Save your project before starting a new one, or discard them to continue.',
      onDismiss: () => setDialogState(null),
      actions: [
        { label: 'Cancel', variant: 'secondary', onClick: () => setDialogState(null) },
        {
          label: 'Discard',
          variant: 'danger',
          onClick: () => {
            setDialogState(null);
            resetToNewProject();
          },
        },
        {
          label: 'Save',
          variant: 'primary',
          onClick: () => {
            setDialogState(null);
            handleSaveProject();
            resetToNewProject();
          },
        },
      ],
    });
  };

  return (
    <div className="app-container">
      {/* Non-blocking notifications and the app confirm dialog (PRD 18/19). */}
      <ToastHost />
      {dialogState && <ConfirmDialog {...dialogState} />}
      <AiSyncModal
        open={aiSyncOpen}
        running={aiSyncRunning}
        percent={aiSyncPercent}
        stage={aiSyncStage}
        error={aiSyncError}
        draft={aiSyncDraft}
        lineCount={originalLines.length}
        hasAudioFile={!!audioState.audioFile}
        onStart={handleStartAiSync}
        onCancel={handleCancelAiSync}
        onApply={handleApplyAiSync}
        onDiscard={handleDiscardAiSync}
        onClose={handleCloseAiSync}
      />

      {/* The single authoritative audio element (PRD Section 5). Owned here so
          one clock drives every preview surface; individual pages no longer
          create their own <audio> tags. */}
      {audioState.audioBlobUrl && (
        <audio
          ref={audioElRef}
          src={audioState.audioBlobUrl}
          muted={isMuted}
          onEnded={() => setIsPlaying(false)}
          style={{ display: 'none' }}
        />
      )}

      {/* Persistent Minimal Editorial Navigation */}
      <Navigation
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        trackTitle={track.title}
        artistName={track.artist}
        timingSource={track.timingSource}
        validation={validation}
        hasAudio={!!audioState.audioBlobUrl}
        saveStatus={saveStatus}
        onSaveProject={handleSaveProject}
        onLoadProject={handleLoadProject}
      />

      {/* Main Product Area Viewport */}
      <main className="main-viewport-content">
        {activeTab === 'projects' && (
          <ProjectsPage
            track={track}
            lines={activeLines}
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
            lines={activeLines}
            track={track}
            timingSource={track.timingSource}
            audioFileName={audioState.fileName}
            audioDuration={audioState.duration}
            isAligning={isAligning}
            originalLines={originalLines}
            processedLines={processedLines}
            arrangeSettings={arrangeSettings}
            viewMode={viewMode}
            arrangeLog={arrangeLog}
            isAudioSyncLoading={isAudioSyncLoading}
            audioSyncProgress={audioSyncProgress}
            audioSyncError={audioSyncError}
            onArrangeSettingsChange={setArrangeSettings}
            onApplyAutoArrange={handleApplyAutoArrange}
            onResetToOriginal={handleResetToOriginal}
            onViewModeChange={setViewMode}
            selectedLineId={selectedLineId}
            currentTime={currentTime}
            validation={validation}
            onSelectLine={(id) => setSelectedLineId(id)}
            onSeek={(t) => seek(t)}
            onLyricsLoaded={handleLyricsLoaded}
            onAudioFileSelected={handleAudioFileSelected}
            onRunAudioAlignment={handleRunAudioAlignment}
            onOpenAiSync={handleOpenAiSync}
            aiSyncRunning={aiSyncRunning}
            onNudgeLine={handleNudgeLine}
            onSplitLine={handleSplitLine}
            onMergeWithNext={handleMergeWithNext}
            onUpdateLineText={handleUpdateLineText}
            onApplyGlobalOffset={handleApplyGlobalOffset}
          />
        )}

        {activeTab === 'timeline' && (
          <TimelinePage
            lines={activeLines}
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
              seek(resolvedOutputRange.startTime);
              setIsPlaying(false);
            }}
            onSelectLine={(id) => setSelectedLineId(id)}
            onSeek={(t) => seek(t)}
            onUpdateLineTiming={handleUpdateLineTiming}
            onNudgeLine={handleNudgeLine}
            onSplitLine={handleSplitLine}
            onMergeWithNext={handleMergeWithNext}
            onApplyGlobalOffset={handleApplyGlobalOffset}
          />
        )}

        {activeTab === 'design' && (
          <DesignPage
            lines={activeLines}
            style={style}
            visualBlocks={visualBlocks}
            currentTime={currentTime}
            totalDuration={totalDuration}
            isPlaying={isPlaying}
            audioBlobUrl={audioState.audioBlobUrl}
            trackTitle={track.title}
            artistName={track.artist}
            validation={validation}
            motionLayers={motionLayers}
            playbackSpeed={playbackSpeed}
            isMuted={isMuted}
            onSpeedChange={setPlaybackSpeed}
            onToggleMute={() => setIsMuted((m) => !m)}
            onUpdateStyle={(newS) => setStyle((prev) => ({ ...prev, ...newS }))}
            onUpdateMotionLayers={(ml) => setMotionLayers((prev) => ({ ...prev, ...ml }))}
            onApplyPreset={(pName) => {
              if (STYLE_PRESETS[pName]) {
                setStyle(STYLE_PRESETS[pName]);
              }
            }}
            onTimeUpdate={(t) => seek(t)}
            onPlayPause={() => setIsPlaying(!isPlaying)}
            onRestart={() => {
              seek(resolvedOutputRange.startTime);
              setIsPlaying(false);
            }}
            onPrevLine={handlePrevLine}
            onNextLine={handleNextLine}
          />
        )}

        {activeTab === 'preview' && (
          <PreviewPage
            lines={activeLines}
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
            motionLayers={motionLayers}
            playbackSpeed={playbackSpeed}
            isMuted={isMuted}
            onSpeedChange={setPlaybackSpeed}
            onToggleMute={() => setIsMuted((m) => !m)}
            onUpdateExportSettings={(s) => setExportSettings((prev) => ({ ...prev, ...s }))}
            onTimeUpdate={(t) => seek(t)}
            onPlayPause={() => setIsPlaying(!isPlaying)}
            onRestart={() => {
              seek(resolvedOutputRange.startTime);
              setIsPlaying(false);
            }}
            onPrevLine={handlePrevLine}
            onNextLine={handleNextLine}
            onNavigateTab={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'export' && (
          <ExportPage
            lines={activeLines}
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
