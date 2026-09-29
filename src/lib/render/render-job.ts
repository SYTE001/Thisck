/**
 * Render Job State
 * PRD Section 18: Explicit render-job state management.
 */

export type RenderJobStatus =
  | 'IDLE'
  | 'PREPARING'
  | 'RENDERING'
  | 'AUDIO'
  | 'ENCODING'
  | 'MUXING'
  | 'FINALIZING'
  | 'COMPLETED'
  | 'CANCELING'
  | 'CANCELED'
  | 'FAILED';

export interface RenderJobState {
  jobId: string;
  status: RenderJobStatus;
  currentFrame: number;
  totalFrames: number;
  percentage: number;
  elapsedMs: number;
  /** Estimated remaining seconds. Only set when reliable (>= 30 frames rendered). */
  estimatedRemainingMs: number | null;
  errorMessage: string | null;
  /** Human-readable status description */
  statusText: string;
}

export function createInitialJobState(jobId: string): RenderJobState {
  return {
    jobId,
    status: 'IDLE',
    currentFrame: 0,
    totalFrames: 0,
    percentage: 0,
    elapsedMs: 0,
    estimatedRemainingMs: null,
    errorMessage: null,
    statusText: 'Ready',
  };
}

/**
 * Compute estimated remaining ms when we have enough data.
 * PRD: Do not fabricate ETA when insufficient data exists.
 */
export function computeEstimatedRemaining(
  framesRendered: number,
  totalFrames: number,
  elapsedMs: number
): number | null {
  // Require at least 30 frames of data for a reliable estimate
  if (framesRendered < 30 || totalFrames <= 0) return null;
  const msPerFrame = elapsedMs / framesRendered;
  const remaining = (totalFrames - framesRendered) * msPerFrame;
  return Math.max(0, remaining);
}
