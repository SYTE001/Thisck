/**
 * Toast bus — PRD Section 19.
 *
 * A tiny module-level pub/sub so any module (components or plain logic) can
 * raise a toast without prop-drilling. Kept separate from the <ToastHost/>
 * component so the component file only exports components.
 */

export type ToastSeverity = 'info' | 'success' | 'warning' | 'error';

export interface ToastMessage {
  id: string;
  severity: ToastSeverity;
  title: string;
  detail?: string;
  /** Auto-dismiss after this many ms (0 = sticky). */
  durationMs: number;
}

type Listener = (toasts: ToastMessage[]) => void;

const listeners = new Set<Listener>();
let current: ToastMessage[] = [];

function emit() {
  const snapshot = current;
  for (const l of listeners) l(snapshot);
}

function push(severity: ToastSeverity, title: string, detail?: string, durationMs = 6000) {
  const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  current = [...current, { id, severity, title, detail, durationMs }];
  emit();
  return id;
}

export function dismissToast(id: string) {
  current = current.filter((t) => t.id !== id);
  emit();
}

export function getToasts(): ToastMessage[] {
  return current;
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Imperative API usable from anywhere. */
export const toast = {
  info: (title: string, detail?: string) => push('info', title, detail),
  success: (title: string, detail?: string) => push('success', title, detail),
  warning: (title: string, detail?: string) => push('warning', title, detail),
  error: (title: string, detail?: string) => push('error', title, detail, 8000),
};
