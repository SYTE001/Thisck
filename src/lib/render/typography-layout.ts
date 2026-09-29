import type { VisualLyricBlock } from '../../types/lyrics';
import type { StyleConfig } from '../../types/project';
import { EDITORIAL } from '../config/editorial-constants';
import { LayerCache, TextMeasurementCache } from './layer-cache';

/**
 * Typography layout — PRD Section 10 & 10.2.
 *
 * Pure geometry: resolves the final rendered font size and the wrapped line
 * list for a block BEFORE any animation/effect runs (so effect displacements
 * can be expressed relative to the real font size) and BEFORE drawing.
 *
 * A layout cache keyed by the block + typography inputs means wrapping is not
 * recomputed every frame when nothing about the block or style changed
 * (PRD 10.2). Text width metrics still use the shared measurement cache.
 */

export interface LyricLayout {
  finalFontSize: number;
  isSupporting: boolean;
  lineList: string[];
  finalFontSpec: string;
}

/** Layout cache keyed by everything that can change the wrapped geometry. */
const layoutCache = new LayerCache<LyricLayout>();

export function invalidateLayoutCache(): void {
  layoutCache.invalidateAll();
}

function layoutDepHash(block: VisualLyricBlock, style: StyleConfig, width: number): string {
  return [
    block.text,
    block.type ?? '',
    block.fontSizeMultiplier,
    style.fontFamily,
    style.fontSizeRatio,
    width,
  ].join('|');
}

export function layoutLyricBlock(
  ctx: CanvasRenderingContext2D,
  activeBlock: VisualLyricBlock,
  style: StyleConfig,
  width: number,
  measurementCache: TextMeasurementCache
): LyricLayout {
  const depHash = layoutDepHash(activeBlock, style, width);
  const cached = layoutCache.get(activeBlock.id, depHash);
  if (cached) {
    ctx.font = cached.finalFontSpec;
    return cached;
  }

  const maxSafeTextWidth = width * EDITORIAL.maxSafeTextRatio; // 756px at 1080w
  const baseFontSize = Math.round(width * 0.082 * style.fontSizeRatio); // ~88px at 1080w
  const dynamicFontSize = Math.round(baseFontSize * activeBlock.fontSizeMultiplier);
  const isSupporting = activeBlock.type === 'SUPPORTING';
  let finalFontSize = isSupporting ? Math.floor(dynamicFontSize * 0.75) : dynamicFontSize;

  const weight = isSupporting ? 'italic 400' : '600';

  const measureLine = (text: string, font: string): number => {
    const c = measurementCache.get(text, font);
    if (c) return c.width;
    const w = ctx.measureText(text).width;
    measurementCache.set(text, font, { width: w, height: finalFontSize });
    return w;
  };

  const buildSpec = (size: number) => `${weight} ${size}px "${style.fontFamily}", serif`;

  let fontSpec = buildSpec(finalFontSize);
  ctx.font = fontSpec;

  const getLongest = (ls: string[]) =>
    ls.reduce((max, line) => {
      ctx.font = fontSpec;
      return Math.max(max, measureLine(line, fontSpec));
    }, 0);

  let lineList = activeBlock.lines;
  let longestWidth = getLongest(lineList);
  let fitScale = maxSafeTextWidth / longestWidth;

  if (fitScale < 1.0) {
    const minSize = isSupporting ? 48 : 64;
    const idealSize = Math.floor(finalFontSize * fitScale);

    if (idealSize < minSize) {
      finalFontSize = minSize;
      // Text is too wide at minSize, so we must rewrap dynamically
      const allWords = activeBlock.text.split(' ');
      lineList = [];
      let currentLine = '';
      const wrapFont = buildSpec(finalFontSize);
      ctx.font = wrapFont;

      for (const word of allWords) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        if (measureLine(testLine, wrapFont) > maxSafeTextWidth) {
          if (currentLine) {
            lineList.push(currentLine);
            currentLine = word;
          } else {
            lineList.push(word);
            currentLine = '';
          }
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lineList.push(currentLine);

      // Re-check just in case a single word exceeds max width
      const wrapFontSpec = buildSpec(finalFontSize);
      ctx.font = wrapFontSpec;
      longestWidth = getLongest(lineList);
      fitScale = maxSafeTextWidth / longestWidth;
      if (fitScale < 1.0) {
        finalFontSize = Math.floor(finalFontSize * fitScale);
      }
    } else {
      finalFontSize = idealSize;
    }
  }

  const finalFontSpec = buildSpec(finalFontSize);
  ctx.font = finalFontSpec;

  const layout: LyricLayout = { finalFontSize, isSupporting, lineList, finalFontSpec };
  layoutCache.set(activeBlock.id, layout, depHash);
  return layout;
}
