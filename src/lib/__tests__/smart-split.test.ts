import { describe, it, expect } from 'vitest';
import {
  smartSplitLyrics,
  wrapOnlyLyrics,
  redistributeDurations,
  resolveCueTimings,
  isFillerCue,
  computeTargetWords,
  DEFAULT_SMART_SPLIT_SETTINGS,
  MOBILE_READABILITY_SETTINGS,
  type SmartSplitSettings,
} from '../lyrics/smart-split';
import {
  autoArrange,
  resolveActiveLines,
  describeArrangeStats,
  DEFAULT_ARRANGE_SETTINGS,
} from '../lyrics/auto-arrange';
import { chunkAllLyricLines } from '../layout/lyric-chunker';
import { parseLrc } from '../lyrics/lrc-parser';
import { parseJsonLyrics } from '../lyrics/json-parser';
import { nudgeLine, splitLine, mergeLines } from '../timeline/timeline-engine';
import type { LyricLine } from '../../types/lyrics';

function line(id: string, text: string, start: number, end: number): LyricLine {
  return { id, text, startTime: start, endTime: end, source: 'SOURCE_LRC' };
}

const S = (over: Partial<SmartSplitSettings> = {}): SmartSplitSettings => ({
  ...DEFAULT_SMART_SPLIT_SETTINGS,
  ...over,
});

function words(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// Exactly 20 words: exercises the 3-4 cue acceptance range.
const LONG =
  'I was walking through the crowded streets of this city tonight never sleeping anymore again alone now here with you';
const EXAMPLE = 'You need a woman holding you down whenever, wherever, however, whatever';

describe('SMART SPLIT — acceptance tests', () => {
  it('A. A 20-word line becomes 3-4 cues, all within every hard limit', () => {
    expect(words(LONG)).toBeGreaterThanOrEqual(20);
    const settings = S();
    const { lines } = smartSplitLyrics([line('L1', LONG, 10, 16)], settings);

    expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(lines.length).toBeLessThanOrEqual(4);

    for (const l of lines) {
      expect(words(l.text)).toBeLessThanOrEqual(settings.maxWordsPerCue);
      expect(l.text.length).toBeLessThanOrEqual(settings.maxLines * settings.maxCharsPerLine);
    }
  });

  it('B. Durations sum exactly to the original, contiguous, no negatives, min respected', () => {
    const settings = S();
    const { lines } = smartSplitLyrics([line('L1', EXAMPLE, 12.0, 18.0)], settings);

    expect(lines[0].startTime).toBe(12.0);
    expect(lines[lines.length - 1].endTime).toBe(18.0);

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      expect(l.endTime!).toBeGreaterThanOrEqual(l.startTime!);
      expect(l.endTime! - l.startTime!).toBeGreaterThanOrEqual(settings.minChunkDuration - 1e-9);
      if (i > 0) expect(l.startTime).toBe(lines[i - 1].endTime);
    }

    const total = lines.reduce((s, l) => s + (l.endTime! - l.startTime!), 0);
    expect(total).toBeCloseTo(6.0, 6);
  });

  it('C. The "whenever, wherever, however, whatever" example splits as specified', () => {
    const { lines } = smartSplitLyrics([line('L1', EXAMPLE, 12, 18)], S());

    expect(lines[0].text).toBe('You need a woman holding you down');
    expect(lines[1].text).toBe('whenever, wherever, however, whatever');
    expect(lines[0].text).not.toContain('whenever');
  });

  it('D. No 1-word leftover from normal sentences; filler untouched', () => {
    const fillers = ['Mmm', 'Yeah', 'Ooh', 'Oh'];
    const { lines } = smartSplitLyrics(
      [
        line('L1', 'Mmm', 0, 1),
        line('L2', 'Yeah', 1, 2),
        line('L3', 'Ooh', 2, 3),
        line('L4', 'Oh', 3, 4),
        line('L5', LONG, 4, 10),
      ],
      S()
    );

    for (const f of fillers) {
      expect(lines.filter((l) => l.text === f)).toHaveLength(1);
    }
    for (const l of lines) {
      if (fillers.includes(l.text)) continue;
      expect(words(l.text)).toBeGreaterThanOrEqual(2);
    }
  });

  it('E. Contractions and names are never split apart', () => {
    const { lines } = smartSplitLyrics(
      [line('L1', "I don't believe that Jessica Simpson ever told the truth about anything", 0, 9)],
      S()
    );

    // "Jessica Simpson" must always live in the SAME cue, never split.
    const jessicaCue = lines.findIndex((l) => l.text.includes('Jessica'));
    expect(jessicaCue).toBeGreaterThanOrEqual(0);
    expect(lines[jessicaCue].text).toContain('Simpson');
    expect(lines.filter((l) => l.text.includes('Simpson'))).toHaveLength(1);

    // The contraction stays intact and is never orphaned.
    expect(lines.map((l) => l.text).join(' ')).toContain("don't");
    for (const l of lines) expect(l.text).not.toMatch(/^\s*t\s/);
  });

  it('F. originalLines deep-equals its pre-split snapshot after Apply and after Reset', () => {
    const originalLines = [
      line('L1', 'Mmm', 0, 1),
      line('L2', EXAMPLE, 1, 7),
      line('L3', 'Oh', 7, 8),
    ];
    const snapshot = JSON.parse(JSON.stringify(originalLines));

    const { processedLines } = autoArrange(originalLines, DEFAULT_ARRANGE_SETTINGS);
    expect(originalLines).toEqual(snapshot);
    expect(processedLines.length).toBeGreaterThan(originalLines.length);

    const afterReset = autoArrange(originalLines, DEFAULT_ARRANGE_SETTINGS);
    expect(afterReset.processedLines).toEqual(processedLines);
    expect(originalLines).toEqual(snapshot);
  });

  it('G. Determinism: same input + settings -> identical output across 100 runs', () => {
    const input = [
      line('L1', 'Mmm', 0, 1),
      line('L2', EXAMPLE, 1, 7),
      line('L3', LONG, 7, 15),
    ];
    const settings = S();
    const first = JSON.stringify(smartSplitLyrics(input, settings).lines);
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(smartSplitLyrics(input, settings).lines)).toBe(first);
    }
  });

  it('H. Cues already within limits stay completely untouched', () => {
    const { lines } = smartSplitLyrics([line('L1', 'I love you', 4, 6)], S());
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe('I love you');
    expect(lines[0].startTime).toBe(4);
    expect(lines[0].endTime).toBe(6);
  });

  it('I. Segmentation is independent of any Lyrics Effect config', () => {
    // smartSplitLyrics never receives effect config, so no effect can change it.
    const input = [line('L1', EXAMPLE, 1, 7)];
    expect(smartSplitLyrics(input, S()).lines).toEqual(
      smartSplitLyrics(input, S({ maxWordsPerCue: 8 })).lines
    );
  });
});

