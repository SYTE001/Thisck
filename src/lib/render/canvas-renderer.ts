import type { LyricLine, VisualLyricBlock } from '../../types/lyrics';
import type { StyleConfig } from '../../types/project';
import type { TextAnimationPreset } from './text-animation';
import type { LyricsType, LyricsEffect, LyricsEffectConfig } from './lyricsAnimation/types';
import { chunkAllLyricLines, getActiveVisualBlockAt } from '../layout/lyric-chunker';
import { TextMeasurementCache, getNoiseCanvas } from './layer-cache';
import { applyTextAnimationTransform } from './text-animation';
import { resolveAnimationConfig, type LegacyTextAnimationConfig } from './animation-resolver';
import { layoutLyricBlock, invalidateLayoutCache } from './typography-layout';
import { getLyricsAnimationState } from './lyricsAnimation/animationEngine';
import { getWaveOffsetY } from './lyricsAnimation/lyricsEffects';
import { getDistributedWords } from './lyricsAnimation/presets/wordByWord';

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
  /** Layer 1: Content & Display Behavior */
  lyricsType?: LyricsType;
  /** Layer 2: Visual Motion & Animation Behavior */
  lyricsEffect?: LyricsEffect;
  /** Configuration for lyrics effect */
  lyricsEffectConfig?: LyricsEffectConfig;
  /** Text animation preset (legacy compatibility) */
  textAnimationPreset?: TextAnimationPreset;
  /** Text animation config (legacy compatibility) */
  textAnimationConfig?: LegacyTextAnimationConfig;
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
  // Wrapped layout depends on font metrics, so drop it too.
  invalidateLayoutCache();
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
    textAnimationPreset = 'karaoke',
    textAnimationConfig = {},
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
    const noise = getNoiseCanvas(projectSeed);
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
  // NOTE: the actual fit-to-width math lives in layoutLyricBlock() so the final font
  // size is known before the lyrics effect is resolved (em-relative displacements).
  const baseFontSize = Math.round(width * 0.082 * style.fontSizeRatio); // ~88px at 1080w

  // 5. Draw CURRENT ACTIVE LYRIC ONLY
  // PRIORITY 1: NO GHOSTING. Zero previous-lyric shadow, blur, opacity, or trail.
  if (activeBlock) {
    // Resolve the canonical (type, effect, config) at the boundary. The renderer
    // itself never inspects legacy preset names (PRD Section 9).
    const canonical = resolveAnimationConfig({
      lyricsType: options.lyricsType,
      lyricsEffect: options.lyricsEffect,
      lyricsEffectConfig: options.lyricsEffectConfig,
      textAnimationPreset,
      textAnimationConfig,
    });
    const effType: LyricsType = canonical.type;
    const effEffect: LyricsEffect = canonical.effect;
    const effConfig: LyricsEffectConfig | undefined = canonical.config;

    // Resolve the FINAL font size first: all lyrics effect displacements are em-relative,
    // so the effect engine needs the real rendered font size (preview and export identical).
    const fontLayout = layoutLyricBlock(ctx, activeBlock, style, width, textMeasurementCache);
    const { finalFontSize, isSupporting, lineList, finalFontSpec } = fontLayout;

    const lyricsAnimState = getLyricsAnimationState(
      effType,
      effEffect,
      activeBlock,
      currentTime,
      effConfig,
      style.accentColor || '#E6C280',
      finalFontSize
    );
    const lineState = lyricsAnimState.line;
    const animState = {
      opacity: lineState.opacity,
      translateY: lineState.translateY,
      scale: lineState.scale,
      blur: lineState.blur,
      letterSpacing: lineState.letterSpacing ?? null,
      activeWordIndex: 0,
    };

    if (animState.opacity > 0) {
      ctx.save();

      ctx.font = finalFontSpec;
      ctx.fillStyle = textColor;
      ctx.textBaseline = 'middle';

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

      if (isSupporting) {
        ctx.globalAlpha = animState.opacity * 0.75;
      }

      // Apply letter spacing if text animation preset specifies it
      if (animState.letterSpacing !== null && animState.letterSpacing > 0) {
        ctx.letterSpacing = `${animState.letterSpacing}px`;
      }

      // Check if word-level animation is available from lyrics animation state
      const effectiveWords = getDistributedWords(activeBlock);
      const hasWordAnimation = !!(
        effectiveWords.length > 0 &&
        lyricsAnimState.words &&
        lyricsAnimState.words.length > 0
      );

      // Per-character wave ripple.
      // The engine applies the wave per WORD; for 'word-by-word' we refine it to a true
      // character ripple by drawing each glyph at its own vertical offset.
      // Base layout is untouched: glyphs keep their exact horizontal positions and the
      // whole block is drawn from the same word-level x cursor as any other effect.
      const effectIntensity = effConfig?.intensity ?? 1.0;
      const useCharWave = effEffect === 'wave' && hasWordAnimation;

      // Stable global character index per word, so the phase travels left to right
      // across the entire line regardless of reveal order.
      const charStartIndex: number[] = [];
      if (useCharWave) {
        let acc = 0;
        for (const w of effectiveWords) {
          charStartIndex.push(acc);
          acc += Array.from(w.text).length;
        }
      }

      let wordCursor = 0;
      const renderLyricLine = (lineText: string, lineY: number, shiftX: number = 0) => {
        const lineWordCount = lineText.trim().split(/\s+/).filter(Boolean).length;
        const lineWords = hasWordAnimation ? effectiveWords.slice(wordCursor, wordCursor + lineWordCount) : [];
        const wordStartIndex = wordCursor;
        wordCursor += lineWordCount;

        if (!hasWordAnimation || lineWords.length === 0) {
          ctx.textAlign = 'center';
          ctx.fillText(lineText, width / 2 + shiftX, lineY);
          return;
        }

        let totalLineWidth = 0;
        const wordWidths: number[] = [];
        const spaceWidth = ctx.measureText(' ').width;

        lineWords.forEach((w) => {
          const wWidth = measureLine(w.text, finalFontSpec);
          wordWidths.push(wWidth);
          totalLineWidth += wWidth + spaceWidth;
        });
        if (lineWords.length > 0) {
          totalLineWidth -= spaceWidth;
        }

        let currentX = width / 2 - totalLineWidth / 2 + shiftX;

        // Progressive reveal mode: clip smoothly from left to right without moving text
        if (effType === 'progressive' && lyricsAnimState.revealProgress !== undefined) {
          const clipWidth = totalLineWidth * Math.max(0, Math.min(1, lyricsAnimState.revealProgress));
          ctx.save();
          ctx.beginPath();
          ctx.rect(currentX - 10, lineY - lineHeightPx, clipWidth + 10, lineHeightPx * 2);
          ctx.clip();
        }

        lineWords.forEach((wordItem, wRelIdx) => {
          const globalWordIdx = wordStartIndex + wRelIdx;
          const wordState = lyricsAnimState.words[globalWordIdx];

          if (!wordState || wordState.opacity > 0.001) {
            ctx.save();
            const drawX = currentX + (wordState?.translateX || 0);
            const drawY = lineY + (wordState?.translateY || 0);

            if (wordState) {
              ctx.globalAlpha = Math.max(0, Math.min(1, animState.opacity * wordState.opacity));

              if (wordState.translateX || wordState.translateY || (wordState.scale !== undefined && wordState.scale !== 1.0)) {
                const centerX = currentX + wordWidths[wRelIdx] / 2;
                const centerY = lineY;
                ctx.translate(centerX, centerY);
                if (wordState.scale !== undefined && wordState.scale !== 1.0) {
                  ctx.scale(wordState.scale, wordState.scale);
                }
                ctx.translate(-centerX, -centerY);
              }

              if (wordState.blur && wordState.blur > 0) {
                ctx.filter = `blur(${wordState.blur.toFixed(1)}px)`;
              }

              if (wordState.glow && wordState.glow > 0) {
                ctx.shadowColor = wordState.colorOverride || style.accentColor || '#E6C280';
                ctx.shadowBlur = wordState.glow;
              }

              ctx.fillStyle = wordState.colorOverride || textColor;
            } else {
              ctx.globalAlpha = animState.opacity;
              ctx.fillStyle = textColor;
            }

            ctx.textAlign = 'left';
            if (useCharWave && wordItem.text.length > 0) {
              // Character-level ripple: each glyph keeps its base x position and
              // only its vertical offset changes, so the layout never shifts.
              const chars = Array.from(wordItem.text);
              const charWidths = chars.map((c) => measureLine(c, finalFontSpec));
              const measuredSum = charWidths.reduce((a, b) => a + b, 0);
              // Normalize glyph advances so the word occupies exactly the same
              // width as the word-level layout (kerning/shaping tolerance).
              const widthRatio = measuredSum > 0 ? wordWidths[wRelIdx] / measuredSum : 0;

              const charBase = charStartIndex[globalWordIdx] ?? 0;
              let charX = drawX;

              chars.forEach((ch, cIdx) => {
                const charW = charWidths[cIdx] * widthRatio;
                const charOffsetY = getWaveOffsetY(
                  charBase + cIdx,
                  currentTime,
                  activeBlock.startTime,
                  finalFontSize,
                  effectIntensity
                );
                ctx.fillText(ch, charX, lineY + charOffsetY);
                charX += charW;
              });
            } else {
              ctx.fillText(wordItem.text, drawX, drawY);
            }
            ctx.restore();
          }

          currentX += wordWidths[wRelIdx] + spaceWidth;
        });

        if (effType === 'progressive' && lyricsAnimState.revealProgress !== undefined) {
          ctx.restore();
        }
      };

      // Render based on Layout Type
      switch (activeBlock.layoutType) {
        case 'offset-stagger': {
          const totalLines = lineList.length;
          const staggerOffsetPx = width * 0.05; // ~54px

          lineList.forEach((lineText, idx) => {
            const lineY = centerY + (idx - (totalLines - 1) / 2) * lineHeightPx;
            const shiftX = idx === 0 ? -staggerOffsetPx : staggerOffsetPx;
            renderLyricLine(lineText, lineY, shiftX);
          });
          break;
        }

        case 'stacked-3-line': {
          const totalLines = lineList.length;
          const tightLineHeight = lineHeightPx * 0.95;

          lineList.forEach((lineText, idx) => {
            const lineY = centerY + (idx - (totalLines - 1) / 2) * tightLineHeight;
            renderLyricLine(lineText, lineY, 0);
          });
          break;
        }

        case 'centered-hero': {
          renderLyricLine(lineList[0], centerY, 0);
          break;
        }

        case 'single-line':
        case 'balanced-2-line':
        default: {
          const totalLines = lineList.length;
          lineList.forEach((lineText, idx) => {
            const lineY = centerY + (idx - (totalLines - 1) / 2) * lineHeightPx;
            renderLyricLine(lineText, lineY, 0);
          });
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
