import type { LyricLine } from '../../types/lyrics';
import { parseLrc } from '../lyrics/lrc-parser';

export interface LyricsSearchResult {
  id: string;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  syncedLyrics?: string;
  plainLyrics?: string;
  provider: string;
}

export interface LyricsSyncProvider {
  name: string;
  search(query: { track: string; artist?: string }): Promise<LyricsSearchResult[]>;
  getSyncedLyrics(resultId: string): Promise<{
    lines: LyricLine[];
    rawLrc: string;
    isEnhanced: boolean;
  }>;
}

/**
 * LRCLIB Provider: Open, free synced lyrics database with exact timestamps.
 * Endpoint: https://lrclib.net/api/search
 */
export class LrclibProvider implements LyricsSyncProvider {
  name = 'LRCLIB (Public Synced Lyrics)';

  async search(query: { track: string; artist?: string }): Promise<LyricsSearchResult[]> {
    const params = new URLSearchParams();
    params.set('track_name', query.track);
    if (query.artist) {
      params.set('artist_name', query.artist);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
      const response = await fetch(`https://lrclib.net/api/search?${params.toString()}`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'LyricsMotionGenerator/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`LRCLIB returned status ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      if (!Array.isArray(data)) return [];

      return data
        .filter((item: any) => item.syncedLyrics || item.plainLyrics)
        .map((item: any) => ({
          id: String(item.id),
          trackName: item.trackName,
          artistName: item.artistName,
          albumName: item.albumName,
          duration: item.duration,
          syncedLyrics: item.syncedLyrics,
          plainLyrics: item.plainLyrics,
          provider: 'LRCLIB',
        }));
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Search request timed out after 7 seconds.');
      }
      throw new Error(`Unable to fetch lyrics from sync provider: ${err.message}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async getSyncedLyrics(resultId: string): Promise<{
    lines: LyricLine[];
    rawLrc: string;
    isEnhanced: boolean;
  }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
      const response = await fetch(`https://lrclib.net/api/get/${encodeURIComponent(resultId)}`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'LyricsMotionGenerator/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`LRCLIB returned status ${response.status}`);
      }

      const item = await response.json();
      if (!item.syncedLyrics) {
        throw new Error('This track does not contain synchronized timestamps on LRCLIB.');
      }

      const parsed = parseLrc(item.syncedLyrics);
      const linesWithSource = parsed.lines.map((l) => ({
        ...l,
        source: 'SOURCE_SYNC_PROVIDER' as const,
      }));

      return {
        lines: linesWithSource,
        rawLrc: item.syncedLyrics,
        isEnhanced: parsed.isEnhanced,
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('Fetch request timed out after 7 seconds.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
