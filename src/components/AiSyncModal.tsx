import React, { useEffect, useRef, useState } from 'react';
import { X, Sparkles, Cpu, Cloud, Loader2, AlertTriangle } from 'lucide-react';
import type { AlignerEngine, ApiProvider } from '../lib/sync/ai-aligner';

/**
 * AI AUTO SYNC MODAL (PRD Module 4)
 *
 * Drives the forced-alignment run: engine choice (on-device worker vs
 * bring-your-own-key API), a three-stage progress bar, and a Cancel that
 * terminates the worker / aborts the request.
 */

export interface AiSyncRunConfig {
  engine: AlignerEngine;
  apiProvider: ApiProvider;
  apiKey: string;
  language: string;
}

interface AiSyncModalProps {
  open: boolean;
  running: boolean;
  percent: number; // 0..1
  stage: string;
  error: string | null;
  lineCount: number;
  hasAudioFile: boolean;
  onStart: (config: AiSyncRunConfig) => void;
  onCancel: () => void;
  onClose: () => void;
}

const API_KEY_STORAGE = 'thisck.aiSync.apiKey';
const PROVIDER_STORAGE = 'thisck.aiSync.provider';

export const AiSyncModal: React.FC<AiSyncModalProps> = ({
  open,
  running,
  percent,
  stage,
  error,
  lineCount,
  hasAudioFile,
  onStart,
  onCancel,
  onClose,
}) => {
  const [engine, setEngine] = useState<AlignerEngine>('local');
  const [apiProvider, setApiProvider] = useState<ApiProvider>(() =>
    (localStorage.getItem(PROVIDER_STORAGE) as ApiProvider) || 'openai'
  );
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem(API_KEY_STORAGE) || '');
  const [language, setLanguage] = useState<string>('');
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !running) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, running, onClose]);

  if (!open) return null;

  const handleStart = () => {
    if (engine === 'api') {
      localStorage.setItem(API_KEY_STORAGE, apiKey);
      localStorage.setItem(PROVIDER_STORAGE, apiProvider);
    }
    onStart({ engine, apiProvider, apiKey: apiKey.trim(), language: language.trim() });
  };

  const startDisabled =
    running || lineCount === 0 || (engine === 'api' && (!apiKey.trim() || !hasAudioFile));
  const pct = Math.round(Math.min(1, Math.max(0, percent)) * 100);

  return (
    <div
      className="app-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !running) onClose();
      }}
    >
      <div ref={dialogRef} className="app-dialog ai-sync-dialog" role="dialog" aria-modal="true">
        <div className="app-dialog-header">
          <h2 className="app-dialog-title">
            <Sparkles size={16} style={{ marginRight: 6, verticalAlign: '-2px' }} />
            AI Auto Sync — Forced Alignment
          </h2>
          <button
            type="button"
            className="app-dialog-close"
            aria-label="Close"
            onClick={onClose}
            disabled={running}
          >
            <X size={16} />
          </button>
        </div>

        <div className="app-dialog-body">
          {!running && !error && (
            <>
              <p className="ai-sync-intro">
                Generates precise line and word timestamps by matching{' '}
                <strong>{lineCount}</strong> lyric line{lineCount === 1 ? '' : 's'} against the
                audio. Your original text is preserved exactly.
              </p>

              <div className="ai-sync-engine-choice">
                <button
                  type="button"
                  className={`ai-engine-card ${engine === 'local' ? 'is-active' : ''}`}
                  onClick={() => setEngine('local')}
                >
                  <Cpu size={18} />
                  <span className="ai-engine-title">On-Device</span>
                  <span className="ai-engine-desc">
                    Whisper runs in your browser. Private, no key, first run downloads the model.
                  </span>
                </button>
                <button
                  type="button"
                  className={`ai-engine-card ${engine === 'api' ? 'is-active' : ''}`}
                  onClick={() => setEngine('api')}
                >
                  <Cloud size={18} />
                  <span className="ai-engine-title">Fast API (BYOK)</span>
                  <span className="ai-engine-desc">
                    Uses your OpenAI / Groq key. Fastest, audio is sent to the provider.
                  </span>
                </button>
              </div>

              {engine === 'api' && (
                <div className="ai-sync-api-fields">
                  <div className="form-group">
                    <label>Provider</label>
                    <select
                      className="select-field"
                      value={apiProvider}
                      onChange={(e) => setApiProvider(e.target.value as ApiProvider)}
                    >
                      <option value="openai">OpenAI (whisper-1)</option>
                      <option value="groq">Groq (whisper-large-v3)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>API Key</label>
                    <input
                      type="password"
                      className="select-field"
                      placeholder="sk-..."
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      autoComplete="off"
                    />
                    <span className="field-hint">
                      Stored only in this browser (localStorage). Audio is uploaded to the provider.
                    </span>
                  </div>
                  {!hasAudioFile && (
                    <p className="aa-status aa-status-error">
                      <AlertTriangle size={12} /> Re-link the audio file to use API mode.
                    </p>
                  )}
                </div>
              )}

              <div className="form-group">
                <label>Language (optional)</label>
                <input
                  type="text"
                  className="select-field"
                  placeholder="Auto-detect — e.g. en, id, es"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                />
              </div>
            </>
          )}

          {(running || (!error && percent > 0)) && (
            <div className="ai-sync-progress">
              <div className="ai-sync-stage">
                <Loader2 size={14} className={running ? 'spin-animation' : ''} />
                <span>{stage || 'Working...'}</span>
              </div>
              <div className="ai-sync-bar">
                <div className="ai-sync-bar-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="ai-sync-pct">{pct}%</div>
            </div>
          )}

          {error && (
            <p className="aa-status aa-status-error" style={{ marginTop: 12 }}>
              <AlertTriangle size={13} /> {error}
            </p>
          )}
        </div>

        <div className="app-dialog-actions">
          {running ? (
            <button type="button" className="btn btn-danger" onClick={onCancel}>
              Cancel
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleStart}
                disabled={startDisabled}
              >
                <Sparkles size={13} />
                {error ? 'Retry Sync' : 'Start AI Sync'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
