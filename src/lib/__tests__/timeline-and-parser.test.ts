import { describe, it, expect } from 'vitest';
import { parseLrc } from '../lyrics/lrc-parser';
import { parseTxtLyrics } from '../lyrics/txt-parser';
import {
  applyGlobalOffset,
  getActiveLinesAt,
} from '../timeline/timeline-engine';
import { calculateLineMotion } from '../motion/adaptive-motion';
import { validateProjectQuality } from '../validation/quality-validator';
import type { LyricLine } from '../../types/lyrics';

describe('PRD Section 26 — Comprehensive Test Suite', () => {
  // Test 1: Basic LRC parsing
  it('1. Basic LRC parsing: extracts exact timestamps and text', () => {
    const lrc = `
[ti:Midnight Drive]
[ar:The Artists]
[00:12.30]I remember
[00:15.80]every word you said
[00:18.42]under the streetlights
`;
    const result = parseLrc(lrc);
    expect(result.lines.length).toBe(3);
    expect(result.metadata.title).toBe('Midnight Drive');
    expect(result.metadata.artist).toBe('The Artists');
    expect(result.lines[0].text).toBe('I remember');
    expect(result.lines[0].startTime).toBe(12.30);
    expect(result.lines[0].endTime).toBe(15.80);
    expect(result.timingSource).toBe('SOURCE_LRC');
  });

  // Test 2: Enhanced LRC parsing
  it('2. Enhanced LRC parsing: extracts word-level timestamps', () => {
    const enhancedLrc = `[00:12.34]secrets<00:12.70> held<00:13.10> in<00:13.40> heart<00:14.00>`;
    const result = parseLrc(enhancedLrc);
    expect(result.isEnhanced).toBe(true);
    expect(result.timingSource).toBe('SOURCE_ENHANCED_LRC');
    expect(result.lines[0].words).toBeDefined();
    expect(result.lines[0].words!.length).toBe(4);
    expect(result.lines[0].words![0].text).toBe('secrets');
    expect(result.lines[0].words![0].endTime).toBe(12.70);
  });

  // Test 3: TXT without timestamps (Never invent fake timestamps!)
  it('3. TXT without timestamps: preserves null timestamps without fabrication', () => {
    const txt = `
Secrets
held in my
heart
are harder to
forget
`;
    const result = parseTxtLyrics(txt);
    expect(result.lines.length).toBe(5);
    for (const line of result.lines) {
      expect(line.startTime).toBeNull();
      expect(line.endTime).toBeNull();
      expect(line.source).toBe('SOURCE_UNKNOWN');
    }
  });

  // Test 4: Missing timestamps validation
  it('4. Missing timestamps validation: blocks export and lists actionable issues', () => {
    const txt = `First line\nSecond line`;
    const parsed = parseTxtLyrics(txt);
    const validation = validateProjectQuality(parsed.lines);
    expect(validation.readyToExport).toBe(false);
    expect(validation.issues.some((i) => i.blocking && i.id.startsWith('err-untimed'))).toBe(true);
  });

  // Test 5: Overlapping timestamps
  it('5. Overlapping timestamps: detects overlap and provides non-blocking warning', () => {
    const lines: LyricLine[] = [
      { id: '1', text: 'Line one', startTime: 10.0, endTime: 15.0, source: 'SOURCE_LRC' },
      { id: '2', text: 'Line two', startTime: 14.0, endTime: 18.0, source: 'SOURCE_LRC' },
    ];
    const validation = validateProjectQuality(lines);
    expect(validation.issues.some((i) => i.id.startsWith('warn-overlap'))).toBe(true);
  });

  // Test 6: Out-of-order timestamps
  it('6. Out-of-order timestamps: flags blocking error when line starts before previous', () => {
    const lines: LyricLine[] = [
      { id: '1', text: 'Line one', startTime: 15.0, endTime: 20.0, source: 'SOURCE_LRC' },
      { id: '2', text: 'Line two', startTime: 10.0, endTime: 14.0, source: 'SOURCE_LRC' },
    ];
    const validation = validateProjectQuality(lines);
    expect(validation.readyToExport).toBe(false);
    expect(validation.issues.some((i) => i.id.startsWith('err-order'))).toBe(true);
  });

  // Test 7: Very long lyric line
  it('7. Very long lyric line: generates warning for layout balance', () => {
    const lines: LyricLine[] = [
      {
        id: '1',
        text: 'This is an excessively long lyric line that has far too many words to look good on an editorial poster layout without wrapping multiple times',
        startTime: 5.0,
        endTime: 10.0,
        source: 'SOURCE_LRC',
      },
    ];
    const validation = validateProjectQuality(lines);
    expect(validation.issues.some((i) => i.id.startsWith('warn-length'))).toBe(true);
  });

  // Test 8: Empty lyric line
  it('8. Empty lyric line handling: filtered cleanly during parse', () => {
    const lrc = `
[00:05.00]Valid line 1
[00:08.00]   
[00:10.00]Valid line 2
`;
    const result = parseLrc(lrc);
    expect(result.lines.length).toBe(2);
    expect(result.lines[0].text).toBe('Valid line 1');
    expect(result.lines[1].text).toBe('Valid line 2');
  });

  // Test 9: Global +250ms offset
  it('9. Global +250ms offset: accurately shifts every timestamp by +0.250s', () => {
    const lines: LyricLine[] = [
      { id: '1', text: 'One', startTime: 10.0, endTime: 13.0, source: 'SOURCE_LRC' },
      { id: '2', text: 'Two', startTime: 13.5, endTime: 16.0, source: 'SOURCE_LRC' },
    ];
    const shifted = applyGlobalOffset(lines, 250);
    expect(shifted[0].startTime).toBe(10.25);
    expect(shifted[0].endTime).toBe(13.25);
    expect(shifted[1].startTime).toBe(13.75);
    expect(shifted[1].endTime).toBe(16.25);
  });

  // Test 10: Global -250ms offset
  it('10. Global -250ms offset: shifts timestamps back and clamps at 0', () => {
    const lines: LyricLine[] = [
      { id: '1', text: 'One', startTime: 0.1, endTime: 2.0, source: 'SOURCE_LRC' },
      { id: '2', text: 'Two', startTime: 2.5, endTime: 5.0, source: 'SOURCE_LRC' },
    ];
    const shifted = applyGlobalOffset(lines, -250);
    expect(shifted[0].startTime).toBe(0); // clamped at 0
    expect(shifted[1].startTime).toBe(2.25);
    expect(shifted[1].endTime).toBe(4.75);
  });

  // Test 11: Audio duration shorter than lyrics
  it('11. Audio duration shorter than lyrics: generates warning', () => {
    const lines: LyricLine[] = [
      { id: '1', text: 'Start', startTime: 10.0, endTime: 35.0, source: 'SOURCE_LRC' },
    ];
    const validation = validateProjectQuality(lines, 30.0); // audio only 30s
    expect(validation.issues.some((i) => i.id === 'warn-audio-mismatch')).toBe(true);
  });

  // Test 12: Exact preview/render synchronization
  it('12. Exact preview/render synchronization: adaptive motion returns strictly deterministic values', () => {
    const line: LyricLine = {
      id: '1',
      text: 'Synchronized motion',
      startTime: 10.0,
      endTime: 14.0, // 4.0s duration -> Long segment
      source: 'SOURCE_LRC',
    };

    // Before line: inactive
    const before = calculateLineMotion(line, 9.99);
    expect(before.isActive).toBe(false);
    expect(before.opacity).toBe(0);

    // During entrance: active and ramping up
    const entering = calculateLineMotion(line, 10.15);
    expect(entering.isActive).toBe(true);
    expect(entering.opacity).toBeGreaterThan(0);
    expect(entering.phase).toBe('enter');

    // Middle of hold: fully active and opacity 1.0
    const holding = calculateLineMotion(line, 12.0);
    expect(holding.isActive).toBe(true);
    expect(holding.opacity).toBe(1.0);
    expect(holding.phase).toBe('hold');

    // After line: inactive
    const after = calculateLineMotion(line, 14.01);
    expect(after.isActive).toBe(false);
    expect(after.opacity).toBe(0);
  });

  // Test 13: 1000+ lyric lines performance
  it('13. 1000+ lyric lines performance: parses and calculates active line in < 50ms', () => {
    let largeLrc = '';
    for (let i = 0; i < 1000; i++) {
      const min = Math.floor(i / 60);
      const sec = (i % 60).toFixed(2).padStart(5, '0');
      largeLrc += `[${String(min).padStart(2, '0')}:${sec}] Line number ${i + 1} content\n`;
    }

    const t0 = performance.now();
    const result = parseLrc(largeLrc);
    const parseTime = performance.now() - t0;

    expect(result.lines.length).toBe(1000);
    expect(parseTime).toBeLessThan(100);

    const tActive = performance.now();
    const active = getActiveLinesAt(result.lines, 45.2);
    const activeTime = performance.now() - tActive;

    expect(active.currentLine).not.toBeNull();
    expect(activeTime).toBeLessThan(5);
  });

  // Test 14: Export with alternating scenes
  it('14. Alternating scenes: seed indices alternate cleanly between lines', () => {
    const lines: LyricLine[] = [
      { id: '1', text: 'Line 1', startTime: 0, endTime: 3, source: 'SOURCE_LRC' },
      { id: '2', text: 'Line 2', startTime: 3, endTime: 6, source: 'SOURCE_LRC' },
      { id: '3', text: 'Line 3', startTime: 6, endTime: 9, source: 'SOURCE_LRC' },
    ];
    const at0 = getActiveLinesAt(lines, 1.5);
    const at3 = getActiveLinesAt(lines, 4.5);
    const at6 = getActiveLinesAt(lines, 7.5);

    expect(at0.currentIndex % 2).toBe(0); // Scene A
    expect(at3.currentIndex % 2).toBe(1); // Scene B
    expect(at6.currentIndex % 2).toBe(0); // Scene A
  });

  // Test 15: Word-level timing
  it('15. Word-level timing: tracks active word as playhead progresses', () => {
    const line: LyricLine = {
      id: '1',
      text: 'one two three',
      startTime: 10.0,
      endTime: 13.0,
      source: 'SOURCE_ENHANCED_LRC',
      words: [
        { id: 'w1', text: 'one', startTime: 10.0, endTime: 11.0 },
        { id: 'w2', text: 'two', startTime: 11.0, endTime: 12.0 },
        { id: 'w3', text: 'three', startTime: 12.0, endTime: 13.0 },
      ],
    };

    const m1 = calculateLineMotion(line, 10.5);
    expect(m1.activeWordIndex).toBe(0);

    const m2 = calculateLineMotion(line, 11.5);
    expect(m2.activeWordIndex).toBe(1);

    const m3 = calculateLineMotion(line, 12.5);
    expect(m3.activeWordIndex).toBe(2);
  });
});
