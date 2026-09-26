import type { LyricLine, QualityValidationResult, ValidationIssue, TimingSource } from '../../types/lyrics';

export function validateProjectQuality(
  lines: LyricLine[],
  audioDuration?: number | null,
  timingSource: TimingSource = 'SOURCE_UNKNOWN'
): QualityValidationResult {
  const issues: ValidationIssue[] = [];

  if (lines.length === 0) {
    issues.push({
      id: 'err-no-lines',
      type: 'error',
      message: 'No lyric lines uploaded.',
      remedy: 'Upload an LRC, TXT, or JSON lyrics file.',
      blocking: true,
    });
    return {
      readyToExport: false,
      issues,
      totalLines: 0,
      timedLines: 0,
      timingSource,
      totalDuration: 0,
    };
  }

  let timedCount = 0;
  let maxEndTime = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check 1 & 2: Missing timestamps
    if (line.startTime === null || line.endTime === null) {
      issues.push({
        id: `err-untimed-${line.id}`,
        type: 'error',
        lineId: line.id,
        message: `Line ${i + 1} "${line.text.slice(0, 24)}..." has no timestamp.`,
        remedy: 'Upload audio to align lyrics automatically or import a timestamped LRC.',
        blocking: true,
      });
      continue;
    }

    timedCount++;

    // Check 3: endTime <= startTime
    if (line.endTime <= line.startTime) {
      issues.push({
        id: `err-duration-${line.id}`,
        type: 'error',
        lineId: line.id,
        message: `Line ${i + 1} end time (${line.endTime.toFixed(2)}s) is before or equal to start time (${line.startTime.toFixed(2)}s).`,
        remedy: 'Adjust the line duration in the timeline editor.',
        blocking: true,
      });
    }

    // Check 4: Negative timestamps
    if (line.startTime < 0 || line.endTime < 0) {
      issues.push({
        id: `err-negative-${line.id}`,
        type: 'error',
        lineId: line.id,
        message: `Line ${i + 1} contains a negative timestamp (${line.startTime.toFixed(2)}s).`,
        remedy: 'Shift timeline forward with a positive global offset.',
        blocking: true,
      });
    }

    // Check 5: Timestamp chronological ordering with previous line
    if (i > 0 && lines[i - 1].startTime !== null) {
      const prev = lines[i - 1];
      if (prev.startTime !== null && line.startTime < prev.startTime) {
        issues.push({
          id: `err-order-${line.id}`,
          type: 'error',
          lineId: line.id,
          message: `Line ${i + 1} starts at ${line.startTime.toFixed(2)}s, before previous line ${i} at ${prev.startTime.toFixed(2)}s.`,
          remedy: 'Sort lines chronologically or adjust timestamps in the timeline.',
          blocking: true,
        });
      }

      // Check 6: Overlap
      if (prev.endTime !== null && line.startTime < prev.endTime - 0.05) {
        issues.push({
          id: `warn-overlap-${line.id}`,
          type: 'warning',
          lineId: line.id,
          message: `Line ${i} and Line ${i + 1} overlap by ${(prev.endTime - line.startTime).toFixed(2)}s.`,
          remedy: 'Trim end time of Line ' + i + ' or delay start of Line ' + (i + 1) + '.',
          blocking: false,
        });
      }

      // Check 13: Suspiciously long gap (> 15 seconds)
      if (prev.endTime !== null && line.startTime - prev.endTime > 15.0) {
        issues.push({
          id: `info-gap-${line.id}`,
          type: 'info',
          lineId: line.id,
          message: `Instrumental break: ${(line.startTime - prev.endTime).toFixed(1)}s gap between line ${i} and ${i + 1}.`,
          remedy: 'Normal for instrumental sections; ensure timing is intended.',
          blocking: false,
        });
      }
    }

    // Check 10: Word timestamps inside parent line
    if (line.words && line.words.length > 0) {
      for (const w of line.words) {
        if (w.startTime < line.startTime - 0.1 || w.endTime > line.endTime + 0.1) {
          issues.push({
            id: `warn-word-${w.id}`,
            type: 'warning',
            lineId: line.id,
            message: `Word "${w.text}" (${w.startTime.toFixed(2)}s) falls outside line boundary (${line.startTime.toFixed(2)}s - ${line.endTime.toFixed(2)}s).`,
            remedy: 'Clamp word timing to parent line.',
            blocking: false,
          });
          break;
        }
      }
    }

    // Check 12: Viewport / line length warning
    if (line.text.length > 70 || line.text.split(' ').length > 13) {
      issues.push({
        id: `warn-length-${line.id}`,
        type: 'warning',
        lineId: line.id,
        message: `Line ${i + 1} is long (${line.text.split(' ').length} words). May wrap into 3+ lines.`,
        remedy: 'Consider splitting this line in the timeline editor for cleaner editorial layout.',
        blocking: false,
      });
    }

    if (line.endTime > maxEndTime) {
      maxEndTime = line.endTime;
    }
  }

  // Check 8: Audio duration consistency
  if (audioDuration && audioDuration > 0) {
    if (maxEndTime > audioDuration + 0.5) {
      issues.push({
        id: `warn-audio-mismatch`,
        type: 'warning',
        message: `Lyric timeline (${maxEndTime.toFixed(1)}s) extends beyond audio duration (${audioDuration.toFixed(1)}s).`,
        remedy: 'Adjust end trim or verify song audio file matches the lyric version.',
        blocking: false,
      });
    }
  }

  // Blocking errors prevent export
  const blockingErrors = issues.filter((iss) => iss.blocking);
  const readyToExport = blockingErrors.length === 0 && timedCount > 0;

  return {
    readyToExport,
    issues,
    totalLines: lines.length,
    timedLines: timedCount,
    timingSource,
    totalDuration: audioDuration ? Math.max(maxEndTime, audioDuration) : maxEndTime,
  };
}
