'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  message: string;
  variant: ToastVariant;
}

interface ToastItem extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  show: (toast: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_META: Record<
  ToastVariant,
  { border: string; iconClass: string; label: string }
> = {
  success: {
    border: 'border-brand-green',
    iconClass: 'text-brand-green',
    label: 'Success',
  },
  error: {
    border: 'border-red-500',
    iconClass: 'text-red-500',
    label: 'Error',
  },
  info: { border: 'border-sky-400', iconClass: 'text-sky-400', label: 'Info' },
  warning: {
    border: 'border-yellow-400',
    iconClass: 'text-yellow-400',
    label: 'Warning',
  },
};

function generateToastId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastTimers = useRef<Record<string, number>>({});

  const removeToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timeoutId = toastTimers.current[id];
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      delete toastTimers.current[id];
    }
  }, []);

  const show = useCallback(
    (toast: ToastOptions) => {
      const id = generateToastId();
      setToasts((current) => {
        const next = [...current, { id, ...toast }];
        if (next.length > 3) {
          const [oldest, ...rest] = next;
          const oldestTimer = toastTimers.current[oldest.id];
          if (oldestTimer) {
            window.clearTimeout(oldestTimer);
            delete toastTimers.current[oldest.id];
          }
          return rest;
        }
        return next;
      });

      toastTimers.current[id] = window.setTimeout(() => {
        removeToast(id);
      }, 4000);
    },
    [removeToast],
  );

  useEffect(() => {
    return () => {
      Object.values(toastTimers.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      toastTimers.current = {};
    };
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-end px-4 sm:px-6">
        <div className="flex w-full max-w-sm flex-col gap-3">
          {toasts.map((toast) => {
            const meta = VARIANT_META[toast.variant];
            return (
              <div
                key={toast.id}
                role="alert"
                aria-live="polite"
                className={`pointer-events-auto flex items-start gap-3 rounded-xl border border-gray-800 border-l-4 bg-brand-card p-4 shadow-2xl ${meta.border}`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5">
                  <span
                    className={`${meta.iconClass} text-lg`}
                    aria-hidden="true"
                  >
                    {toast.variant === 'success' && '✓'}
                    {toast.variant === 'error' && '✕'}
                    {toast.variant === 'info' && 'ℹ'}
                    {toast.variant === 'warning' && '⚠'}
                  </span>
                </div>
                <div className="flex-1 text-sm leading-6 text-gray-200">
                  <p className="font-semibold text-white">{meta.label}</p>
                  <p>{toast.message}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  aria-label="Dismiss notification"
                  className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-700 bg-gray-900 text-gray-400 transition hover:bg-gray-800 hover:text-white"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
