import type { ReactNode } from "react";

/**
 * O par cartão/tabela das listas do financeiro.
 *
 * Abaixo de `md` a lista vira uma pilha de cartões; de `md` para cima, a tabela
 * de sempre. Os dois mostram o mesmo dado de propósito: a tabela mostra tudo, o
 * cartão escolhe o que cabe na largura de um celular.
 *
 * Quando usar: tabela com `min-w` maior que a tela do celular e uma coluna que é
 * o motivo da visita (o valor, quase sempre) — rolar de lado até ela é pior que
 * não ter as outras colunas. Quando **não** usar: grade de número que só
 * significa lado a lado (DRE, fluxo de caixa, conciliação, prévia de CSV) —
 * ali a rolagem lateral é a leitura certa, e cartão desmancha a comparação.
 */
export function CartoesNoCelular({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`md:hidden flex flex-col gap-2 ${className}`}>{children}</div>;
}

/**
 * `padrao` põe a tabela no padrão do Connect (a de Empresas): casco com borda,
 * cabeçalho com fundo e respiro nas pontas — sem mexer nas classes de cada
 * célula. As regras estão em `.c41-tabela` (globals.css) e valem só para a
 * tabela principal, não para as de dentro de uma célula.
 */
export function TabelaNoDesktop({ children, className = "", padrao = false }: { children: ReactNode; className?: string; padrao?: boolean }) {
  const casco = padrao ? "c41-tabela bg-surface border border-border rounded-lg" : "";
  return <div className={`overflow-x-auto hidden md:block ${casco} ${className}`.trim()}>{children}</div>;
}

export function Cartao({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`bg-surface border border-border rounded-lg px-3 py-2.5 ${className}`}>{children}</div>;
}

/** A primeira linha do cartão: o nome à esquerda, o valor à direita. É o par que se lê primeiro. */
export function TopoDoCartao({ nome, valor }: { nome: ReactNode; valor?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="font-medium break-words">{nome}</span>
      {valor !== undefined && <span className="tabular-nums font-semibold whitespace-nowrap">{valor}</span>}
    </div>
  );
}

/** Linha secundária do cartão — o que na tabela seria uma coluna estreita. */
export function InfoDoCartao({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`block text-[11.5px] text-fg-muted break-words ${className}`}>{children}</span>;
}

/** A faixa de selos e ações no pé do cartão. */
export function PeDoCartao({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 mt-2">{children}</div>;
}
