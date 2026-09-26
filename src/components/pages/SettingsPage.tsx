import React from 'react';
import { 
  Command, 
  Cpu, 
  Sliders
} from 'lucide-react';
import type { ExportSettings } from '../../types/project';

interface SettingsPageProps {
  exportSettings: ExportSettings;
  onUpdateExportSettings: (settings: Partial<ExportSettings>) => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  exportSettings,
  onUpdateExportSettings,
}) => {
  return (
    <div className="workspace-page settings-page">
      <div className="page-header">
        <div className="page-header-text">
          <span className="page-eyebrow">Preferences & System</span>
          <h1 className="page-title">Application Settings</h1>
          <p className="page-description">
            Configure application defaults, view keyboard shortcut mappings, and review engine architecture.
          </p>
        </div>
      </div>

      <div className="settings-grid">
        {/* Application Defaults */}
        <section className="editorial-card">
          <div className="card-header">
            <div className="card-badge">
              <Sliders size={13} />
              <span>Defaults & Preferences</span>
            </div>
          </div>

          <div className="settings-form">
            <div className="form-group">
              <label>Default Render Framerate</label>
              <select
                className="select-field"
                value={exportSettings.fps}
                onChange={(e) => onUpdateExportSettings({ fps: Number(e.target.value) as any })}
              >
                <option value="60">60 FPS (Silky Smooth Motion)</option>
                <option value="30">30 FPS (Social Media Standard)</option>
                <option value="24">24 FPS (Cinematic Look)</option>
              </select>
              <span className="field-hint">60 FPS provides optimum smoothness for typographic entrance easing.</span>
            </div>

            <div className="form-group">
              <label>Default Output Bitrate</label>
              <select
                className="select-field"
                value={exportSettings.bitrateKbps}
                onChange={(e) => onUpdateExportSettings({ bitrateKbps: Number(e.target.value) })}
              >
                <option value="12000">12,000 kbps (Studio Master)</option>
                <option value="8000">8,000 kbps (High Quality)</option>
                <option value="5000">5,000 kbps (Balanced)</option>
              </select>
              <span className="field-hint">Determines compression quality for WebCodecs H.264 video streams.</span>
            </div>
          </div>
        </section>

        {/* Keyboard Shortcuts Reference */}
        <section className="editorial-card">
          <div className="card-header">
            <div className="card-badge">
              <Command size={13} />
              <span>Keyboard Shortcuts</span>
            </div>
          </div>

          <div className="shortcuts-table">
            <div className="shortcut-row">
              <span className="shortcut-desc">Play / Pause</span>
              <kbd className="shortcut-kbd">Space</kbd>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-desc">Rewind to Start</span>
              <kbd className="shortcut-kbd">Home / 0</kbd>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-desc">Previous Lyric Line</span>
              <kbd className="shortcut-kbd">[</kbd>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-desc">Next Lyric Line</span>
              <kbd className="shortcut-kbd">]</kbd>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-desc">Nudge Active Line Backward (-100ms)</span>
              <kbd className="shortcut-kbd">Alt + ←</kbd>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-desc">Nudge Active Line Forward (+100ms)</span>
              <kbd className="shortcut-kbd">Alt + →</kbd>
            </div>
            <div className="shortcut-row">
              <span className="shortcut-desc">Split Active Line</span>
              <kbd className="shortcut-kbd">S</kbd>
            </div>
          </div>
        </section>

        {/* System & Architecture Info */}
        <section className="editorial-card full-width-card">
          <div className="card-header">
            <div className="card-badge">
              <Cpu size={13} />
              <span>Core Engine Architecture</span>
            </div>
          </div>

          <div className="specs-grid-3">
            <div className="spec-card">
              <h4>Audio-First Master Clock</h4>
              <p>Independent time source decoupling audio duration and lyric timestamps, preventing drift or skipped syllables.</p>
            </div>
            <div className="spec-card">
              <h4>Deterministic Canvas Pipeline</h4>
              <p>Mathematical bezier easing rendered on OffscreenCanvas with frame-exact parity between preview and MP4 output.</p>
            </div>
            <div className="spec-card">
              <h4>WebCodecs & MP4 Muxer</h4>
              <p>Hardware-accelerated client-side video encoding using H.264/AVC with MP4 muxing—zero server dependency.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
