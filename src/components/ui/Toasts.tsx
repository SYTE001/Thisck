import { useEffect, useState } from 'react';
import { CheckCircle2, Info, AlertTriangle, AlertOctagon, X } from 'lucide-react';
import {
  type ToastMessage,
  dismissToast,
  getToasts,
  subscribeToasts,
} from '../../lib/ui/toast-bus';

/**
 * Toast host — PRD Section 19.
 * Renders notifications raised through the toast bus. Mount once at app root.
 */

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertOctagon,
};

export function ToastHost() {
  const [items, setItems] = useState<ToastMessage[]>(() => getToasts());

  useEffect(() => subscribeToasts(setItems), []);

  useEffect(() => {
    const timers = items
      .filter((t) => t.durationMs > 0)
      .map((t) => setTimeout(() => dismissToast(t.id), t.durationMs));
    return () => timers.forEach(clearTimeout);
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div className="toast-host" role="region" aria-label="Notifications" aria-live="polite">
      {items.map((t) => {
        const Icon = ICONS[t.severity];
        return (
          <div key={t.id} className={`toast toast-${t.severity}`} role="status">
            <Icon size={16} className="toast-icon" />
            <div className="toast-body">
              <strong className="toast-title">{t.title}</strong>
              {t.detail && <span className="toast-detail">{t.detail}</span>}
            </div>
            <button
              type="button"
              className="toast-close"
              aria-label="Dismiss notification"
              onClick={() => dismissToast(t.id)}
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
