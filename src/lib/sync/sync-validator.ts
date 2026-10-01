import type { LyricLine } from '../../types/lyrics';

/**
 * SYNC VALIDATOR (PRD Module K)
 *
 * Runs BEFORE a sync draft can be applied. Ported from the reference
 * implementation's `validation_service.py`, adapted to Thisck's seconds-based
 * LyricLine model and extended with the structural checks the PRD adds:
 * original text preservation, line-count preservation, repeated-occurrence
 * collapse detection, and interpolation marking.
 *
 * A failed validation never silently applies — the draft carries the issues
 * and the UI surfaces them as actionable errors.
 */

export interface SyncValidationIssue {
  severity: 'error' | 'warning';
  lineId?: string;
  /** 1-based line number for user-facing messages. */
  line?: number;
  message: string;
}

export interface SyncValidationResult {
  valid: boolean;
  errors: SyncValidationIssue[];
  warnings: SyncValidationIssue[];
}

export interface SyncValidationInput {
  lines: LyricLine[];
  /** The source lines the draft was generated from (text + count reference). */
  originalLines: LyricLine[];
  /** Audio duration in seconds; 0/null skips duration checks. */
  audioDurationSec?: number | null;
}

const MIN_LINE_DURATION_SEC = 0.2;
const MAX_LINE_DURATION_SEC = 20;
const MAX_LINE_CHARS = 90;

