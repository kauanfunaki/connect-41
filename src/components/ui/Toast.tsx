"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ArrowRight, CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { duracaoDoAviso, entrarNaFila, type TipoDoAviso } from "./filaDeAvisos";

type ToastKind = TipoDoAviso;

/**
 * O aviso que leva a algum lugar (09/11/2026): a notificação nova que chega com
 * a pessoa em outra tela. Tudo opcional — `show(mensagem, tipo)` segue igual.
 */
export type OpcoesDoAviso = {
  /** Linha em negrito acima da mensagem (o tipo da notificação, por exemplo). */
  titulo?: string;
  /** O clique no aviso faz isto e fecha; sem ele, o clique só fecha. */
  aoClicar?: () => void;
  /** O que o clique faz, no fim do aviso: "Abrir". */
  rotuloDoClique?: string;
  /** Avisos do mesmo grupo ficam no máximo 2 na tela; o mais antigo sai. Os sem grupo não contam. */
  grupo?: string;
  /**
   * O desenho do aviso no lugar do ícone do tipo e do texto (10/11/2026): a
   * notificação nova vem com o mesmo rosto e texto do cartão do sino
   * (`AvisoDaNotificacao`). A mensagem segue valendo para o leitor de tela, e
   * o clique e o X continuam do aviso; sem rótulo "Abrir" embaixo.
   */
  corpo?: React.ReactNode;
};

type Toast = { id: number; kind: ToastKind; message: string } & OpcoesDoAviso;

type ToastContextValue = {
  show: (message: string, kind?: ToastKind, opcoes?: OpcoesDoAviso) => void;
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
 * Os avisos que somem sozinhos (5 s; 10 s o de erro; 9 s o clicável; ou no clique).
 *
 * Desde 09/11/2026 o aviso pode levar a algum lugar (`aoClicar`, com o X à
 * parte para só fechar) e entrar num grupo de no máximo 2 (3 até 10/11) — é o
 * caminho das notificações novas do sino (ver `filaDeAvisos.ts`).
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

  // Pausa com o ponteiro em cima ou o foco dentro (auditoria de UX, 30/10/2026):
  // quem está lendo um erro comprido não o vê sumir no meio da frase.
  const [pausado, setPausado] = useState(false);

  const show = useCallback((message: string, kind: ToastKind = "info", opcoes?: OpcoesDoAviso) => {
    const id = nextId++;
    setToasts((prev) => entrarNaFila(prev, { ...opcoes, id, kind, message }));
  }, []);

  const value: ToastContextValue = {
    show,
    success: (m) => show(m, "success"),
    error: (m) => show(m, "error"),
  };

  const item = (t: Toast) => <ItemDoAviso key={t.id} aviso={t} pausado={pausado} onFechar={remove} />;

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        onMouseEnter={() => setPausado(true)}
        onMouseLeave={() => setPausado(false)}
        onFocus={() => setPausado(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPausado(false);
        }}
        className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]"
      >
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

function ItemDoAviso({ aviso, pausado, onFechar }: { aviso: Toast; pausado: boolean; onFechar: (id: number) => void }) {
  // O tempo que falta sobrevive à pausa: voltar do hover não recomeça do zero.
  // O clicável fica mais (`duracaoDoAviso`): dá tempo de ler e decidir abrir.
  const restante = useRef(duracaoDoAviso(aviso.kind, !!aviso.aoClicar));
  useEffect(() => {
    if (pausado) return;
    const inicio = Date.now();
    const id = setTimeout(() => onFechar(aviso.id), restante.current);
    return () => {
      clearTimeout(id);
      restante.current = Math.max(0, restante.current - (Date.now() - inicio));
    };
  }, [pausado, aviso.id, onFechar]);

  const icone = (
    <span aria-hidden className={`flex-shrink-0 mt-px ${COR_DO_ICONE[aviso.kind]}`}>
      {ICONE[aviso.kind]}
    </span>
  );
  const texto = aviso.corpo ? null : (
    <span className="min-w-0">
      {aviso.titulo && <span className="block font-semibold">{aviso.titulo}</span>}
      <span className={aviso.titulo ? "block text-fg-secondary line-clamp-3" : undefined}>{aviso.message}</span>
    </span>
  );

  // O clicável (09/11/2026): o corpo leva à tela e um X à parte só fecha — um
  // botão dentro do outro não existe em HTML, e fechar não pode abrir a tela.
  if (aviso.aoClicar) {
    const aoClicar = aviso.aoClicar;
    return (
      <div className="c41-surgir w-full flex items-start rounded-md border border-border-strong bg-surface-elevated text-ui text-fg shadow-lg">
        <button
          type="button"
          onClick={() => {
            onFechar(aviso.id);
            aoClicar();
          }}
          className={`flex-1 min-w-0 flex items-start text-left rounded-l-md cursor-pointer transition-colors hover:bg-surface-hover ${
            aviso.corpo ? "px-3 py-3" : "gap-2.5 px-3.5 py-2.5"
          }`}
        >
          {aviso.corpo ?? (
            <>
              {icone}
              <span className="min-w-0">
                {texto}
                <span className="mt-1 inline-flex items-center gap-1 text-helper font-medium text-brand">
                  {aviso.rotuloDoClique ?? "Abrir"} <ArrowRight size={12} aria-hidden />
                </span>
              </span>
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => onFechar(aviso.id)}
          aria-label="Fechar aviso"
          title="Fechar"
          className="flex-shrink-0 m-1.5 inline-flex size-7 items-center justify-center rounded-md text-fg-muted cursor-pointer transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onFechar(aviso.id)}
      title="Fechar"
      className={`c41-surgir w-full flex items-start text-left rounded-md border border-border-strong bg-surface-elevated text-ui text-fg shadow-lg ${
        aviso.corpo ? "px-3 py-3" : "gap-2.5 px-3.5 py-2.5"
      }`}
    >
      {aviso.corpo ?? (
        <>
          {icone}
          {texto}
        </>
      )}
    </button>
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
