import React, { useEffect, useRef } from 'react';

/**
 * Waveform canvas — PRD Section 26.
 *
 * Renders precomputed peak buckets to a <canvas> instead of hundreds/thousands
 * of DOM bars, so long audio files stay cheap to display. Rendering is
 * devicePixelRatio-aware for crisp bars on high-density screens and redraws
 * only when its inputs change.
 */
interface WaveformCanvasProps {
  /** Normalized amplitude peaks in [0, 1]. */
  peaks: number[];
  /** CSS width in pixels (matches the timeline track width). */
  width: number;
  /** CSS height in pixels. */
  height: number;
  color?: string;
  className?: string;
}

export const WaveformCanvas: React.FC<WaveformCanvasProps> = ({
  peaks,
  width,
  height,
  color = 'rgba(36, 86, 111, 0.45)',
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const cssWidth = Math.max(1, Math.floor(width));
    const cssHeight = Math.max(1, Math.floor(height));

    // Size the backing store for the device pixel ratio, then draw in CSS px.
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, cssWidth, cssHeight);
    if (peaks.length === 0) return;

    const mid = cssHeight / 2;
    // One bar per column of pixels; sample the nearest peak bucket.
    const columns = cssWidth;
    ctx.fillStyle = color;
    for (let x = 0; x < columns; x++) {
      const peakIndex = Math.floor((x / columns) * peaks.length);
      const amp = Math.max(0, Math.min(1, peaks[peakIndex] ?? 0));
      const barH = Math.max(1, amp * (cssHeight - 2));
      ctx.fillRect(x, mid - barH / 2, 1, barH);
    }
  }, [peaks, width, height, color]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
};