/** Finite, non-NaN, non-Infinity number. */
function isFiniteTime(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Validates timing, structure and alignment of a sync draft.
 * Pure — never mutates its input.
 */
export function validateSyncDraft(input: SyncValidationInput): SyncValidationResult {
  const { lines, originalLines, audioDurationSec } = input;
  const errors: SyncValidationIssue[] = [];
  const warnings: SyncValidationIssue[] = [];

  // ── Structural checks ──────────────────────────────────────────────────────
  if (lines.length !== originalLines.length) {
    errors.push({
      severity: 'error',
      message: `Line count changed during alignment (${originalLines.length} → ${lines.length}).`,
    });
  }

  const originalById = new Map(originalLines.map((l) => [l.id, l]));
  const originalTexts = originalLines.map((l) => l.originalText ?? l.text);
  const draftTexts = lines.map((l) => l.originalText ?? l.text);
  for (let i = 0; i < Math.min(originalTexts.length, draftTexts.length); i++) {
    if (originalTexts[i] !== draftTexts[i]) {
      errors.push({
        severity: 'error',
        lineId: lines[i]?.id,
        line: i + 1,
        message: `Original text was modified on line ${i + 1}.`,
      });
    }
  }

  // ── Per-line timing checks ─────────────────────────────────────────────────
  let prevStart: number | null = null;
  let prevEnd: number | null = null;
  const startTimes = new Map<number, number>(); // startTime → occurrence count

  lines.forEach((line, index) => {
    const n = index + 1;
    const { startTime, endTime, text } = line;

    if (startTime === null && endTime === null) {
      // Untimed blank/instrumental lines are legal pass-throughs.
      if (text.trim()) {
        warnings.push({
          severity: 'warning',
          lineId: line.id,
          line: n,
          message: `Line ${n} has no timing (no confident match).`,
        });
      }
      return;
    }

    if (!isFiniteTime(startTime) || !isFiniteTime(endTime)) {
      errors.push({
        severity: 'error',
        lineId: line.id,
        line: n,
        message: `Line ${n} contains a non-finite timestamp.`,
      });
      return;
    }
    if (startTime < 0) {
      errors.push({
        severity: 'error',
        lineId: line.id,
        line: n,
        message: `Line ${n} starts before the beginning of the audio.`,
      });
    }
    if (endTime <= startTime) {
      errors.push({
        severity: 'error',
        lineId: line.id,
        line: n,
        message: `Line ${n} ends at or before its start.`,
      });
    }
    const duration = endTime - startTime;
    if (duration > 0 && duration < MIN_LINE_DURATION_SEC) {
      warnings.push({
        severity: 'warning',
        lineId: line.id,
        line: n,
        message: `Line ${n} is very short (${Math.round(duration * 1000)} ms).`,
      });
    }
    if (duration > MAX_LINE_DURATION_SEC) {
      warnings.push({
        severity: 'warning',
        lineId: line.id,
        line: n,
        message: `Line ${n} is very long (${Math.round(duration)} s).`,
      });
    }
    if (audioDurationSec && endTime > audioDurationSec) {
      warnings.push({
        severity: 'warning',
        lineId: line.id,
        line: n,
        message: `Line ${n} extends past the audio duration.`,
      });
    }
    if (text && text.length > MAX_LINE_CHARS) {
      warnings.push({
        severity: 'warning',
        lineId: line.id,
        line: n,
        message: `Line ${n} is very long (${text.length} characters).`,
      });
    }
    if (text.trim() && (originalById.get(line.id)?.text ?? '').trim() && !text.trim()) {
      errors.push({
        severity: 'error',
        lineId: line.id,
        line: n,
        message: `Line ${n} lost its text.`,
      });
    }

    // ── Word-level checks ────────────────────────────────────────────────────
    let prevWordEnd: number | null = null;
    for (let w = 0; w < (line.words?.length ?? 0); w++) {
      const word = line.words![w];
      if (!isFiniteTime(word.startTime) || !isFiniteTime(word.endTime)) {
        errors.push({
          severity: 'error',
          lineId: line.id,
          line: n,
          message: `Word ${w + 1} on line ${n} has a non-finite timestamp.`,
        });
        continue;
      }
      if (word.endTime <= word.startTime) {
        warnings.push({
          severity: 'warning',
          lineId: line.id,
          line: n,
          message: `Word ${w + 1} on line ${n} has an invalid duration.`,
        });
      }
      if (prevWordEnd !== null && word.startTime < prevWordEnd - 0.011) {
        warnings.push({
          severity: 'warning',
          lineId: line.id,
          line: n,
          message: `Words on line ${n} are out of order.`,
        });
      }
      prevWordEnd = word.endTime;
    }

    // ── Line-level ordering ─────────────────────────────────────────────────
    if (prevStart !== null && startTime < prevStart) {
      errors.push({ severity: 'error', message: 'Lyrics are out of order.' });
    }
    if (prevEnd !== null && startTime < prevEnd - 0.011) {
      warnings.push({ severity: 'warning', lineId: line.id, line: n, message: `Overlapping lines at line ${n}.` });
    }
    prevStart = startTime;
    prevEnd = endTime;

    startTimes.set(startTime, (startTimes.get(startTime) ?? 0) + 1);
  });

  // ── Alignment checks ───────────────────────────────────────────────────────
  // Repeated lines collapsing onto one identical timestamp is the classic
  // "first match wins" failure the DP aligner is supposed to prevent.
  const textGroups = new Map<string, LyricLine[]>();
  for (const line of lines) {
    const key = line.text.trim().toLowerCase();
    if (!key) continue;
    const group = textGroups.get(key);
    if (group) group.push(line);
    else textGroups.set(key, [line]);
  }
  for (const group of textGroups.values()) {
    if (group.length < 2) continue;
    const timed = group.filter((l) => l.startTime !== null);
    const identical = timed.filter((l) => l.startTime === timed[0].startTime && l.endTime === timed[0].endTime);
    if (timed.length >= 2 && identical.length === timed.length) {
      errors.push({
        severity: 'error',
        lineId: group[0].id,
        message: `${group.length} repeated lines were all mapped to the same audio occurrence.`,
      });
    }
  }

  const interpolated = lines.filter(
    (l) => l.words?.some((w) => w.timingSource === 'interpolated' || w.timingSource === 'estimated')
  );
  if (interpolated.length > 0) {
    warnings.push({
      severity: 'warning',
      message: `${interpolated.length} line(s) contain interpolated or estimated word timing — review recommended.`,
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}
