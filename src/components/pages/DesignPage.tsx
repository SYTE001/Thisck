import React, { useState } from 'react';
import { 
  Palette, 
  Type, 
  Sparkles, 
  Check, 
  ChevronDown, 
  ChevronUp 
} from 'lucide-react';
import type { LyricLine, VisualLyricBlock, QualityValidationResult } from '../../types/lyrics';
import type { StyleConfig, MotionLayersConfig } from '../../types/project';
import type { LyricsType, LyricsEffect } from '../../lib/render/lyricsAnimation/types';
import { STYLE_PRESETS } from '../../lib/styles/presets';
import { PreviewPlayer } from '../PreviewPlayer';

const LYRICS_TYPE_OPTIONS: { id: LyricsType; label: string; desc: string }[] = [
  { id: 'single-line', label: 'Single Line', desc: '1 line centered per block' },
  { id: 'multi-line', label: 'Multi Line', desc: 'Balanced 2 lines' },
  { id: 'paragraph', label: 'Paragraph', desc: 'Stacked 3+ lines' },
  { id: 'word-by-word', label: 'Word by Word', desc: 'Sequential reveal, fixed layout' },
  { id: 'character', label: 'Character', desc: 'Character by character reveal' },
  { id: 'highlighted-word', label: 'Highlighted Word', desc: 'All visible, active word highlighted' },
  { id: 'karaoke', label: 'Karaoke', desc: 'All visible, dim to sung transition' },
  { id: 'progressive', label: 'Progressive', desc: 'Continuous left-to-right wipe' },
];

const LYRICS_EFFECT_OPTIONS: { id: LyricsEffect; label: string; desc: string }[] = [
  { id: 'none', label: 'None', desc: '100% static & solid' },
  { id: 'fade', label: 'Fade In', desc: 'Smooth opacity reveal' },
  { id: 'fade-in-out', label: 'Fade In + Out', desc: 'Opacity entry & exit' },
  { id: 'wave', label: 'Wave', desc: 'Typographic wave ripple' },
  { id: 'kinetic', label: 'Kinetic', desc: 'Modern micro-slide entry' },
  { id: 'scale', label: 'Scale', desc: 'Gentle scale settle' },
  { id: 'pop', label: 'Pop', desc: 'Snappy micro-pop accent' },
  { id: 'blur', label: 'Blur In', desc: 'Soft blur to sharp' },
  { id: 'slide', label: 'Slide', desc: 'Clean directional slide' },
  { id: 'typewriter', label: 'Typewriter', desc: 'Stepped cadence reveal' },
  { id: 'bounce', label: 'Bounce', desc: 'Subtle gentle bounce' },
  { id: 'glow', label: 'Glow', desc: 'Soft luminous bloom' },
  { id: 'highlight', label: 'Highlight', desc: 'Contrast color sweep' },
  { id: 'pulse', label: 'Pulse', desc: 'Rhythmic breathing pulse' },
];
interface DesignPageProps {
  lines: LyricLine[];
  style: StyleConfig;
  visualBlocks: VisualLyricBlock[];
  currentTime: number;
  totalDuration: number;
  isPlaying: boolean;
  audioBlobUrl: string | null;
  trackTitle: string;
  artistName: string;
  validation: QualityValidationResult;
  motionLayers: MotionLayersConfig;
  onUpdateStyle: (newStyle: Partial<StyleConfig>) => void;
  onUpdateMotionLayers: (layers: Partial<MotionLayersConfig>) => void;
  onApplyPreset: (presetName: string) => void;
  onTimeUpdate: (time: number) => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onPrevLine: () => void;
  onNextLine: () => void;
  playbackSpeed?: number;
  isMuted?: boolean;
  onSpeedChange?: (speed: number) => void;
  onToggleMute?: () => void;
}

