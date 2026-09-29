import { describe, it, expect } from 'vitest';
import { parseSrt, parseSrtTimestampToMs, SrtParseError } from '../lyrics/srt-parser';
import { serializeToSrt } from '../lyrics/srt-serializer';
import { serializeToLrc } from '../lyrics/lrc-serializer';
import { importLyricsFile, describeImportError } from '../lyrics/lyric-import';
import {
  formatTimelineTime,
  formatDurationSeconds,
  detectLyricFormat,
  describeSourceFormat,
  resolveSourceFormat,
  formatSrtTimestamp,
} from '../lyrics/lyric-format';
import { smartSplitLyrics, DEFAULT_SMART_SPLIT_SETTINGS } from '../lyrics/smart-split';
import { DEMO_SRT } from '../data/demo-tracks';

describe('SRT SUPPORT — Full Test Suite', () => {
  // ==========================================================================
  // Section 13: Regression Testing with Provided Example
  // ==========================================================================
  describe('13. REGRESSION TESTING — Provided Example File', () => {
    it('parses the provided 6-block SRT example with exact timing and text', () => {
      const result = parseSrt(DEMO_SRT);
      expect(result.lines).toHaveLength(6);

      // Cue 1: 00:00:01,006 --> 00:00:03,004
      expect(result.lines[0].startTime).toBe(1.006);
      expect(result.lines[0].endTime).toBe(3.004);
      expect(result.lines[0].text).toBe('You need a woman holding you down');
      expect(result.lines[0].originalIndex).toBe(1);
      expect(result.lines[0].sourceFormat).toBe('srt');
      expect(result.timingsMs[0]).toEqual({ startMs: 1006, endMs: 3004 });

      // Cue 2: 00:00:03,102 --> 00:00:05,002
      expect(result.lines[1].startTime).toBe(3.102);
      expect(result.lines[1].endTime).toBe(5.002);
      expect(result.lines[1].text).toBe('Whenever, wherever, however, whatever');
      expect(result.lines[1].originalIndex).toBe(2);
      expect(result.lines[1].sourceFormat).toBe('srt');
      expect(result.timingsMs[1]).toEqual({ startMs: 3102, endMs: 5002 });

      // Cue 3: 00:00:05,100 --> 00:00:08,006
      expect(result.lines[2].startTime).toBe(5.1);
      expect(result.lines[2].endTime).toBe(8.006);
      expect(result.lines[2].text).toBe("I'll be right by your side");
      expect(result.lines[2].originalIndex).toBe(3);
      expect(result.lines[2].sourceFormat).toBe('srt');
      expect(result.timingsMs[2]).toEqual({ startMs: 5100, endMs: 8006 });

      // Cue 4: 00:00:08,104 --> 00:00:10,996
      expect(result.lines[3].startTime).toBe(8.104);
      expect(result.lines[3].endTime).toBe(10.996);
      expect(result.lines[3].text).toBe("See, I just wanna love you, boy, if you don't mind");
      expect(result.lines[3].originalIndex).toBe(4);
      expect(result.lines[3].sourceFormat).toBe('srt');
      expect(result.timingsMs[3]).toEqual({ startMs: 8104, endMs: 10996 });

      // Cue 5: 00:00:11,094 --> 00:00:14,000
      expect(result.lines[4].startTime).toBe(11.094);
      expect(result.lines[4].endTime).toBe(14.0);
      expect(result.lines[4].text).toBe("Let's kick in this little game of mine");
      expect(result.lines[4].originalIndex).toBe(5);
      expect(result.lines[4].sourceFormat).toBe('srt');
      expect(result.timingsMs[4]).toEqual({ startMs: 11094, endMs: 14000 });

      // Cue 6: 00:00:14,097 --> 00:00:15,006
      expect(result.lines[5].startTime).toBe(14.097);
      expect(result.lines[5].endTime).toBe(15.006);
      expect(result.lines[5].text).toBe('And he said');
      expect(result.lines[5].originalIndex).toBe(6);
      expect(result.lines[5].sourceFormat).toBe('srt');
      expect(result.timingsMs[5]).toEqual({ startMs: 14097, endMs: 15006 });
    });
  });

  // ==========================================================================
  // Section 7: Millisecond Precision Timestamp Conversion
  // ==========================================================================
  describe('7. TIMESTAMP CONVERSION', () => {
    it('converts HH:MM:SS,mmm to exact milliseconds without rounding', () => {
      const res1 = parseSrtTimestampToMs('00:00:01,006');
      expect(res1.ok).toBe(true);
      if (res1.ok) expect(res1.ms).toBe(1006);

      const res2 = parseSrtTimestampToMs('00:00:03,004');
      expect(res2.ok).toBe(true);
      if (res2.ok) expect(res2.ms).toBe(3004);

      const res3 = parseSrtTimestampToMs('01:23:45,678');
      expect(res3.ok).toBe(true);
      if (res3.ok) expect(res3.ms).toBe(1 * 3600000 + 23 * 60000 + 45 * 1000 + 678);
    });

    it('formats timestamps back to SRT format with millisecond precision', () => {
      expect(formatSrtTimestamp(1.006)).toBe('00:00:01,006');
      expect(formatSrtTimestamp(3.004)).toBe('00:00:03,004');
      expect(formatSrtTimestamp(83.102)).toBe('00:01:23,102');
    });
  });

  // ==========================================================================
  // Section 8: Timeline Display & Formatting Utilities
  // ==========================================================================
  describe('8. TIMELINE DISPLAY', () => {
    it('formats time range with millisecond precision for SRT', () => {
      expect(formatTimelineTime(1.006, 'srt')).toBe('00:01.006');
      expect(formatTimelineTime(3.004, 'srt')).toBe('00:03.004');
      expect(formatTimelineTime(65.123, 'srt')).toBe('01:05.123');
    });

    it('formats time range with centiseconds for LRC', () => {
      expect(formatTimelineTime(2.1, 'lrc')).toBe('00:02.10');
      expect(formatTimelineTime(65.5, 'lrc')).toBe('01:05.50');
    });

    it('formats duration with 3 decimals for SRT and 2 decimals for LRC', () => {
      const duration = 3.004 - 1.006; // 1.998s
      expect(formatDurationSeconds(duration, 'srt')).toBe('1.998s');
      expect(formatDurationSeconds(duration, 'lrc')).toBe('2.00s');
    });
  });

  // ==========================================================================
  // Section 6: SRT Validation & Error Handling
  // ==========================================================================
  describe('6. SRT VALIDATION', () => {
    it('rejects an empty file with a clear message', () => {
      expect(() => parseSrt('')).toThrow(SrtParseError);
      expect(() => parseSrt('   \n\n  ')).toThrow(/empty/i);
    });

    it('detects missing arrow and provides block number in error', () => {
      const srt = `1
00:00:01,006 00:00:03,004
Missing arrow text`;
      expect(() => parseSrt(srt)).toThrow(SrtParseError);
      try {
        parseSrt(srt);
      } catch (err: any) {
        expect(err.message).toContain('Block 1');
        expect(err.message).toContain('missing the timecode arrow');
      }
    });

    it('detects invalid timestamp minutes/seconds', () => {
      const srt = `1
00:99:01,006 --> 00:00:03,004
Bad minutes`;
      expect(() => parseSrt(srt)).toThrow(SrtParseError);
      try {
        parseSrt(srt);
      } catch (err: any) {
        expect(err.message).toContain('Block 1 contains an invalid timestamp');
      }
    });

    it('detects invalid timestamp separator', () => {
      const srt = `1
00:00:01;006 --> 00:00:03;004
Bad separator`;
      expect(() => parseSrt(srt)).toThrow(SrtParseError);
      try {
        parseSrt(srt);
      } catch (err: any) {
        expect(err.message).toContain('Block 1 contains an invalid timestamp separator');
      }
    });

    it('detects end time before start time', () => {
      const srt = `1
00:00:05,000 --> 00:00:02,000
Backward timing`;
      expect(() => parseSrt(srt)).toThrow(SrtParseError);
      try {
        parseSrt(srt);
      } catch (err: any) {
        expect(err.message).toContain('Block 1 has an end time before its start time');
      }
    });

    it('detects missing text in a subtitle block', () => {
      const srt = `1
00:00:01,000 --> 00:00:03,000

`;
      expect(() => parseSrt(srt)).toThrow(SrtParseError);
      try {
        parseSrt(srt);
      } catch (err: any) {
        expect(err.message).toContain('Block 1 contains no lyric text');
      }
    });

    it('reports multiple offending blocks in one error', () => {
      const srt = `1
00:99:01,000 --> 00:00:03,000
Bad timestamp

2
00:00:05,000 --> 00:00:02,000
Backwards`;
      try {
        parseSrt(srt);
        expect.unreachable('Should have thrown SrtParseError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(SrtParseError);
        expect(err.blockErrors).toHaveLength(2);
        expect(err.message).toContain('Block 1');
        expect(err.message).toContain('Block 2');
      }
    });

    it('describes import errors gracefully without crashing', () => {
      const err = new SrtParseError([{ block: 7, message: 'Block 7 contains an invalid timestamp.' }]);
      const msg = describeImportError(err, 'song.srt');
      expect(msg).toContain('SRT Import Error');
      expect(msg).toContain('Block 7 contains an invalid timestamp.');

      const generic = describeImportError(new Error('Corrupt file'), 'broken.srt');
      expect(generic).toBe('Corrupt file');

      const nonError = describeImportError('random string', 'broken.srt');
      expect(nonError).toContain('broken.srt');
    });
  });

  // ==========================================================================
  // Section 3 & 11: Multi-line SRT & Edge Cases
  // ==========================================================================
  describe('3 & 11. MULTI-LINE SRT & EDGE CASES', () => {
    it('handles multiline subtitle text while preserving original text', () => {
      const srt = `1
00:00:01,006 --> 00:00:03,004
You need a woman
holding you down`;
      const result = parseSrt(srt);
      expect(result.lines).toHaveLength(1);
      const line = result.lines[0];
      expect(line.text).toBe('You need a woman holding you down');
      expect(line.originalText).toBe('You need a woman\nholding you down');
      expect(line.visualLines).toEqual(['You need a woman', 'holding you down']);
    });

    it('handles missing index without crashing, logging a warning', () => {
      const srt = `00:00:01,006 --> 00:00:03,004
No index cue`;
      const result = parseSrt(srt);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].text).toBe('No index cue');
      expect(result.warnings.some((w) => w.message.includes('missing its subtitle index'))).toBe(true);
    });

    it('handles duplicate indices without timing collision', () => {
      const srt = `1
00:00:01,000 --> 00:00:02,000
First cue

1
00:00:02,100 --> 00:00:03,100
Second cue with same index`;
      const result = parseSrt(srt);
      expect(result.lines).toHaveLength(2);
      expect(result.lines[0].startTime).toBe(1.0);
      expect(result.lines[1].startTime).toBe(2.1);
    });

    it('strips HTML styling tags from visible text and preserves in originalText', () => {
      const srt = `1
00:00:01,000 --> 00:00:03,000
<i>You need</i> a <b>woman</b> <font color="#ff0000">holding</font> you down`;
      const result = parseSrt(srt);
      expect(result.lines[0].text).toBe('You need a woman holding you down');
      expect(result.lines[0].originalText).toContain('<i>You need</i>');
      expect(result.warnings.some((w) => w.message.includes('inline styling tags'))).toBe(true);
    });

    it('handles Windows CRLF and trailing whitespace', () => {
      const srt = "1\r\n00:00:01,006 --> 00:00:03,004   \r\nHello world   \r\n\r\n";
      const result = parseSrt(srt);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].text).toBe('Hello world');
      expect(result.lines[0].startTime).toBe(1.006);
    });

    it('handles UTF-8 accented characters and apostrophes', () => {
      const srt = `1
00:00:01,000 --> 00:00:03,000
Café naïve, don't let's go!`;
      const result = parseSrt(srt);
      expect(result.lines[0].text).toBe("Café naïve, don't let's go!");
    });
  });

  // ==========================================================================
  // Section 2 & 9: Normalized Format & Source Provenance
  // ==========================================================================
  describe('2 & 9. NORMALIZED FORMAT & SOURCE AWARENESS', () => {
    it('populates normalized LyricLine fields identically for both LRC and SRT', () => {
      const srtResult = importLyricsFile(DEMO_SRT, 'test.srt');
      expect(srtResult.sourceFormat).toBe('srt');
      expect(srtResult.timingSource).toBe('SOURCE_SRT');
      expect(srtResult.lines[0]).toMatchObject({
        sourceFormat: 'srt',
        originalIndex: 1,
        source: 'SOURCE_SRT',
      });
      expect(typeof srtResult.lines[0].startTime).toBe('number');
      expect(typeof srtResult.lines[0].endTime).toBe('number');
    });

    it('auto-detects formats from file extension', () => {
      expect(detectLyricFormat('song.srt')).toBe('srt');
      expect(detectLyricFormat('song.lrc')).toBe('lrc');
      expect(detectLyricFormat('song.json')).toBe('json');
      expect(detectLyricFormat('song.txt')).toBe('txt');
    });

    it('describes source format properly', () => {
      expect(describeSourceFormat('srt')).toBe('Format: SRT');
      expect(describeSourceFormat('lrc')).toBe('Format: LRC');
      expect(describeSourceFormat(undefined)).toBe('Format: Unknown');
    });
  });

  // ==========================================================================
  // Section 4: Smart Split Compatibility
  // ==========================================================================
  describe('4. SMART SPLIT COMPATIBILITY', () => {
    it('splits a long SRT cue into multiple cues while preserving sourceFormat and timing recovery', () => {
      const srt = `1
00:00:01,006 --> 00:00:06,004
You need a woman holding you down whenever, wherever, however, whatever`;
      const parsed = parseSrt(srt);
      const { lines: processed } = smartSplitLyrics(parsed.lines, DEFAULT_SMART_SPLIT_SETTINGS);

      expect(processed.length).toBeGreaterThanOrEqual(2);
      expect(processed[0].startTime).toBe(1.006);
      expect(processed[processed.length - 1].endTime).toBe(6.004);

      // Provenance preserved on generated cues
      for (const cue of processed) {
        expect(cue.sourceFormat).toBe('srt');
        expect(cue.sourceLineId).toBe(parsed.lines[0].id);
        expect(cue.generatedBy).toBe('smart-split');
      }

      expect(resolveSourceFormat(processed)).toBe('srt');
    });
  });

  // ==========================================================================
  // Section 10: Export / Conversion
  // ==========================================================================
  describe('10. EXPORT / CONVERSION', () => {
    it('exports processed lyrics to valid SRT with sequential numbering starting from 1', () => {
      const parsed = parseSrt(DEMO_SRT);
      const exported = serializeToSrt(parsed.lines);

      expect(exported).toContain('1\n00:00:01,006 --> 00:00:03,004\nYou need a woman holding you down');
      expect(exported).toContain('2\n00:00:03,102 --> 00:00:05,002\nWhenever, wherever, however, whatever');
      expect(exported).toContain('6\n00:00:14,097 --> 00:00:15,006\nAnd he said');

      // Round-trip parse of the exported SRT
      const roundTrip = parseSrt(exported);
      expect(roundTrip.lines).toHaveLength(6);
      expect(roundTrip.lines[0].startTime).toBe(1.006);
      expect(roundTrip.lines[0].endTime).toBe(3.004);
    });

    it('exports Smart Split generated cues as individual SRT blocks with 1-based sequential indices', () => {
      const srt = `1
00:00:01,006 --> 00:00:06,004
You need a woman holding you down whenever, wherever, however, whatever`;
      const parsed = parseSrt(srt);
      const { lines: splitLines } = smartSplitLyrics(parsed.lines, DEFAULT_SMART_SPLIT_SETTINGS);

      const exported = serializeToSrt(splitLines);
      expect(exported.startsWith('1\n')).toBe(true);
      expect(exported).toContain('2\n');

      const reParsed = parseSrt(exported);
      expect(reParsed.lines.length).toBe(splitLines.length);
      expect(reParsed.lines[0].startTime).toBe(splitLines[0].startTime);
    });

    it('exports SRT-parsed lines to valid LRC format', () => {
      const parsed = parseSrt(DEMO_SRT);
      const exportedLrc = serializeToLrc(parsed.lines, { title: 'Hold You Down' });

      expect(exportedLrc).toContain('[ti:Hold You Down]');
      expect(exportedLrc).toContain('[00:01.00]');
      expect(exportedLrc).toContain('You need a woman holding you down');
    });
  });
});
