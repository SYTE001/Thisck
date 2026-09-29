import type { ExportPlan } from './export-plan';

/**
 * Render worker protocol — PRD Section 0.4 (P0.4) & 13.
 *
 * Message contract between the main-thread RenderController and an
 * OffscreenCanvas render worker. The types are defined here so both sides share
 * one source of truth once the worker path is enabled.
 *
 * NOTE (browser limitation): the worker render path is scaffolded but NOT yet
 * the default. The existing renderer depends on DOM-only APIs (it builds the
 * grain texture with document.createElement('canvas')), which are unavailable
 * inside a Worker. Moving rendering off the main thread requires porting those
 * helpers to OffscreenCanvas first. Until then exportVideo runs on the main
 * thread (see canUseOffscreenCanvas), which is the verified path. This is
 * recorded in the README as a known follow-up.
 */

export type RenderWorkerRequest =
  | { type: 'START'; plan: ExportPlan }
  | { type: 'CANCEL' };

export type RenderWorkerResponse =
  | { type: 'PROGRESS'; phase: string; completed: number; total: number; fraction: number }
  | { type: 'CHUNK'; data: ArrayBuffer }
  | { type: 'DONE'; data: ArrayBuffer }
  | { type: 'ERROR'; name: string; message: string }
  | { type: 'CANCELED' };

/**
 * Feature detection for worker + OffscreenCanvas rendering (PRD P0.4).
 * Worker support must never be a hard requirement; callers fall back to the
 * main-thread path when this returns false.
 */
export function canUseOffscreenCanvas(): boolean {
  return (
    typeof OffscreenCanvas !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    // The encoder must also exist for the worker path to be worthwhile.
    typeof VideoEncoder !== 'undefined'
  );
}
