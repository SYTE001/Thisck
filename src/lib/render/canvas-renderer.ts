import type { LyricLine, VisualLyricBlock } from '../../types/lyrics';
import type { StyleConfig } from '../../types/project';
import type { TextAnimationPreset } from './text-animation';
import { calculateBlockMotion } from '../motion/adaptive-motion';
import { chunkAllLyricLines, getActiveVisualBlockAt } from '../layout/lyric-chunker';
import { TextMeasurementCache, getNoiseCanvas } from './layer-cache';
import { calculateTextAnimationState, applyTextAnimationTransform } from './text-animation';

export interface RenderOptions {
  width: number;
  height: number;
  currentTime: number;
  lines: LyricLine[];
  style: StyleConfig;
  visualBlocks?: VisualLyricBlock[];
  projectSeed?: number;
  trackTitle?: string;
  artistName?: string;
  /** Text animation preset. Default 'slide-up' (matches original behaviour). */
  textAnimationPreset?: TextAnimationPreset;
  /**
   * Whether this is a preview render.
   * PRD Section 7: preview can be lower quality than export.
   */
  isPreview?: boolean;
}

/**
 * Module-level measurement cache.
 * PRD Section 10: Cache text metrics; do not remeasure on every frame.
 */
const textMeasurementCache = new TextMeasurementCache();

/**
 * Invalidate the text measurement cache.
 * Call when font or font-size changes.
 * PRD Section 31: Granular cache invalidation.
 */
export function invalidateTextCache(fontFamily?: string): void {
  if (fontFamily) {
    textMeasurementCache.invalidateFont(fontFamily);
  } else {
    textMeasurementCache.invalidate();
  }
}

/**
 * Draws the 4-point editorial star at bottom center
 */
function drawFourPointStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
  alpha: number
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();

  // Top tip
  ctx.moveTo(cx, cy - size);
  ctx.quadraticCurveTo(cx, cy, cx + size * 0.22, cy);
  // Right tip
  ctx.lineTo(cx + size, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy + size * 0.22);
  // Bottom tip
  ctx.lineTo(cx, cy + size);
  ctx.quadraticCurveTo(cx, cy, cx - size * 0.22, cy);
  // Left tip
  ctx.lineTo(cx - size, cy);
  ctx.quadraticCurveTo(cx, cy, cx, cy - size * 0.22);

  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Deterministic frame renderer for both preview and final export.
 * PRD Section 8: Frame Renderer stage.
 * PRD Section 10: Text measurement is cached.
 * PRD Section 22: Static text geometry is separated from dynamic transform.
 *
 * Strictly adheres to:
 * - NO PREVIOUS-LYRIC GHOSTING (Current lyric only).
 * - Visual chunking pipeline (3-5 words per block, editorial cut rhythm).
 * - Section 12 Micro-Motion (opacity 0->1, translateY +8px->0, scale 0.985->1.0).
 * - Safe text margins (maximum 68-72% of canvas width).
 */
