import type { HTMLAttributes, ReactNode } from "react";

type Props = Omit<HTMLAttributes<HTMLDivElement>, "title"> & {
  titulo: ReactNode;
  /** Quantos cartões a coluna tem — vai na pílula do cabeçalho. */
  contagem: number;
  /** Bolinha da cor da etapa, antes do título. */
  cor?: string;
  /** Linha miúda logo abaixo do cabeçalho ("Últimos 30 dias"). */
  nota?: ReactNode;
  /** O que o vazio tracejado diz quando a coluna não tem cartão. */
  vazio: ReactNode;
  /** Algo sendo arrastado por cima — só o quadro do Kanban arrasta. */
  destacada?: boolean;
  /** Nível do título: h3 no quadro (abaixo do nome da lista), h2 onde a coluna é a primeira divisão da tela. */
  tituloComo?: "h2" | "h3";
  children?: ReactNode;
};

/**
 * A casca da coluna de um quadro: cabeçalho de 44px com a contagem em pílula,
 * vazio tracejado e rolagem interna. Saiu do `KanbanBoard` (07/10/2026) para o
 * kanban de processos usar a mesma — ele tinha uma anatomia própria (coluna sem
 * borda, contagem solta, vazio em texto) e, sem rolagem interna, a coluna "Em
 * andamento", para onde foi a maior parte dos processos do Trello, esticava a
 * página inteira.
 *
 * A rolagem só acontece se quem usa limitar a altura (a coluna é `min-h-0`):
 * o quadro do Kanban limita pelo contêiner `h-full`; o de processos, por um
 * `max-h` na própria coluna.
 */
export function ColunaDoQuadro({
  titulo,
  contagem,
  cor,
  nota,
  vazio,
  destacada = false,
  tituloComo: Titulo = "h3",
  children,
  className = "",
  ...rest
}: Props) {
  return (
    <div
      {...rest}
      className={`flex flex-col min-h-0 rounded-lg border transition-[outline-color,background-color] duration-150 ${
        destacada ? "bg-brand-subtle outline outline-2 outline-dashed outline-brand -outline-offset-2 border-transparent" : "border-border bg-canvas"
      } ${className}`.trim()}
    >
      <div className="flex items-center gap-2 px-3 h-11 border-b border-border flex-shrink-0">
        {cor && <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: cor }} />}
        <Titulo className="text-[length:var(--fs-kanban-title)] font-medium text-fg-secondary flex-1 truncate tracking-[-0.005em]">
          {titulo}
        </Titulo>
        <span className="text-[length:var(--fs-micro)] font-semibold text-fg-muted tnum leading-none px-2 py-1 rounded-full bg-surface-hover">
          {contagem}
        </span>
      </div>
      {nota && <p className="px-3 pt-2 text-[length:var(--fs-micro)] text-fg-muted">{nota}</p>}

      <div className="scroll-y flex-1 overflow-y-auto p-2.5 space-y-2 min-h-[100px]">
        {contagem === 0 && (
          <div
            className={`h-16 rounded-lg border-[1.5px] border-dashed flex items-center justify-center text-[length:var(--fs-2)] transition-colors ${
              destacada ? "border-brand text-brand" : "border-border-strong text-fg-muted"
            }`}
          >
            {vazio}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
