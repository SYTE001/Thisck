import React from 'react';
import {
  Sparkles,
  Sliders,
  Palette,
  Type,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
  Info,
} from 'lucide-react';
import type { StyleConfig } from '../types/project';
import type { QualityValidationResult } from '../types/lyrics';
import { STYLE_PRESETS } from '../lib/styles/presets';

interface StylePanelProps {
  style: StyleConfig;
  validation: QualityValidationResult;
  onUpdateStyle: (newStyle: Partial<StyleConfig>) => void;
  onApplyPreset: (presetName: string) => void;
  onSelectIssueLine?: (lineId?: string) => void;
}

export const StylePanel: React.FC<StylePanelProps> = ({
  style,
  validation,
  onUpdateStyle,
  onApplyPreset,
  onSelectIssueLine,
}) => {
  return (
    <aside className="panel style-panel">
      <div className="panel-header">
        <h2 className="panel-title">Style & Validation</h2>
      </div>

      <div className="panel-body">
        {/* Style Presets */}
        <div className="style-section">
          <div className="section-header-row">
            <Palette size={14} />
            <span className="section-subtitle">Editorial Preset</span>
          </div>
          <div className="preset-pill-grid">
            {Object.keys(STYLE_PRESETS).map((pName) => (
              <button
                key={pName}
                type="button"
                className={`preset-pill ${style.presetName === pName ? 'active' : ''}`}
                onClick={() => onApplyPreset(pName)}
              >
                {pName}
              </button>
            ))}
          </div>
        </div>

        {/* Color Controls */}
        <div className="style-section">
          <span className="section-subtitle">Palette Colors</span>
          <div className="color-inputs-grid">
            <div className="color-field">
              <label className="color-label">Primary Bg</label>
              <div className="color-input-wrapper">
                <input
                  type="color"
                  value={style.primaryBg}
                  onChange={(e) => onUpdateStyle({ primaryBg: e.target.value })}
                />
                <span className="color-code">{style.primaryBg}</span>
              </div>
            </div>

            <div className="color-field">
              <label className="color-label">Secondary Bg</label>
              <div className="color-input-wrapper">
                <input
                  type="color"
                  value={style.secondaryBg}
                  onChange={(e) => onUpdateStyle({ secondaryBg: e.target.value })}
                />
                <span className="color-code">{style.secondaryBg}</span>
              </div>
            </div>

            <div className="color-field">
              <label className="color-label">Primary Text</label>
              <div className="color-input-wrapper">
                <input
                  type="color"
                  value={style.primaryTextColor}
                  onChange={(e) => onUpdateStyle({ primaryTextColor: e.target.value })}
                />
                <span className="color-code">{style.primaryTextColor}</span>
              </div>
            </div>

            <div className="color-field">
              <label className="color-label">Secondary Text</label>
              <div className="color-input-wrapper">
                <input
                  type="color"
                  value={style.secondaryTextColor}
                  onChange={(e) => onUpdateStyle({ secondaryTextColor: e.target.value })}
                />
                <span className="color-code">{style.secondaryTextColor}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Typography Controls */}
        <div className="style-section">
          <div className="section-header-row">
            <Type size={14} />
            <span className="section-subtitle">Editorial Typography</span>
          </div>

          <div className="form-group">
            <label className="form-label">Font Family</label>
            <select
              className="form-select"
              value={style.fontFamily}
              onChange={(e) => onUpdateStyle({ fontFamily: e.target.value as any })}
            >
              <option value="Playfair Display">Playfair Display (Display Serif)</option>
              <option value="Cormorant Garamond">Cormorant Garamond (Fine Editorial)</option>
              <option value="DM Serif Display">DM Serif Display (Bold Poster)</option>
              <option value="Libre Baskerville">Libre Baskerville (Classic Book)</option>
            </select>
          </div>

          <div className="form-group">
            <div className="slider-header">
              <span className="form-label">Font Size Scale</span>
              <span className="slider-val">{Math.round(style.fontSizeRatio * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.8}
              max={1.35}
              step={0.05}
              value={style.fontSizeRatio}
              onChange={(e) => onUpdateStyle({ fontSizeRatio: parseFloat(e.target.value) })}
              className="form-range"
            />
          </div>
        </div>

        {/* Texture & Composition */}
        <div className="style-section">
          <div className="section-header-row">
            <Sliders size={14} />
            <span className="section-subtitle">Texture & Scene Motion</span>
          </div>

          <div className="form-group">
            <div className="slider-header">
              <span className="form-label">Paper Grain Intensity</span>
              <span className="slider-val">{Math.round(style.grainIntensity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={0.45}
              step={0.02}
              value={style.grainIntensity}
              onChange={(e) => onUpdateStyle({ grainIntensity: parseFloat(e.target.value) })}
              className="form-range"
            />
          </div>

          <div className="form-group">
            <div className="slider-header">
              <span className="form-label">Vignette Depth</span>
              <span className="slider-val">{Math.round(style.vignetteIntensity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={0.6}
              step={0.05}
              value={style.vignetteIntensity}
              onChange={(e) => onUpdateStyle({ vignetteIntensity: parseFloat(e.target.value) })}
              className="form-range"
            />
          </div>

          <div className="toggle-field">
            <label className="toggle-label" htmlFor="toggle-alternating">
              <span>Alternating Scene Palette</span>
              <span className="toggle-hint">Inverts burgundy / cream per lyric section</span>
            </label>
            <input
              id="toggle-alternating"
              type="checkbox"
              checked={style.alternatingScenes}
              onChange={(e) => onUpdateStyle({ alternatingScenes: e.target.checked })}
              className="form-checkbox"
            />
          </div>

          <div className="toggle-field">
            <label className="toggle-label" htmlFor="toggle-star">
              <span>4-Point Star Decoration</span>
              <span className="toggle-hint">Editorial spark mark at bottom</span>
            </label>
            <input
              id="toggle-star"
              type="checkbox"
              checked={style.showStarDecoration}
              onChange={(e) => onUpdateStyle({ showStarDecoration: e.target.checked })}
              className="form-checkbox"
            />
          </div>
        </div>

        {/* Timeline Quality Check Panel (PRD Section 25) */}
        <div className="style-section quality-section">
          <div className="section-header-row">
            <Sparkles size={14} />
            <span className="section-subtitle">Timeline Quality Check</span>
          </div>

          <div
            className={`quality-status-banner ${
              validation.readyToExport ? 'status-ready' : 'status-issues'
            }`}
          >
            {validation.readyToExport ? (
              <>
                <CheckCircle2 size={16} />
                <span>READY TO EXPORT</span>
              </>
            ) : (
              <>
                <AlertOctagon size={16} />
                <span>
                  {validation.issues.filter((i) => i.blocking).length} ISSUES REQUIRE REVIEW
                </span>
              </>
            )}
          </div>

          {validation.issues.length > 0 && (
            <div className="issues-list">
              {validation.issues.map((iss) => (
                <div
                  key={iss.id}
                  className={`issue-card issue-${iss.type}`}
                  onClick={() => onSelectIssueLine && iss.lineId && onSelectIssueLine(iss.lineId)}
                >
                  <div className="issue-header">
                    {iss.type === 'error' && <AlertOctagon size={12} className="text-rose-400" />}
                    {iss.type === 'warning' && <AlertTriangle size={12} className="text-amber-400" />}
                    {iss.type === 'info' && <Info size={12} className="text-sky-400" />}
                    <span className="issue-msg">{iss.message}</span>
                  </div>
                  <span className="issue-remedy">{iss.remedy}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
