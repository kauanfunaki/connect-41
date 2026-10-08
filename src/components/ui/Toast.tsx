"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";

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

/**
 * Os avisos que somem sozinhos (5 s, ou no clique).
 *
 * Refeitos em 07/10/2026:
 * - **Opacos.** O fundo era só a tinta de 10% do tom, e o conteúdo de baixo
 *   aparecia através do aviso; o texto verde ficava em 2,9:1. Agora a
 *   superfície elevada, o texto no `fg` e a cor do tom no ícone.
 * - **Anunciados.** Duas regiões vivas que existem desde o começo (o leitor de
 *   tela só anuncia o que muda numa região que já estava lá): `status` para
 *   sucesso e informação, `alert` para erro, que interrompe.
 * - **Acima do orbe do Chat de IA,** que mora no mesmo canto (`bottom-4
 *   right-4`, 48px de altura) e ficava coberto: `bottom-20`.
 * - A animação apontava para um `@keyframes toast-in` que nunca existiu; usa o
 *   `c41-surgir` dos painéis.
 */
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

  const item = (t: Toast) => (
    <button
      key={t.id}
      type="button"
      onClick={() => remove(t.id)}
      title="Fechar"
      className="c41-surgir w-full flex items-start gap-2.5 text-left rounded-md border border-border-strong bg-surface-elevated px-3.5 py-2.5 text-ui text-fg shadow-lg"
    >
      <span aria-hidden className={`flex-shrink-0 mt-px ${COR_DO_ICONE[t.kind]}`}>
        {ICONE[t.kind]}
      </span>
      <span className="min-w-0">{t.message}</span>
    </button>
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]">
        {/* As duas regiões ficam montadas e visíveis mesmo vazias (sem
            `hidden`): fora da árvore de acessibilidade, o leitor de tela não
            anuncia o que entra nelas. Vazias, não ocupam altura. */}
        <div role="alert" className="flex flex-col gap-2">
          {toasts.filter((t) => t.kind === "error").map(item)}
        </div>
        <div role="status" className="flex flex-col gap-2">
          {toasts.filter((t) => t.kind !== "error").map(item)}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

const ICONE: Record<ToastKind, React.ReactNode> = {
  success: <CircleCheck size={16} />,
  error: <CircleAlert size={16} />,
  info: <Info size={16} />,
};

const COR_DO_ICONE: Record<ToastKind, string> = {
  success: "text-success-fg",
  error: "text-danger",
  info: "text-brand",
};
