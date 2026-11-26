import type { DefinicaoDaCor } from "@/lib/kanban/capa";

/**
 * A capa no topo do cartão, como no Trello (27/11/2026, funcionalidade-845):
 * largura toda, 28px de altura, os cantos de cima acompanhando o cartão (quem
 * usa põe `overflow-hidden` no cartão e encosta a faixa nas bordas).
 *
 * Com `texto` (o nome do tipo de processo), a faixa escreve o nome — a cor
 * nunca fala sozinha. Sem texto (a capa escolhida no cartão), o nome da cor vai
 * para o leitor de tela e para a dica do mouse.
 */
export function FaixaDaCapa({ cor, texto, className = "" }: { cor: DefinicaoDaCor; texto?: string; className?: string }) {
  return (
    <div
      className={`flex h-7 flex-shrink-0 items-center px-3 shadow-[inset_0_-1px_0_rgb(0_0_0/0.10)] ${className}`.trim()}
      style={{ background: cor.fundo, color: cor.tinta }}
      title={texto ?? `Capa: ${cor.nome}`}
    >
      {texto ? (
        <span className="truncate text-micro font-semibold">{texto}</span>
      ) : (
        <span className="sr-only">Capa: {cor.nome}</span>
      )}
    </div>
  );
}

/**
 * A mesma cor numa etiqueta cheia, para onde a faixa não cabe — a linha da
 * fila de processos e o cabeçalho do processo. Sempre com o nome escrito.
 */
export function EtiquetaDaCor({ cor, children, className = "" }: { cor: DefinicaoDaCor; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex max-w-full items-center whitespace-nowrap rounded-full px-2.5 py-[3px] text-badge font-semibold leading-4 ${className}`.trim()}
      style={{ background: cor.fundo, color: cor.tinta }}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}
