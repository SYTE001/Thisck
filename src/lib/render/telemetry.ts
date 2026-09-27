/**
 * Performance Telemetry
 * PRD Section 35: Developer-only performance diagnostics mode.
 * Do not expose debug telemetry by default to normal users.
 */

export interface FrameTelemetry {
  frameIndex: number;
  renderMs: number;
  layoutMs: number;
  compositeMs: number;
  encodeMs: number;
}

export interface TelemetrySummary {
  frameCount: number;
  avgRenderMs: number;
  maxRenderMs: number;
  avgLayoutMs: number;
  avgCompositeMs: number;
  avgEncodeMs: number;
  totalMs: number;
}

/**
 * Lightweight telemetry collector. Only active when enabled.
 * PRD Section 35: Do not expose by default.
 */
export class PerformanceTelemetry {
  private enabled: boolean;
  private frames: FrameTelemetry[] = [];

  constructor(enabled = false) {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  enable(): void {
    this.enabled = true;
  }

  disable(): void {
    this.enabled = false;
  }

  record(frame: FrameTelemetry): void {
    if (!this.enabled) return;
    this.frames.push(frame);
  }

  /** Time a function and return its return value + elapsed time. */
  time<T>(fn: () => T): { result: T; elapsedMs: number } {
    if (!this.enabled) {
      return { result: fn(), elapsedMs: 0 };
    }
    const start = performance.now();
    const result = fn();
    return { result, elapsedMs: performance.now() - start };
  }

  async timeAsync<T>(fn: () => Promise<T>): Promise<{ result: T; elapsedMs: number }> {
    if (!this.enabled) {
      return { result: await fn(), elapsedMs: 0 };
    }
    const start = performance.now();
    const result = await fn();
    return { result, elapsedMs: performance.now() - start };
  }

  getSummary(): TelemetrySummary | null {
    if (this.frames.length === 0) return null;

    const count = this.frames.length;
    const avg = (key: keyof FrameTelemetry) =>
      this.frames.reduce((sum, f) => sum + (f[key] as number), 0) / count;

    return {
      frameCount: count,
      avgRenderMs: avg('renderMs'),
      maxRenderMs: Math.max(...this.frames.map((f) => f.renderMs)),
      avgLayoutMs: avg('layoutMs'),
      avgCompositeMs: avg('compositeMs'),
      avgEncodeMs: avg('encodeMs'),
      totalMs: this.frames.reduce((sum, f) => sum + f.renderMs, 0),
    };
  }

  /**
   * Format summary for console output.
   * PRD Section 35 example:
   *   Render: 18.4 ms/frame
   *   Layout: 1.2 ms
   *   Composite: 6.7 ms
   *   Encode: 4.1 ms
   */
  formatSummary(): string {
    const s = this.getSummary();
    if (!s) return 'No telemetry data.';
    return [
      `Frames: ${s.frameCount}`,
      `Render: ${s.avgRenderMs.toFixed(1)} ms/frame (max ${s.maxRenderMs.toFixed(1)} ms)`,
      `Layout: ${s.avgLayoutMs.toFixed(1)} ms`,
      `Composite: ${s.avgCompositeMs.toFixed(1)} ms`,
      `Encode: ${s.avgEncodeMs.toFixed(1)} ms`,
    ].join('\n');
  }

  reset(): void {
    this.frames = [];
  }
}

/** Global telemetry instance. Disabled by default. Enable via dev tools or dev flag. */
export const telemetry = new PerformanceTelemetry(
  typeof window !== 'undefined' &&
    (window as any).__THISCK_DEV_TELEMETRY === true
);
