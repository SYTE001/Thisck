import type { LyricLine, TrackMetadata } from '../../types/lyrics';
import type { ProjectState } from '../../types/project';

export function parseJsonLyrics(content: string): {
  lines: LyricLine[];
  track?: Partial<TrackMetadata>;
  project?: ProjectState;
} {
  const data = JSON.parse(content);

  // Case 1: Full serialized ProjectState
  if (data.version && data.lines && Array.isArray(data.lines)) {
    return {
      lines: data.lines,
      track: data.track,
      project: data as ProjectState,
    };
  }

  // Case 2: Simple JSON format { title, artist, lines: [{ text, start, end }] }
  if (Array.isArray(data.lines)) {
    const lines: LyricLine[] = data.lines.map((item: any, i: number) => ({
      id: item.id || `json-line-${i + 1}`,
      text: String(item.text || ''),
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