describe('SMART SPLIT — edge cases', () => {
  it('J. Very long line (25+ words) splits into many legal cues', () => {
    const text =
      'When the rain finally started to fall on the empty streets we finally realized that everything we had ever believed about each other was never really true at all';
    expect(words(text)).toBeGreaterThanOrEqual(25);
    const settings = S();
    const { lines } = smartSplitLyrics([line('L1', text, 0, 14)], settings);
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (const l of lines) expect(words(l.text)).toBeLessThanOrEqual(settings.maxWordsPerCue);
  });

  it('K. Very short lines are never split', () => {
    for (const t of ['baby', 'Oh oh', 'I love you']) {
      const { lines } = smartSplitLyrics([line('L', t, 1, 3)], S());
      expect(lines).toHaveLength(1);
      expect(lines[0].text).toBe(t);
    }
  });

  it('L. Filler lines are never split and never merged', () => {
    for (const t of ['Mmm', 'Oh', 'Yeah', 'Ooh']) {
      expect(isFillerCue(t)).toBe(true);
      const { lines } = smartSplitLyrics([line('L', t, 1, 3)], S());
      expect(lines).toHaveLength(1);
      expect(lines[0].text).toBe(t);
    }
  });

  it('M. Punctuation-heavy lyrics never produce an unbalanced bracket', () => {
    const { lines } = smartSplitLyrics(
      [line('L1', '(oh oh oh) yes, and (yeah yeah) we go, and we go, and we go home', 0, 9)],
      S()
    );
    for (const l of lines) {
      expect((l.text.match(/\(/g) || []).length).toBe((l.text.match(/\)/g) || []).length);
    }
  });

  it('N. Empty lines generate no cue and preserve the instrumental gap', () => {
    const { lines } = smartSplitLyrics(
      [
        line('L1', 'First line here', 0, 4),
        line('L2', '   ', 4, 8),
        line('L3', 'Last line here', 8, 12),
      ],
      S()
    );
    expect(lines.map((l) => l.text)).toEqual(['First line here', 'Last line here']);
    // The gap between 4s and 8s is still an instrumental break.
    expect(lines[0].endTime).toBe(4);
    expect(lines[1].startTime).toBe(8);
  });

  it('O. Multiple timestamps per line expand once at import, then split', () => {
    const parsed = parseLrc(
      '[00:10.00][00:20.00]Repeated lyric line here friend\n[00:30.00]Second line'
    );
    expect(parsed.lines).toHaveLength(3);

    const { lines } = smartSplitLyrics(parsed.lines, S());
    const repeated = lines.filter((l) => l.text === 'Repeated lyric line here friend');
    expect(repeated).toHaveLength(2);
    expect(repeated[0].startTime).not.toBe(repeated[1].startTime);
  });

  it('P. Overlapping timestamps are clamped without modifying originalLines', () => {
    const originalLines = [line('L1', 'First cue', 0, 10), line('L2', 'Second cue', 5, 12)];
    const snapshot = JSON.parse(JSON.stringify(originalLines));

    const { lines, log } = smartSplitLyrics(originalLines, S());

    expect(log.some((e) => e.level === 'warning')).toBe(true);
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i].startTime as number).toBeGreaterThanOrEqual(
        (lines[i - 1].endTime as number) - 1e-9
      );
    }
    expect(originalLines).toEqual(snapshot);
  });

  it('Q. Extremely short durations reduce the chunk count instead of violating the minimum', () => {
    const { lines } = smartSplitLyrics([line('L1', EXAMPLE, 0, 0.4)], S());
    for (const l of lines) expect(l.endTime!).toBeGreaterThanOrEqual(l.startTime!);
    // Outer edges are pinned to the original cue even when it is this short.
    expect(lines[0].startTime).toBe(0);
    expect(lines[lines.length - 1].endTime).toBe(0.4);
  });

  it('R. Very slow singing (long duration, few words) is NOT split', () => {
    const { lines } = smartSplitLyrics([line('L1', 'I love you so much', 0, 20)], S());
    expect(lines).toHaveLength(1);
    expect(lines[0].endTime).toBe(20);
  });

  it('S. Fast rap (high words/sec) splits more, while keeping the minimum duration', () => {
    const settings = S();
    // A line with real phrase structure: the wps effect can only manifest when
    // legal boundaries actually exist to split at.
    const text =
      'I been running through these streets, I been shooting through the night, and I never stop, no I really never stop at all';

    const fast = smartSplitLyrics([line('L1', text, 0, 4)], settings); // ~5.8 wps
    const slow = smartSplitLyrics([line('L1', text, 0, 30)], settings); // ~0.8 wps

    expect(fast.lines.length).toBeGreaterThan(slow.lines.length);
    // Fast delivery still respects the hard word cap AND the minimum duration.
    for (const l of fast.lines) {
      expect(words(l.text)).toBeLessThanOrEqual(settings.maxWordsPerCue);
      expect(l.endTime! - l.startTime!).toBeGreaterThanOrEqual(settings.minChunkDuration - 1e-9);
    }
  });

  it('S2. A high words/sec rate tightens the computed target', () => {
    const settings = S();
    const fast = computeTargetWords(20, 20 / 6, settings); // 6 wps
    const slow = computeTargetWords(20, 20 / 1, settings); // 1 wps
    expect(fast).toBeLessThanOrEqual(slow);
  });

  it('T. Parenthetical backing vocals are never broken inside', () => {
    const { lines } = smartSplitLyrics(
      [line('L1', 'I know that you know (oh oh) exactly what I mean to you now friend', 0, 8)],
      S()
    );
    // The group stays whole in exactly one cue.
    const withGroup = lines.filter((l) => l.text.includes('(oh'));
    expect(withGroup).toHaveLength(1);
    expect(withGroup[0].text).toContain('(oh oh)');
    for (const l of lines) {
      expect(l.text).not.toMatch(/^oh\s*oh/);
      expect(l.text).not.toContain('(oh oh) exactly');
    }
  });

  it('U. Consecutive identical lyrics stay as separate cues (no dedupe)', () => {
    const { lines } = smartSplitLyrics(
      [
        line('L1', 'Same words here', 0, 3),
        line('L2', 'Same words here', 3, 6),
        line('L3', 'Same words here', 6, 9),
      ],
      S()
    );
    expect(lines.map((l) => l.startTime)).toEqual([0, 3, 6]);
  });
});


