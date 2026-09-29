import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Application confirm dialog — PRD Section 18 & 19 & 22.
 *
 * Replaces the native confirm() with an accessible modal: focus is trapped,
 * Escape closes, the backdrop is inert, and actions are explicit. Supports the
 * three-way "Unsaved changes" prompt (Cancel / Discard / Save) as well as a
 * simple two-way confirm.
 */

export interface DialogAction {
  label: string;
  /** Visual emphasis. */
  variant?: 'primary' | 'secondary' | 'danger';
  onClick: () => void;
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  actions: DialogAction[];
  /** Called on Escape or backdrop click (treated as cancel/dismiss). */
  onDismiss: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  actions,
  onDismiss,
}) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const node = dialogRef.current;
    // Focus the first focusable control in the dialog.
    const focusables = node?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusables?.[0]?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
        return;
      }
      if (e.key === 'Tab' && focusables && focusables.length > 0) {
        // Trap focus within the dialog.
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div
      className="app-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div
        ref={dialogRef}
        className="app-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
      >
        <div className="app-dialog-header">
          <h2 id="app-dialog-title" className="app-dialog-title">
            {title}
          </h2>
          <button
            type="button"
            className="app-dialog-close"
            aria-label="Close dialog"
            onClick={onDismiss}
          >
            <X size={16} />
          </button>
        </div>
        <div className="app-dialog-body">{message}</div>
        <div className="app-dialog-actions">
          {actions.map((action, idx) => (
            <button
              key={idx}
              type="button"
              className={`btn btn-${action.variant ?? 'secondary'}`}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
