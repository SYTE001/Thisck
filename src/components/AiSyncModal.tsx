import React, { useEffect, useRef, useState } from 'react';
import { X, Sparkles, Cpu, Cloud, Loader2, AlertTriangle, CheckCircle2, ClipboardCheck } from 'lucide-react';
import type { AlignerEngine, ApiProvider } from '../lib/sync/ai-aligner';
import type { SyncDraft } from '../lib/sync/forced-alignment';

/**
 * AI AUTO SYNC MODAL (PRD Modules 4, 18, 23)
 *
 * Three stages:
 *   1. Config — engine choice (on-device worker vs bring-your-own-key API).
 *   2. Progress — named pipeline stages with a Cancel that terminates the
 *      worker / aborts the request. The timeline is never touched mid-run.
 *   3. Review (PRD §18) — the SYNC DRAFT: overall confidence, high-confidence
 *      vs review-required line counts, validation errors and warnings. The
 *      user explicitly Applies (commits to the timeline) or Discards.
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
  /** Present when a run finished — switches the modal into review mode. */
  draft: SyncDraft | null;
  lineCount: number;
  hasAudioFile: boolean;
  onStart: (config: AiSyncRunConfig) => void;
  onCancel: () => void;
  onApply: () => void;
  onDiscard: () => void;
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
  draft,
  lineCount,
  hasAudioFile,
  onStart,
  onCancel,
  onApply,
  onDiscard,
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

  const reviewing = !running && draft !== null;
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
          {/* ── Stage 3: Sync draft review (PRD §18/§23) ── */}
          {reviewing && (
            <div className="ai-sync-review">
              <div className="ai-sync-review-head">
                <CheckCircle2 size={18} className="ai-sync-review-ok" />
                <div>
                  <strong>Sync result ready</strong>
                  <p className="ai-sync-review-sub">
                    {draft.method === 'distributed'
                      ? 'No vocal evidence was found — timing was distributed evenly.'
                      : draft.method === 'word_alignment+drift'
                        ? 'Word-level alignment with drift correction applied.'
                        : 'Word-level alignment complete.'}
                    {draft.cached ? ' (cached transcription re-used)' : ''}
                  </p>
                </div>
              </div>

              <div className="ai-sync-review-stats">
                <div className="ai-sync-stat">
                  <span className="ai-sync-stat-value">{Math.round(draft.overallConfidence * 100)}%</span>
                  <span className="ai-sync-stat-label">Overall confidence</span>
                </div>
                <div className="ai-sync-stat">
                  <span className="ai-sync-stat-value">{draft.stats.highConfidenceLines}</span>
                  <span className="ai-sync-stat-label">High confidence lines</span>
                </div>
                <div className="ai-sync-stat">
                  <span className={`ai-sync-stat-value ${draft.stats.needsReviewLineCount > 0 ? 'is-warn' : ''}`}>
                    {draft.stats.needsReviewLineCount}
                  </span>
                  <span className="ai-sync-stat-label">Review required</span>
                </div>
              </div>

              <p className="ai-sync-review-meta">
                {draft.stats.matchedWordCount}/{draft.stats.recognizedWordCount} recognised words
                matched ({Math.round(draft.stats.matchRate * 100)}%).
                {draft.driftCorrectionSec > 0 &&
                  ` Drift correction moved timings by up to ${Math.round(draft.driftCorrectionSec * 1000)} ms.`}
              </p>

              {!draft.validation.valid && (
                <div className="ai-sync-review-issues is-errors">
                  <AlertTriangle size={13} />
                  <div>
                    {draft.validation.errors.slice(0, 5).map((e, i) => (
                      <p key={i}>{e.message}</p>
                    ))}
                  </div>
                </div>
              )}
              {draft.validation.warnings.length > 0 && (
                <div className="ai-sync-review-issues">
                  <ClipboardCheck size={13} />
                  <div>
                    {draft.validation.warnings.slice(0, 4).map((w, i) => (
                      <p key={i}>{w.message}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Stage 1: config ── */}
          {!running && !error && !reviewing && (
            <>
              <p className="ai-sync-intro">
                Generates precise line and word timestamps by matching{' '}
                <strong>{lineCount}</strong> lyric line{lineCount === 1 ? '' : 's'} against the
                audio. Your original text is preserved exactly, and the result is reviewed before
                anything is applied.
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

          {/* ── Stage 2: progress ── */}
          {(running || (!error && percent > 0 && !reviewing)) && (
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
          ) : reviewing ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={onDiscard}>
                Discard
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onApply}
                disabled={!draft.validation.valid}
                title={
                  draft.validation.valid
                    ? 'Apply the synced timings to your timeline'
                    : 'Validation failed — discard this draft and re-run the sync'
                }
              >
                <CheckCircle2 size={13} />
                Apply to Timeline
              </button>
            </>
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