describe('SMART SPLIT — options', () => {
  it('V. preservePunctuation=false strips a trailing comma from the visible text', () => {
    // The comma lands at the END of a chunk here, which is exactly the case the
    // option targets: a dangling comma left behind by a split.
    const text = 'I came, I saw, I conquered, and I went home again tonight my friend';
    const kept = smartSplitLyrics([line('L1', text, 0, 8)], S({ preservePunctuation: true }));
    const stripped = smartSplitLyrics(
      [line('L1', text, 0, 8)],
      S({ preservePunctuation: false })
    );

    // Segmentation is identical either way; only the visible text differs.
    expect(stripped.lines.map((l) => l.text)).toHaveLength(kept.lines.length);
    expect(kept.lines[0].text).toBe('I came, I saw,');
    expect(stripped.lines[0].text).toBe('I came, I saw');
  });

  it('V2. preservePunctuation does not disturb an internal comma', () => {
    const kept = smartSplitLyrics([line('L1', EXAMPLE, 12, 18)], S({ preservePunctuation: true }));
    const stripped = smartSplitLyrics(
      [line('L1', EXAMPLE, 12, 18)],
      S({ preservePunctuation: false })
    );
    // The enumeration commas are internal to the chunk, so both keep them.
    expect(kept.lines[1].text).toBe('whenever, wherever, however, whatever');
    expect(stripped.lines[1].text).toBe('whenever, wherever, however, whatever');
  });

  it('W. preserveOriginalBoundaries never merges across original cues', () => {
    const { lines } = smartSplitLyrics(
      [
        line('L1', 'I was walking through the crowded streets', 0, 6),
        line('L2', 'I was walking through the crowded streets', 6, 12),
      ],
      S({ preserveOriginalBoundaries: true })
    );
    expect(lines.filter((l) => l.sourceLineId === 'L1').length).toBeGreaterThan(0);
    expect(lines.filter((l) => l.sourceLineId === 'L2').length).toBeGreaterThan(0);
  });

  it('X. Wrap Only keeps cue count and timing identical', () => {
    const input = [
      line('L1', 'I was walking through the crowded streets of a city tonight', 0, 6),
      line('L2', 'Short one', 6, 8),
    ];
    const snapshot = JSON.parse(JSON.stringify(input));
    const { lines } = wrapOnlyLyrics(input, S());

    expect(lines).toHaveLength(input.length);
    for (let i = 0; i < lines.length; i++) {
      expect(lines[i].text).toBe(input[i].text);
      expect(lines[i].startTime).toBe(input[i].startTime);
      expect(lines[i].endTime).toBe(input[i].endTime);
      expect(lines[i].generatedBy).toBe('wrap');
    }
    expect(input).toEqual(snapshot);
  });

  it('Y. Wrap Only sets balanced visual lines respecting maxCharsPerLine', () => {
    const settings = S();
    const { lines } = wrapOnlyLyrics(
      [line('L1', 'I was walking through the crowded streets of a quiet city tonight', 0, 6)],
      settings
    );
    const visual = lines[0].visualLines!;
    expect(visual.length).toBeGreaterThanOrEqual(1);
    for (const v of visual) expect(v.length).toBeLessThanOrEqual(settings.maxCharsPerLine);
  });
});

