import type { ReactNode } from "react";

/**
 * O casco da lista com a barra no topo (revisão de 05/10/2026, opção B
 * escolhida pelo Kauan): à esquerda quantos itens a lista tem — e o total,
 * quando é dinheiro —; à direita a busca e o botão Filtros, com as etiquetas
 * do que está filtrado. Substitui a fileira em que o Filtros ficava sozinho
 * entre o topo da tela e a tabela.
 *
 * - No computador, barra e tabela são um cartão só: o casco desenha borda,
 *   fundo e sombra, e a tabela de dentro (`TabelaNoDesktop padrao` ou o div
 *   `.c41-tabela` escrito à mão) perde os dela (globals.css, `.c41-casco`).
 * - No celular a tabela vira cartões soltos (`CartoesNoCelular`), então a
 *   barra fica num cartão próprio em cima deles.
 * - A lista vazia entra no mesmo casco: a barra continua à vista, e é nela que
 *   se tira o filtro que esvaziou a lista.
 *
 * Quando **não** usar: filtro que comanda a tela inteira (DRE, painel da
 * Gestão, relatórios) e lista em cartões sem tabela — ali o Filtros segue
 * fora de casco.
 */
export function CascoDaTabela({
  contagem,
  total,
  busca,
  filtros,
  acoes,
  children,
  className = "",
}: {
  /** "38 contas" — o que a lista tem agora, já com os filtros. Ver `contarItens`. */
  contagem?: ReactNode;
  /** O valor somado da lista, quando ela é de dinheiro. */
  total?: ReactNode;
  busca?: ReactNode;
  /** O `FiltrosDaTela` com `naBarra` — o botão e as etiquetas. */
  filtros?: ReactNode;
  /** Ação da lista inteira (ex.: período, exportar), à direita dos filtros. */
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const temResumo = Boolean(contagem || total);
  const temControles = Boolean(busca || filtros || acoes);
  return (
    <div className={`c41-casco ${className}`.trim()}>
      <div className="c41-casco-barra flex flex-wrap items-center gap-x-4 gap-y-2 min-h-[52px] px-4 py-2.5 mb-2 bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)]">
        {temResumo && (
          <p className="flex flex-wrap items-baseline gap-x-2 min-w-0 text-[length:var(--fs-ui)]">
            {contagem && <span className="font-semibold text-fg">{contagem}</span>}
            {total && <span className="text-fg-muted tabular-nums">{total}</span>}
          </p>
        )}
        {temControles && (
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2 min-w-0">
            {busca}
            {filtros}
            {acoes}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * "1 conta", "38 contas", "500+ solicitações" — a contagem da barra.
 * `limitado` é o aviso da consulta de que parou no teto: a lista tem mais do
 * que mostra.
 */
const NUMERO = new Intl.NumberFormat("pt-BR");

export function contarItens(n: number, um: string, varios: string, limitado = false): string {
  const numero = NUMERO.format(n);
  if (limitado) return `${numero}+ ${varios}`;
  return `${numero} ${n === 1 ? um : varios}`;
}
