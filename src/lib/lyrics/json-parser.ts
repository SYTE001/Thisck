import type { LyricLine, TrackMetadata } from '../../types/lyrics';
import type { ProjectState } from '../../types/project';
import {
  DEFAULT_ARRANGE_SETTINGS,
  autoArrange,
  type ArrangeSettings,
  type LyricsViewMode,
} from './auto-arrange';

/**
 * Migrates a raw parsed project object into a fully-formed ProjectState.
 *
 * BACKWARD COMPATIBILITY: project files written before Auto Arrange have no
 * `originalLines`, `processedLines`, `arrangeSettings` or `viewMode`. Those files
 * carry their data in `lines`, which becomes `originalLines`; the processed list
 * is then derived from it so the project opens in a working state.
 */
export function migrateProject(data: any): ProjectState {
  const originalLines: LyricLine[] = Array.isArray(data.originalLines)
    ? data.originalLines
    : Array.isArray(data.lines)
      ? data.lines
      : [];

  const arrangeSettings: ArrangeSettings = {
    ...DEFAULT_ARRANGE_SETTINGS,
    ...(data.arrangeSettings ?? {}),
  };

  const viewMode: LyricsViewMode =
    data.viewMode === 'processed' || data.viewMode === 'original' ? data.viewMode : 'original';

  // Only trust a stored processed list if the file actually carried one.
  const storedProcessed: LyricLine[] | null = Array.isArray(data.processedLines)
    ? data.processedLines
    : null;

  const processedLines =
    storedProcessed && storedProcessed.length > 0
      ? storedProcessed
      : autoArrange(originalLines, arrangeSettings).processedLines;

  return {
    ...data,
    version: 1,
    originalLines,
    processedLines,
    arrangeSettings,
    viewMode,
    // `lines` mirrors the original source for older readers of the file.
    lines: originalLines,
  } as ProjectState;
}

export function parseJsonLyrics(content: string): {
  lines: LyricLine[];
  track?: Partial<TrackMetadata>;
  project?: ProjectState;
} {
  const data = JSON.parse(content);

  // Case 1: Full serialized ProjectState (v1, with or without Auto Arrange).
  if (data.version && Array.isArray(data.lines)) {
    const project = migrateProject(data);
    return {
      lines: project.originalLines,
      track: project.track,
      project,
    };
  }

  // Case 2: Simple JSON format { title, artist, lines: [{ text, start, end }] }
  if (Array.isArray(data.lines)) {
    const lines: LyricLine[] = data.lines.map((item: any, i: number) => ({
      id: item.id || `json-line-${i + 1}`,
      text: String(item.text || ''),
      originalText: String(item.text || ''),
      originalIndex: i + 1,
      sourceFormat: item.sourceFormat || 'json',
      startTime: typeof item.start === 'number' ? item.start : (typeof item.startTime === 'number' ? item.startTime : null),
      endTime: typeof item.end === 'number' ? item.end : (typeof item.endTime === 'number' ? item.endTime : null),
      words: item.words,
      source: item.source || (typeof item.start === 'number' ? 'SOURCE_LRC' : 'SOURCE_UNKNOWN'),
      confidence: item.confidence ?? 1.0,
      customStyleSeed: (i * 19) % 100,
    }));

    return {
      lines,
      track: {
        title: data.title || '',
        artist: data.artist || '',
        album: data.album,
      },
    };
  }

  throw new Error('Unrecognized JSON format: Expected a "lines" array or project file structure.');
}

export function exportProjectToJson(project: ProjectState): string {
  return JSON.stringify(project, null, 2);
}