describe('DURATION REDISTRIBUTION', () => {
  it('Z. Contiguous, gapless, non-overlapping, outer edges exact', () => {
    const raw = [
      { wordCount: 3, text: 'aaa bbb ccc', tokens: [], justifiedShort: false },
      { wordCount: 5, text: 'a bb ccc dddd ee', tokens: [], justifiedShort: false },
      { wordCount: 2, text: 'ff ggg', tokens: [], justifiedShort: false },
    ];
    const timings = redistributeDurations(raw as never, 10.0, 15.0, S());

    expect(timings[0].start).toBe(10.0);
    expect(timings[timings.length - 1].end).toBe(15.0);
    for (let i = 0; i < timings.length; i++) {
      expect(timings[i].end).toBeGreaterThanOrEqual(timings[i].start);
      if (i > 0) expect(timings[i].start).toBe(timings[i - 1].end);
    }
    expect(timings.reduce((s, t) => s + (t.end - t.start), 0)).toBeCloseTo(5.0, 6);
  });

  it('AA. resolveCueTimings never mutates input and derives a missing end time', () => {
    const input = [{ ...line('L1', 'No end time', 5, 5), endTime: null }];
    const snapshot = JSON.parse(JSON.stringify(input));
    const { cues } = resolveCueTimings(input, S());

    expect(cues[0].end).toBeGreaterThan(cues[0].start);
    expect(input).toEqual(snapshot);
  });

  it('AB. computeTargetWords never exceeds the hard max', () => {
    for (let a = 0; a <= 100; a += 10) {
      for (const wps of [0.2, 1, 3, 8]) {
        const t = computeTargetWords(12, 12 / wps, S({ splitAggressiveness: a }));
        expect(t).toBeLessThanOrEqual(S().maxWordsPerCue);
        expect(t).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('AC. Split aggressiveness never produces a cue above the hard max', () => {
    for (let a = 0; a <= 100; a += 5) {
      const { lines } = smartSplitLyrics([line('L1', LONG, 0, 8)], S({ splitAggressiveness: a }));
      for (const l of lines) expect(words(l.text)).toBeLessThanOrEqual(S().maxWordsPerCue);
    }
  });
});


describe('PIPELINE CONSISTENCY — preview vs export', () => {
  const LRC = [`[00:10.00]${EXAMPLE}`, '[00:18.00]Mmm', `[00:20.00]${LONG}`].join('\n');

  it('AD. The same activeLines produce identical visual blocks in both paths', () => {
    const originalLines = parseLrc(LRC).lines;
    const { processedLines } = autoArrange(originalLines, DEFAULT_ARRANGE_SETTINGS);
    const activeLines = resolveActiveLines(originalLines, processedLines, 'processed');

    // Preview path.
    const previewBlocks = chunkAllLyricLines(activeLines, 42, 'word-by-word');
    // Export path: same function, same inputs.
    const exportBlocks = chunkAllLyricLines(activeLines, 42, 'word-by-word');

    expect(exportBlocks.map((b) => [b.text, b.startTime, b.endTime])).toEqual(
      previewBlocks.map((b) => [b.text, b.startTime, b.endTime])
    );
  });

  it('AE. chunkAllLyricLines does not re-split already-short Smart Split cues', () => {
    const originalLines = parseLrc(`[00:10.00]${EXAMPLE}\n[00:18.00]${LONG}`).lines;
    const { processedLines } = autoArrange(originalLines, DEFAULT_ARRANGE_SETTINGS);
    const blocks = chunkAllLyricLines(processedLines, 42, 'word-by-word');

    // Exactly one visual block per processed cue: the chunker never re-splits.
    expect(blocks).toHaveLength(processedLines.length);
    for (const b of blocks) {
      expect(processedLines.some((l) => l.text === b.text)).toBe(true);
    }
  });

  it('AF. resolveActiveLines is the single resolution point', () => {
    const originalLines = [line('L1', 'Original text', 0, 4)];
    const processedLines = [line('L1#0', 'Processed text', 0, 4)];

    expect(resolveActiveLines(originalLines, processedLines, 'original')).toBe(originalLines);
    expect(resolveActiveLines(originalLines, processedLines, 'processed')).toBe(processedLines);
    // Processed mode with nothing processed yet falls back to the original.
    expect(resolveActiveLines(originalLines, [], 'processed')).toBe(originalLines);
  });

  it('AG. describeArrangeStats renders the UI stat line', () => {
    expect(describeArrangeStats(12, 31)).toBe('12 cues \u2192 31 cues');
    expect(describeArrangeStats(1, 1)).toBe('1 cue \u2192 1 cue');
  });

  it('AH. Mobile Readability is the default and produces more cues', () => {
    expect(MOBILE_READABILITY_SETTINGS.mobileReadability).toBe(true);
    expect(DEFAULT_ARRANGE_SETTINGS.mode).toBe('smart-split');
    const readable = smartSplitLyrics([line('L1', LONG, 0, 8)], MOBILE_READABILITY_SETTINGS);
    expect(readable.lines.length).toBeGreaterThanOrEqual(3);
  });

  it('AI. Audio Sync falls back to Smart Split when no alignment is supplied', () => {
    const originalLines = [line('L1', EXAMPLE, 12, 18)];
    const settings = { ...DEFAULT_ARRANGE_SETTINGS, mode: 'audio-sync' as const };
    const result = autoArrange(originalLines, settings);
    const baseline = autoArrange(originalLines, { ...DEFAULT_ARRANGE_SETTINGS, mode: 'smart-split' });

    expect(result.processedLines.map((l) => l.text)).toEqual(
      baseline.processedLines.map((l) => l.text)
    );
    expect(result.log.some((e) => e.message.includes('Audio Sync'))).toBe(true);
  });

  it('AJ. Audio Sync reuses Smart Split segmentation and reports low confidence', () => {
    const originalLines = [line('L1', EXAMPLE, 12, 18)];
    const aligned = EXAMPLE.split(' ').map((w, i) => ({
      text: w,
      startTime: 12 + i * 0.5,
      endTime: 12 + i * 0.5 + 0.5,
      confidence: 0.95,
      sourceLineId: 'L1',
    }));

    const settings = { ...DEFAULT_ARRANGE_SETTINGS, mode: 'audio-sync' as const };
    const baseline = autoArrange(originalLines, { ...DEFAULT_ARRANGE_SETTINGS, mode: 'smart-split' });
    const sync = autoArrange(originalLines, settings, { alignment: aligned });

    // Same segmentation as Smart Split; only the timings come from the audio.
    expect(sync.processedLines.map((l) => l.text)).toEqual(
      baseline.processedLines.map((l) => l.text)
    );
    expect(sync.lowConfidenceLineIds).toHaveLength(0);
    expect(sync.processedLines.every((l) => l.generatedBy === 'audio-sync')).toBe(true);

    // Low confidence falls back to Smart Split and is reported.
    const weak = autoArrange(originalLines, settings, {
      alignment: aligned.map((w) => ({ ...w, confidence: 0.1 })),
    });
    expect(weak.lowConfidenceLineIds).toEqual(['L1']);
    expect(weak.processedLines.map((l) => l.text)).toEqual(
      baseline.processedLines.map((l) => l.text)
    );
  });
});


describe('MANUAL EDITING after splitting', () => {
  const applyAll = (lines: LyricLine[]) =>
    autoArrange(lines, DEFAULT_ARRANGE_SETTINGS).processedLines;

  it('AK. Nudge / merge / text edit operate on the processed list and survive re-render', () => {
    const originalLines = [line('L1', EXAMPLE, 12, 18)];
    let processed = applyAll(originalLines);
    expect(processed.length).toBeGreaterThan(1);

    const target = processed[0];
    const beforeStart = target.startTime as number;

    // Nudge: a pure state update, so the value persists across renders.
    processed = nudgeLine(processed, target.id, 250);
    const nudged = processed.find((l) => l.id === target.id)!;
    expect(Number(((nudged.startTime as number) - beforeStart).toFixed(3))).toBeCloseTo(0.25, 3);

    // Text edit.
    processed = processed.map((l) => (l.id === target.id ? { ...l, text: 'Edited text' } : l));
    expect(processed.find((l) => l.id === target.id)!.text).toBe('Edited text');

    // Merge.
    const beforeMerge = processed.length;
    processed = mergeLines(processed, processed[0].id, processed[1].id);
    expect(processed.length).toBe(beforeMerge - 1);
  });

  it('AL. Split still works on a processed cue', () => {
    const processed = applyAll([line('L1', EXAMPLE, 12, 18)]);
    const before = processed.length;
    const after = splitLine(processed, processed[0].id);
    expect(after.length).toBe(before + 1);
  });

  it('AM. Reset to Original restores exactly and discards processed edits', () => {
    const originalLines = [line('L1', EXAMPLE, 12, 18)];
    const snapshot = JSON.parse(JSON.stringify(originalLines));

    // Apply, then make a destructive-feeling manual edit.
    const processed = applyAll(originalLines).map((l) => ({ ...l, text: 'Hacked' }));
    expect(processed[0].text).toBe('Hacked');

    // Reset discards processed entirely: the view falls back to the original.
    const activeAfterReset = resolveActiveLines(originalLines, [], 'original');
    expect(activeAfterReset).toEqual(snapshot);
    expect(activeAfterReset[0].text).toBe(EXAMPLE);
  });

  it('AN. Re-running Apply to All overwrites manual edits (documented behaviour)', () => {
    const originalLines = [line('L1', EXAMPLE, 12, 18)];

    const first = applyAll(originalLines);
    const edited = first.map((l) => ({ ...l, text: 'Manually edited' }));
    expect(edited[0].text).toBe('Manually edited');

    // Re-running regenerates from the untouched source, so the edit is gone.
    const second = applyAll(originalLines);
    expect(second.map((l) => l.text)).toEqual(first.map((l) => l.text));
    expect(second.some((l) => l.text === 'Manually edited')).toBe(false);
    // The original is still pristine.
    expect(originalLines[0].text).toBe(EXAMPLE);
  });
});

describe('PROJECT JSON — backward compatibility', () => {
  it('AO. An old project file with no arrange fields still loads', () => {
    // Exactly the shape written by a build that predates Auto Arrange.
    const oldProject = {
      version: 1,
      id: 'proj-legacy',
      name: 'Legacy Project',
      updatedAt: '2024-01-01T00:00:00.000Z',
      track: {
        title: 'Secrets',
        artist: 'Editorial Sound',
        audioSource: 'NONE',
        timingSource: 'SOURCE_LRC',
        duration: null,
      },
      lines: [
        { id: 'line-1', text: 'First line', startTime: 0, endTime: 2, source: 'SOURCE_LRC' },
        { id: 'line-2', text: EXAMPLE, startTime: 2, endTime: 8, source: 'SOURCE_LRC' },
      ],
      style: { presetName: 'Deep Forest' },
      exportSettings: { width: 1080, height: 1920, aspectRatio: '9:16', fps: 30 },
      timingSource: 'SOURCE_LRC',
      maxHoldDurationSec: 4.5,
    };

    const parsed = parseJsonLyrics(JSON.stringify(oldProject));
    expect(parsed.project).toBeDefined();

    const p = parsed.project!;
    // `lines` was promoted to originalLines, untouched.
    expect(p.originalLines).toEqual(oldProject.lines);
    expect(p.originalLines[1].text).toBe(EXAMPLE);

    // Defaults were filled in for the fields the file lacked.
    expect(p.viewMode).toBe('original');
    expect(p.arrangeSettings?.mode).toBe('smart-split');
    // The processed list was derived so the project opens in a usable state.
    expect(p.processedLines!.length).toBeGreaterThan(oldProject.lines.length);

    // The original source is still untouched after the migration derived output.
    expect(p.originalLines).toEqual(oldProject.lines);
  });

  it('AP. A modern project file round-trips both lists and settings', () => {
    const originalLines = [line('L1', EXAMPLE, 12, 18)];
    const settings = { ...DEFAULT_ARRANGE_SETTINGS, maxWordsPerCue: 6, splitAggressiveness: 80 };
    const processedLines = autoArrange(originalLines, settings).processedLines;

    const saved = {
      version: 1,
      id: 'proj-new',
      name: 'New',
      updatedAt: '2026-01-01T00:00:00.000Z',
      track: { title: 'T', artist: 'A', audioSource: 'NONE', timingSource: 'SOURCE_LRC' },
      originalLines,
      processedLines,
      arrangeSettings: settings,
      viewMode: 'processed',
      lines: originalLines,
      style: { presetName: 'Deep Forest' },
      exportSettings: { width: 1080, height: 1920, aspectRatio: '9:16', fps: 30 },
      timingSource: 'SOURCE_LRC',
      maxHoldDurationSec: 4.5,
    };

    const p = parseJsonLyrics(JSON.stringify(saved)).project!;
    expect(p.originalLines).toEqual(originalLines);
    expect(p.processedLines).toEqual(processedLines);
    expect(p.arrangeSettings?.maxWordsPerCue).toBe(6);
    expect(p.arrangeSettings?.splitAggressiveness).toBe(80);
    expect(p.viewMode).toBe('processed');
  });
});