export const DesignPage: React.FC<DesignPageProps> = ({
  lines,
  style,
  visualBlocks,
  currentTime,
  totalDuration,
  isPlaying,
  audioBlobUrl,
  trackTitle,
  artistName,
  validation: _validation,
  motionLayers,
  onUpdateStyle,
  onUpdateMotionLayers,
  onApplyPreset,
  onTimeUpdate,
  onPlayPause,
  onRestart,
  onPrevLine,
  onNextLine,
  playbackSpeed,
  isMuted,
  onSpeedChange,
  onToggleMute,
}) => {
  // Collapsible accordion sections
  const [openSections, setOpenSections] = useState({
    presets: true,
    typography: true,
    colors: true,
    texture: false,
    composition: false,
    animation: true,
    animationAdvanced: false,
  });

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const fontOptions = [
    { id: 'Cormorant Garamond', label: 'Cormorant Garamond (Editorial Serif)' },
    { id: 'DM Serif Display', label: 'DM Serif Display (Modern Display)' },
    { id: 'Playfair Display', label: 'Playfair Display (High Contrast Serif)' },
    { id: 'Libre Baskerville', label: 'Libre Baskerville (Book Serif)' },
  ];

  return (
    <div className="workspace-page design-page">
      {/* Left: 9:16 Canvas Stage */}
      <div className="design-preview-column">
        <div className="preview-stage-container">
          <PreviewPlayer
            lines={lines}
            style={style}
            visualBlocks={visualBlocks}
            currentTime={currentTime}
            totalDuration={totalDuration}
            isPlaying={isPlaying}
            audioBlobUrl={audioBlobUrl}
            trackTitle={trackTitle}
            artistName={artistName}
            onTimeUpdate={onTimeUpdate}
            onPlayPause={onPlayPause}
            onRestart={onRestart}
            onPrevLine={onPrevLine}
            onNextLine={onNextLine}
            playbackSpeed={playbackSpeed}
            isMuted={isMuted}
            onSpeedChange={onSpeedChange}
            onToggleMute={onToggleMute}
          />
        </div>
      </div>

      {/* Right: Progressive Style & Motion Controls */}
      <div className="design-controls-column">
        <div className="controls-scrollable">
          <div className="controls-header">
            <h2 className="controls-title">Visual Language</h2>
            <p className="controls-subtitle">
              Refined editorial styling, typography scales, palette harmony, and textures.
            </p>
          </div>

          {/* Section: Editorial Presets */}
          <div className="accordion-section">
            <button
              type="button"
              className="accordion-header"
              onClick={() => toggleSection('presets')}
            >
              <div className="header-left-tag">
                <Palette size={14} />
                <span>Editorial Presets</span>
              </div>
              {openSections.presets ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {openSections.presets && (
              <div className="accordion-content">
                <div className="preset-grid-cards">
                  {Object.keys(STYLE_PRESETS).map((pName) => {
                    const preset = STYLE_PRESETS[pName];
                    const isSelected = style.presetName === pName;
                    return (
                      <div
                        key={pName}
                        className={`preset-card-item ${isSelected ? 'is-active' : ''}`}
                        onClick={() => onApplyPreset(pName)}
                      >
                        <div className="preset-color-strip">
                          <span style={{ backgroundColor: preset.primaryBg }} />
                          <span style={{ backgroundColor: preset.secondaryBg }} />
                          <span style={{ backgroundColor: preset.primaryTextColor }} />
                          <span style={{ backgroundColor: preset.accentColor }} />
                        </div>
                        <div className="preset-meta">
                          <span className="preset-name">{pName}</span>
                          <span className="preset-font">{preset.fontFamily}</span>
                        </div>
                        {isSelected && <Check size={14} className="preset-selected-icon" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Section: Typography */}
          <div className="accordion-section">
            <button
              type="button"
              className="accordion-header"
              onClick={() => toggleSection('typography')}
            >
              <div className="header-left-tag">
                <Type size={14} />
                <span>Typography & Layout</span>
              </div>
              {openSections.typography ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {openSections.typography && (
              <div className="accordion-content">
                <div className="field-group">
                  <label className="field-label">Typeface</label>
                  <select
                    className="select-field"
                    value={style.fontFamily}
                    onChange={(e) => onUpdateStyle({ fontFamily: e.target.value as any })}
                  >
                    {fontOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field-group">
                  <div className="slider-label-row">
                    <span className="field-label">Scale Ratio</span>
                    <span className="slider-value">{Math.round(style.fontSizeRatio * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.75"
                    max="1.4"
                    step="0.05"
                    value={style.fontSizeRatio}
                    onChange={(e) => onUpdateStyle({ fontSizeRatio: parseFloat(e.target.value) })}
                    className="range-slider"
                  />
                </div>

                <div className="field-group">
                  <div className="slider-label-row">
                    <span className="field-label">Line Height</span>
                    <span className="slider-value">{style.lineHeight.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="1.5"
                    step="0.02"
                    value={style.lineHeight}
                    onChange={(e) => onUpdateStyle({ lineHeight: parseFloat(e.target.value) })}
                    className="range-slider"
                  />
                </div>

                <div className="field-group">
                  <span className="field-label">Text Alignment</span>
                  <div className="button-group-segment">
                    <button
                      type="button"
                      className={`segment-btn ${style.textAlign === 'center' ? 'is-active' : ''}`}
                      onClick={() => onUpdateStyle({ textAlign: 'center' })}
                    >
                      Center
                    </button>
                    <button
                      type="button"
                      className={`segment-btn ${style.textAlign === 'left' ? 'is-active' : ''}`}
                      onClick={() => onUpdateStyle({ textAlign: 'left' })}
                    >
                      Left Aligned
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section: Colors & Palettes */}
          <div className="accordion-section">
            <button
              type="button"
              className="accordion-header"
              onClick={() => toggleSection('colors')}
            >
              <div className="header-left-tag">
                <Palette size={14} />
                <span>Color Palette</span>
              </div>
              {openSections.colors ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {openSections.colors && (
              <div className="accordion-content">
                <div className="color-swatch-grid">
                  <div className="color-control-item">
                    <label>Primary Background</label>
                    <div className="color-picker-box">
                      <input
                        type="color"
                        value={style.primaryBg}
                        onChange={(e) => onUpdateStyle({ primaryBg: e.target.value })}
                      />
                      <span className="hex-val">{style.primaryBg}</span>
                    </div>
                  </div>

                  <div className="color-control-item">
                    <label>Secondary Background</label>
                    <div className="color-picker-box">
                      <input
                        type="color"
                        value={style.secondaryBg}
                        onChange={(e) => onUpdateStyle({ secondaryBg: e.target.value })}
                      />
                      <span className="hex-val">{style.secondaryBg}</span>
                    </div>
                  </div>

                  <div className="color-control-item">
                    <label>Primary Lyric Text</label>
                    <div className="color-picker-box">
                      <input
                        type="color"
                        value={style.primaryTextColor}
                        onChange={(e) => onUpdateStyle({ primaryTextColor: e.target.value })}
                      />
                      <span className="hex-val">{style.primaryTextColor}</span>
                    </div>
                  </div>

                  <div className="color-control-item">
                    <label>Secondary Text</label>
                    <div className="color-picker-box">
                      <input
                        type="color"
                        value={style.secondaryTextColor}
                        onChange={(e) => onUpdateStyle({ secondaryTextColor: e.target.value })}
                      />
                      <span className="hex-val">{style.secondaryTextColor}</span>
                    </div>
                  </div>

                  <div className="color-control-item">
                    <label>Accent / Stars</label>
                    <div className="color-picker-box">
                      <input
                        type="color"
                        value={style.accentColor}
                        onChange={(e) => onUpdateStyle({ accentColor: e.target.value })}
                      />
                      <span className="hex-val">{style.accentColor}</span>
                    </div>
                  </div>
                </div>

                <div className="toggle-row">
                  <label className="toggle-label" htmlFor="switch-alt-scenes">
                    <span>Alternating Phrase Scenes</span>
                    <span className="toggle-desc">Switch background color on each lyric phrase</span>
                  </label>
                  <input
                    id="switch-alt-scenes"
                    type="checkbox"
                    checked={style.alternatingScenes}
                    onChange={(e) => onUpdateStyle({ alternatingScenes: e.target.checked })}
                    className="toggle-checkbox"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section: Editorial Texture & Grain */}
          <div className="accordion-section">
            <button
              type="button"
              className="accordion-header"
              onClick={() => toggleSection('texture')}
            >
              <div className="header-left-tag">
                <Sparkles size={14} />
                <span>Paper Grain & Finish</span>
              </div>
              {openSections.texture ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {openSections.texture && (
              <div className="accordion-content">
                <div className="field-group">
                  <div className="slider-label-row">
                    <span className="field-label">Grain Texture</span>
                    <span className="slider-value">{Math.round(style.grainIntensity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.5"
                    step="0.02"
                    value={style.grainIntensity}
                    onChange={(e) => onUpdateStyle({ grainIntensity: parseFloat(e.target.value) })}
                    className="range-slider"
                  />
                </div>

                <div className="field-group">
                  <div className="slider-label-row">
                    <span className="field-label">Vignette Depth</span>
                    <span className="slider-value">{Math.round(style.vignetteIntensity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="0.6"
                    step="0.02"
                    value={style.vignetteIntensity}
                    onChange={(e) => onUpdateStyle({ vignetteIntensity: parseFloat(e.target.value) })}
                    className="range-slider"
                  />
                </div>

                <div className="toggle-row">
                  <label className="toggle-label" htmlFor="switch-star-spark">
                    <span>Decorative 4-Point Star</span>
                    <span className="toggle-desc">Editorial bottom spark mark</span>
                  </label>
                  <input
                    id="switch-star-spark"
                    type="checkbox"
                    checked={style.showStarDecoration}
                    onChange={(e) => onUpdateStyle({ showStarDecoration: e.target.checked })}
                    className="toggle-checkbox"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section: Text Animation & Display */}
          <div className="accordion-section">
            <button
              type="button"
              className="accordion-header"
              onClick={() => toggleSection('animation')}
            >
              <div className="header-left-tag">
                <Sparkles size={14} />
                <span>Lyrics Animation & Display</span>
              </div>
              {openSections.animation ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {openSections.animation && (
              <div className="accordion-content">
                {/* 1. LYRICS TYPE */}
                <div className="capcut-section-block">
                  <div className="capcut-section-header">
                    <span className="capcut-badge capcut-badge-type">1. LYRICS TYPE</span>
                    <span className="capcut-section-title">Content & Display Behavior</span>
                  </div>
                  <p className="capcut-section-desc">
                    Determines how text is arranged and revealed. Typography remains solid, crisp, and predictable without unwanted dancing.
                  </p>
                  <div className="capcut-selector-grid">
                    {LYRICS_TYPE_OPTIONS.map((opt) => {
                      const isActive = (motionLayers.lyricsType || 'word-by-word') === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className={`capcut-chip-btn ${isActive ? 'is-active' : ''}`}
                          onClick={() => {
                            onUpdateMotionLayers({
                              lyricsType: opt.id,
                              textAnimation: opt.id as any,
                            });
                          }}
                        >
                          <span className="chip-label">{opt.label}</span>
                          <span className="chip-desc">{opt.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. LYRICS EFFECT */}
                <div className="capcut-section-block" style={{ marginTop: '16px' }}>
                  <div className="capcut-section-header">
                    <span className="capcut-badge capcut-badge-effect">2. LYRICS EFFECT</span>
                    <span className="capcut-section-title">Visual Motion Layer</span>
                  </div>
                  <p className="capcut-section-desc">
                    Visual motion applied on top of Lyrics Type. Choosing &apos;None&apos; keeps typography 100% static and solid.
                  </p>
                  <div className="capcut-selector-grid effects-grid">
                    {LYRICS_EFFECT_OPTIONS.map((opt) => {
                      const isActive = (motionLayers.lyricsEffect || 'fade') === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          className={`capcut-chip-btn ${isActive ? 'is-active' : ''}`}
                          onClick={() => {
                            onUpdateMotionLayers({
                              lyricsEffect: opt.id,
                            });
                          }}
                        >
                          <span className="chip-label">{opt.label}</span>
                          <span className="chip-desc">{opt.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. EFFECT CONTROLS */}
                <div className="capcut-section-block" style={{ marginTop: '16px' }}>
                  {(motionLayers.lyricsEffect || 'fade') === 'none' ? (
                    <div className="static-typography-banner">
                      <div className="static-banner-title">Solid Typography Active</div>
                      <div className="static-banner-text">
                        No motion effect applied. Typography is rendered completely static, crisp, and locked in place with zero unwanted movement.
                      </div>
                    </div>
                  ) : (
                    <div className="effect-controls-panel">
                      <div className="field-group">
                        <div className="slider-label-row">
                          <span className="field-label">Duration</span>
                          <span className="slider-value">{motionLayers.lyricsEffectConfig?.duration ?? 400}ms</span>
                        </div>
                        <input
                          type="range"
                          min="80"
                          max="800"
                          step="20"
                          value={motionLayers.lyricsEffectConfig?.duration ?? 400}
                          onChange={(e) =>
                            onUpdateMotionLayers({
                              lyricsEffectConfig: {
                                ...motionLayers.lyricsEffectConfig,
                                duration: parseInt(e.target.value),
                              },
                            })
                          }
                          className="range-slider"
                        />
                      </div>

                      <div className="field-group">
                        <div className="slider-label-row">
                          <span className="field-label">Intensity</span>
                          <span className="slider-value">{Math.round((motionLayers.lyricsEffectConfig?.intensity ?? 1.0) * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="0.05"
                          value={motionLayers.lyricsEffectConfig?.intensity ?? 1.0}
                          onChange={(e) =>
                            onUpdateMotionLayers({
                              lyricsEffectConfig: {
                                ...motionLayers.lyricsEffectConfig,
                                intensity: parseFloat(e.target.value),
                              },
                            })
                          }
                          className="range-slider"
                        />
                        <div className="slider-hint">
                          Displacement is relative to font size. 100% is already clearly visible, 200% is a strong accent.
                        </div>
                      </div>

                      <div className="field-group">
                        <div className="slider-label-row">
                          <span className="field-label">Unit Stagger</span>
                          <span className="slider-value">{motionLayers.lyricsEffectConfig?.stagger ?? 40}ms</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="150"
                          step="10"
                          value={motionLayers.lyricsEffectConfig?.stagger ?? 40}
                          onChange={(e) =>
                            onUpdateMotionLayers({
                              lyricsEffectConfig: {
                                ...motionLayers.lyricsEffectConfig,
                                stagger: parseInt(e.target.value),
                              },
                            })
                          }
                          className="range-slider"
                        />
                      </div>

                      {motionLayers.lyricsEffect === 'slide' && (
                        <div className="field-group">
                          <span className="field-label">Direction</span>
                          <div className="button-group-segment" style={{ marginTop: '4px' }}>
                            {(['up', 'down', 'left', 'right'] as const).map((dir) => (
                              <button
                                key={dir}
                                type="button"
                                className={`segment-btn ${(motionLayers.lyricsEffectConfig?.direction || 'up') === dir ? 'is-active' : ''}`}
                                onClick={() =>
                                  onUpdateMotionLayers({
                                    lyricsEffectConfig: {
                                      ...motionLayers.lyricsEffectConfig,
                                      direction: dir,
                                    },
                                  })
                                }
                              >
                                {dir.toUpperCase()}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="field-group">
                        <span className="field-label">Easing</span>
                        <div className="button-group-segment" style={{ marginTop: '4px' }}>
                          {(['ease-out', 'ease-in-out', 'linear', 'spring'] as const).map((ea) => (
                            <button
                              key={ea}
                              type="button"
                              className={`segment-btn ${(motionLayers.lyricsEffectConfig?.easing || 'ease-out') === ea ? 'is-active' : ''}`}
                              onClick={() =>
                                onUpdateMotionLayers({
                                  lyricsEffectConfig: {
                                    ...motionLayers.lyricsEffectConfig,
                                    easing: ea,
                                  },
                                })
                              }
                            >
                              {ea === 'ease-out' ? 'Ease Out' : ea === 'ease-in-out' ? 'In-Out' : ea === 'spring' ? 'Spring' : 'Linear'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
