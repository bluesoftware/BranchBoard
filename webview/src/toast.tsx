import { createContext, useCallback, useContext, useRef, useState, ReactNode } from "react";
import { ToastMessage } from "./types";

type PushToast = (kind: ToastMessage["kind"], text: string, detail?: string) => void;

const ToastContext = createContext<PushToast>(() => undefined);

export function useToast(): PushToast {
  return useContext(ToastContext);
}

const ICONS: Record<ToastMessage["kind"], ReactNode> = {
  success: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.7 5.3a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06 0L4.3 8.78a.75.75 0 011.06-1.06l1.56 1.56 3.72-3.72a.75.75 0 011.06 0z" />
    </svg>
  ),
  error: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 4a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 4zm0 7.5A.9.9 0 108 9.7a.9.9 0 000 1.8z" />
    </svg>
  ),
  warning: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8.9 1.5a1 1 0 00-1.8 0L.6 13a1 1 0 00.9 1.5h13a1 1 0 00.9-1.5L8.9 1.5zM8 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 5zm0 7.4a.9.9 0 100-1.8.9.9 0 000 1.8z" />
    </svg>
  ),
  info: (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0a8 8 0 100 16A8 8 0 008 0zm0 3.4a.95.95 0 110 1.9.95.95 0 010-1.9zM9 12H7a.75.75 0 010-1.5h.25V8H7a.75.75 0 010-1.5h1a.75.75 0 01.75.75v3.25H9A.75.75 0 019 12z" />
    </svg>
  ),
};

/**
 * Provides a `useToast()` hook and renders a stack of auto-dismissing toasts in
 * the bottom-right corner. Errors linger longer than success/info messages.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const counter = useRef(0);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback<PushToast>(
    (kind, text, detail) => {
      const id = `t_${++counter.current}`;
      setToasts((prev) => [...prev.slice(-4), { id, kind, text, detail }]);
      const ttl = kind === "error" ? 8000 : kind === "warning" ? 6000 : 4000;
      setTimeout(() => remove(id), ttl);
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="bb-toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`bb-toast ${t.kind}`} onClick={() => remove(t.id)}>
            <span className="bb-toast-icon">{ICONS[t.kind]}</span>
            <div className="bb-toast-text">
              {t.text}
              {t.detail && <div className="bb-toast-detail">{t.detail}</div>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
