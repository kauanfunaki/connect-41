"use client";

import { createContext, useCallback, useContext, useState } from "react";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; message: string };

type ToastContextValue = {
  show: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

// Hook para disparar toasts de qualquer client component sob o ToastProvider.
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa estar dentro de <ToastProvider>");
  return ctx;
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, kind, message }]);
      setTimeout(() => remove(id), 5000);
    },
    [remove]
  );

  const value: ToastContextValue = {
    show,
    success: (m) => show(m, "success"),
    error: (m) => show(m, "error"),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]">
        {toasts.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => remove(t.id)}
            className={`text-left rounded-md border px-3.5 py-2.5 text-[13px] shadow-md transition-all animate-[toast-in_120ms_ease-out] ${STYLES[t.kind]}`}
          >
            {t.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const STYLES: Record<ToastKind, string> = {
  success: "bg-success/10 text-success border-success/30",
  error:   "bg-danger/10 text-danger border-danger/30",
  info:    "bg-surface border-border text-fg",
};