export function renderEditorialFrame(
  ctx: CanvasRenderingContext2D,
  options: RenderOptions
) {
  const {
    width,
    height,
    currentTime,
    lines,
    style,
    visualBlocks: providedBlocks,
    projectSeed = 42,
    trackTitle,
    artistName,
    textAnimationPreset = 'slide-up',
    isPreview: _isPreview = false,
  } = options;

  // Use provided pre-chunked blocks or generate deterministically
  const blocks = providedBlocks || chunkAllLyricLines(lines, projectSeed);
  let { activeBlock } = getActiveVisualBlockAt(blocks, currentTime);

  if (activeBlock && activeBlock.type === 'SUPPORTING') {
    const showSupport = style.showSupportingLyrics !== false;
    const policy = style.supportingLyricPolicy || 'AUTO';
    if (!showSupport || policy === 'NEVER') {
      activeBlock = null;
    } else if (policy === 'AUTO') {
      const confidence = activeBlock.words?.[0]?.confidence ?? 1.0;
      if (confidence < 0.6) {
        activeBlock = null;
      }
    }
  }

  // Determine scene color palette (alternating burgundy / cream scenes if enabled)
  let bgColor = style.primaryBg;
  let textColor = style.primaryTextColor;

  if (style.alternatingScenes && activeBlock) {
    const isEven = activeBlock.sceneIndex % 2 === 0;
    bgColor = isEven ? style.primaryBg : style.secondaryBg;
    textColor = isEven ? style.primaryTextColor : style.secondaryTextColor;
  }

  // 1. Draw Background
  ctx.save();
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // 2. Paper Grain / Noise Texture
  // PRD Section 9: Noise canvas is cached; not regenerated every frame.
  if (style.grainIntensity > 0) {
    const noise = getNoiseCanvas();
    ctx.save();
    ctx.globalAlpha = style.grainIntensity;
    ctx.globalCompositeOperation = 'overlay';
    const pattern = ctx.createPattern(noise, 'repeat');
    if (pattern) {
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }

  // 3. Subtle Vignette
  if (style.vignetteIntensity > 0) {
    ctx.save();
    const grad = ctx.createRadialGradient(
      width / 2,
      height / 2,
      width * 0.35,
      width / 2,
      height / 2,
      width * 0.95
    );
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${style.vignetteIntensity})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // 4. Safe Text Margins & Safe Text Width (Section 17: Max 68-72% of width)
  const maxSafeTextWidth = width * 0.70; // 756px at 1080w
  const baseFontSize = Math.round(width * 0.082 * style.fontSizeRatio); // ~88px at 1080w

  // 5. Draw CURRENT ACTIVE LYRIC ONLY
  // PRIORITY 1: NO GHOSTING. Zero previous-lyric shadow, blur, opacity, or trail.
  if (activeBlock) {
    // PRD Section 22: Calculate dynamic animation state (cheap per frame)
    const animState = calculateTextAnimationState(activeBlock, currentTime, textAnimationPreset);
    const motion = calculateBlockMotion(activeBlock, currentTime, 8);

    if (animState.opacity > 0) {
      ctx.save();

      const dynamicFontSize = Math.round(baseFontSize * activeBlock.fontSizeMultiplier);
      const isSupporting = activeBlock.type === 'SUPPORTING';
      let finalFontSize = isSupporting ? Math.floor(dynamicFontSize * 0.75) : dynamicFontSize;

      // PRD Section 10: Use measurement cache for text layout
      const fontSpec = `${isSupporting ? 'italic 400' : '600'} ${finalFontSize}px "${style.fontFamily}", serif`;
      ctx.font = fontSpec;
      ctx.fillStyle = textColor;
      ctx.textBaseline = 'middle';

      let lineList = activeBlock.lines;

      // Base vertical position (centered) + animation translateY
      const centerY = height * 0.48 + animState.translateY;
      const lineHeightPx = finalFontSize * style.lineHeight;

      // PRD Section 22: Apply dynamic transform (scale, translate)
      // Separate from static geometry
      applyTextAnimationTransform(ctx, animState, width / 2, centerY);

      // Apply blur if preset requires it
      if (animState.blur > 0) {
        ctx.filter = `blur(${animState.blur.toFixed(1)}px)`;
      }

      // PRD Section 10: Use cached text measurement for width checks
      const measureLine = (text: string, font: string): number => {
        const cached = textMeasurementCache.get(text, font);
        if (cached) return cached.width;
        const w = ctx.measureText(text).width;
        textMeasurementCache.set(text, font, { width: w, height: finalFontSize });
        return w;
      };

      const getLongest = (ls: string[]) =>
        ls.reduce((max, line) => {
          ctx.font = fontSpec;
          return Math.max(max, measureLine(line, fontSpec));
        }, 0);

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
          const wrapFont = `${isSupporting ? 'italic 400' : '600'} ${finalFontSize}px "${style.fontFamily}", serif`;
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
          const wrapFontSpec = `${isSupporting ? 'italic 400' : '600'} ${finalFontSize}px "${style.fontFamily}", serif`;
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

      const finalFontSpec = `${isSupporting ? 'italic 400' : '600'} ${finalFontSize}px "${style.fontFamily}", serif`;
      ctx.font = finalFontSpec;

      if (isSupporting) {
        ctx.globalAlpha = animState.opacity * 0.75;
      }

      // Apply letter spacing if text animation preset specifies it
      if (animState.letterSpacing !== null && animState.letterSpacing > 0) {
        ctx.letterSpacing = `${animState.letterSpacing}px`;
      }

      // Check if word-level progressive highlighting is available
      const hasWordTiming = activeBlock.words && activeBlock.words.length > 0;

      // Render based on Layout Type
      switch (activeBlock.layoutType) {
        case 'offset-stagger': {
          // Asymmetric editorial layout: Line 1 shifted left, Line 2 shifted right
          const totalLines = lineList.length;
          const staggerOffsetPx = width * 0.05; // ~54px

          lineList.forEach((lineText, idx) => {
            const lineY = centerY + (idx - (totalLines - 1) / 2) * lineHeightPx;
            const shiftX = idx === 0 ? -staggerOffsetPx : staggerOffsetPx;
            ctx.textAlign = 'center';
            ctx.fillText(lineText, width / 2 + shiftX, lineY);
          });
          break;
        }

        case 'stacked-3-line': {
          // 3 stacked lines with slightly tighter line height
          const totalLines = lineList.length;
          const tightLineHeight = lineHeightPx * 0.95;
          ctx.textAlign = 'center';

          lineList.forEach((lineText, idx) => {
            const lineY = centerY + (idx - (totalLines - 1) / 2) * tightLineHeight;
            ctx.fillText(lineText, width / 2, lineY);
          });
          break;
        }

        case 'centered-hero': {
          // Large single impactful phrase
          ctx.textAlign = 'center';
          ctx.fillText(lineList[0], width / 2, centerY);
          break;
        }

        case 'single-line':
        case 'balanced-2-line':
        default: {
          // Centered standard editorial lines
          ctx.textAlign = 'center';
          const totalLines = lineList.length;

          if (!hasWordTiming) {
            lineList.forEach((lineText, idx) => {
              const lineY = centerY + (idx - (totalLines - 1) / 2) * lineHeightPx;
              ctx.fillText(lineText, width / 2, lineY);
            });
          } else {
            // Enhanced word-level animation across lines
            const allWords = activeBlock.words!;
            const wordsPerLine = Math.ceil(allWords.length / totalLines);

            lineList.forEach((_, lineIdx) => {
              const sliceStart = lineIdx * wordsPerLine;
              const sliceEnd = Math.min(sliceStart + wordsPerLine, allWords.length);
              const lineWords = allWords.slice(sliceStart, sliceEnd);
              const lineY = centerY + (lineIdx - (totalLines - 1) / 2) * lineHeightPx;

              let totalLineWidth = 0;
              const wordWidths: number[] = [];
              const spaceWidth = ctx.measureText(' ').width;

              lineWords.forEach((w) => {
                const wWidth = measureLine(w.text, finalFontSpec);
                wordWidths.push(wWidth);
                totalLineWidth += wWidth + spaceWidth;
              });
              totalLineWidth -= spaceWidth;

              let currentX = width / 2 - totalLineWidth / 2;

              lineWords.forEach((wordItem, wRelIdx) => {
                const globalWordIdx = sliceStart + wRelIdx;
                const isWordActive = globalWordIdx <= motion.activeWordIndex;

                ctx.save();
                ctx.fillStyle = textColor;
                ctx.globalAlpha = isWordActive ? animState.opacity : animState.opacity * 0.42;
                ctx.textAlign = 'left';
                ctx.fillText(wordItem.text, currentX, lineY);
                ctx.restore();

                currentX += wordWidths[wRelIdx] + spaceWidth;
              });
            });
          }
          break;
        }
      }

      // Reset letter spacing
      ctx.letterSpacing = '0px';
      ctx.filter = 'none';
      ctx.restore();
    }
  } else {
    // Clean frame between lyrics or instrumental break
    // Under no circumstances show previous text!
    if (trackTitle && lines.length > 0 && currentTime < 2.0) {
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = textColor;
      ctx.textAlign = 'center';
      ctx.font = `italic 400 ${Math.round(baseFontSize * 0.45)}px "${style.fontFamily}", serif`;
      ctx.fillText(trackTitle, width / 2, height * 0.48);
      if (artistName) {
        ctx.font = `400 ${Math.round(baseFontSize * 0.3)}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillText(artistName, width / 2, height * 0.52);
      }
      ctx.restore();
    }
  }

  // 6. Bottom Star Decoration (Section 10)
  if (style.showStarDecoration) {
    const starY = height * 0.88;
    const starSize = Math.round(width * 0.024); // ~26px
    drawFourPointStar(ctx, width / 2, starY, starSize, textColor, 0.45);
  }

  // 7. Minimal Top Track Header
  if (trackTitle) {
    ctx.save();
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.font = `500 ${Math.round(width * 0.022)}px "Plus Jakarta Sans", sans-serif`;
    const label = artistName ? `${trackTitle.toUpperCase()} — ${artistName.toUpperCase()}` : trackTitle.toUpperCase();
    ctx.fillText(label, width / 2, height * 0.08);
    ctx.restore();
  }

  ctx.restore();
}
