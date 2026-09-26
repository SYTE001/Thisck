import type { LyricLine, VisualLyricBlock } from '../../types/lyrics';
import type { StyleConfig } from '../../types/project';
import { calculateBlockMotion } from '../motion/adaptive-motion';
import { chunkAllLyricLines, getActiveVisualBlockAt } from '../layout/lyric-chunker';

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
}

// Procedural paper grain pattern generator for offline deterministic canvas rendering
let cachedNoiseCanvas: HTMLCanvasElement | null = null;
function getNoiseCanvas(): HTMLCanvasElement {
  if (cachedNoiseCanvas && cachedNoiseCanvas.width === 512 && cachedNoiseCanvas.height === 512) {
    return cachedNoiseCanvas;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const imgData = ctx.createImageData(512, 512);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.random() * 255;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 40; // low alpha
    }
    ctx.putImageData(imgData, 0, 0);
  }
  cachedNoiseCanvas = canvas;
  return canvas;
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
 * Deterministic frame renderer for both 60fps preview and final export.
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
    const motion = calculateBlockMotion(activeBlock, currentTime, 8);

    if (motion.opacity > 0) {
      ctx.save();
      ctx.globalAlpha = motion.opacity;

      const dynamicFontSize = Math.round(baseFontSize * activeBlock.fontSizeMultiplier);
      const fontSpec = `600 ${dynamicFontSize}px "${style.fontFamily}", serif`;
      ctx.font = fontSpec;
      ctx.fillStyle = textColor;
      ctx.textBaseline = 'middle';

      let lineList = activeBlock.lines;
      let finalFontSize = dynamicFontSize;
      const isSupporting = activeBlock.type === 'SUPPORTING';

      if (isSupporting) {
        finalFontSize = Math.floor(finalFontSize * 0.75);
      }

      // Base vertical position (centered) + subtle micro-motion translateY
      const centerY = height * 0.48 + motion.translateY;
      const lineHeightPx = finalFontSize * style.lineHeight;

      // Apply subtle micro-scale (0.985 to 1.0)
      ctx.translate(width / 2, centerY);
      ctx.scale(motion.scale, motion.scale);
      ctx.translate(-width / 2, -centerY);

      const getLongest = (lines: string[]) => lines.reduce((max, line) => {
        ctx.font = `${isSupporting ? 'italic 400' : '600'} ${finalFontSize}px "${style.fontFamily}", serif`;
        return Math.max(max, ctx.measureText(line).width);
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
          ctx.font = `${isSupporting ? 'italic 400' : '600'} ${finalFontSize}px "${style.fontFamily}", serif`;
          
          for (const word of allWords) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            if (ctx.measureText(testLine).width > maxSafeTextWidth) {
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
          longestWidth = getLongest(lineList);
          fitScale = maxSafeTextWidth / longestWidth;
          if (fitScale < 1.0) {
            finalFontSize = Math.floor(finalFontSize * fitScale);
          }
        } else {
          finalFontSize = idealSize;
        }
      }

      ctx.font = `${isSupporting ? 'italic 400' : '600'} ${finalFontSize}px "${style.fontFamily}", serif`;
      if (isSupporting) {
        ctx.globalAlpha = motion.opacity * 0.75;
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
                const wWidth = ctx.measureText(w.text).width;
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
                ctx.globalAlpha = isWordActive ? motion.opacity : motion.opacity * 0.42;
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
