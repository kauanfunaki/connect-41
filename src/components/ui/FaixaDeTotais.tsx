import Link from "next/link";

export type ItemDeTotal = {
  rotulo: string;
  valor: string;
  /** Classe de cor do valor (`text-danger`, `text-warning`, `text-brand`, `text-fg-muted`). Pinta o ícone junto. */
  tom?: string;
  icone?: React.ReactNode;
  /** Linha de apoio embaixo do valor. */
  detalhe?: string;
  /** Torna o cartão um atalho — em /pagar, "Vencido" abre o recorte de vencidas. */
  href?: string;
  /**
   * O recorte que a lista abaixo está mostrando (07/10/2026). Ganha a borda e o
   * fundo da marca e `aria-current`: antes só a frase "mostrando agora" no
   * detalhe dizia qual era, e o cartão parecia igual aos outros.
   */
  ativo?: boolean;
};

/** A cor do selo do ícone sai do tom do valor, para os dois não brigarem. */
function seloDoTom(tom?: string): string {
  if (tom?.includes("danger")) return "bg-danger/10 text-danger";
  if (tom?.includes("warning")) return "bg-warning/10 text-warning";
  if (tom?.includes("success")) return "bg-success/10 text-success";
  if (tom?.includes("muted")) return "bg-surface-2 text-fg-muted";
  return "bg-brand-subtle text-brand";
}

/**
 * Os números do topo das telas do BPO e do portal.
 *
 * Eram quatro células coladas numa grade de 1px (30/09), e a conferência pediu
 * cartão de verdade: ícone, hover e o valor como a coisa maior do bloco. Com
 * `href`, o cartão vira atalho e sobe no hover; sem, só a borda acende.
 *
 * Mora em `ui/` desde 07/10/2026: nasceu em `financeiro/FiltroDePeriodo.tsx` e
 * hoje serve umas 35 telas de todos os setores (gestão, DP, fiscal, conversas,
 * societário, portal). O endereço antigo segue reexportando. Ela e o
 * `MetricCard` fazem o mesmo papel com o ícone de lados opostos — qual desenho
 * fica é decisão do Kauan.
 */
//
// Quatro por linha só a partir de `xl`, e o valor em 30px só em `2xl`: com a
// sidebar de 240px, numa tela de 1024px cada cartão ficava com ~170px e o valor
// em reais saía cortado ("R$ 14.0…") — visto no polimento de 30/09. Dinheiro
// não se corta; se ainda assim não couber, `c41-cortavel` dá a dica inteira.
// Classes por extenso: o Tailwind não enxerga nome de classe montado em tempo
// de execução. Três cartões (Transferências) ocupam a linha inteira.
const COLUNAS_XL: Record<number, string> = {
  2: "xl:grid-cols-2",
  3: "xl:grid-cols-3",
  4: "xl:grid-cols-4",
  // As cinco situações do processo do Societário: três por linha no meio do
  // caminho, para não deixar um cartão sozinho numa linha de dois.
  5: "md:grid-cols-3 xl:grid-cols-5",
  // A projeção do fluxo de caixa (seis números): três e três no meio, seis numa
  // linha só a partir de `xl` — com quatro, sobravam dois numa segunda linha.
  6: "md:grid-cols-3 xl:grid-cols-6",
};

/** `className` troca o respiro de baixo (padrão `mb-5`): em coluna com `gap`, passe "". */
export function FaixaDeTotais({ itens, className = "mb-5" }: { itens: ItemDeTotal[]; className?: string }) {
  return (
    <div className={`grid grid-cols-2 ${COLUNAS_XL[itens.length] ?? "xl:grid-cols-4"} gap-3 ${className}`.trim()}>
      {itens.map((i) => {
        const conteudo = (
          <>
            <div className="flex items-center justify-between gap-2">
              {/* No celular (02/10/2026), dois cartões por linha deixam ~130px
                  de texto: o rótulo quebra em duas linhas em vez de cortar, o
                  ícone sai e o valor diminui um pouco — era "Aguardan…" e
                  "R$ 33.82…" no portal. */}
              <span className="text-helper leading-snug font-medium text-fg-secondary line-clamp-2 sm:line-clamp-1 c41-cortavel">{i.rotulo}</span>
              {i.icone && (
                <span
                  className={`hidden sm:inline-flex w-8 h-8 rounded-lg items-center justify-center flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4 ${seloDoTom(i.tom)}`}
                >
                  {i.icone}
                </span>
              )}
            </div>
            <span
              className={`block font-display text-[clamp(1.0625rem,4.6vw,1.25rem)] sm:text-title 2xl:text-metric font-semibold tabular-nums leading-tight tracking-[-0.01em] truncate c41-cortavel ${i.tom ?? "text-fg"}`}
            >
              {i.valor}
            </span>
            {i.detalhe && <span className="block text-micro text-fg-muted truncate">{i.detalhe}</span>}
          </>
        );
        const cls = `group border rounded-lg px-4 py-3.5 flex flex-col gap-1.5 min-w-0 shadow-xs transition-[border-color,box-shadow,transform] duration-150 ${
          i.ativo ? "bg-brand-subtle border-brand/50" : "bg-surface border-border"
        }`;
        // Sem anel de foco próprio: o `:focus-visible` global já desenha o dele,
        // e o `ring` daqui nunca aparecia (perdia para o global).
        return i.href ? (
          <Link
            key={i.rotulo}
            href={i.href}
            aria-current={i.ativo ? "true" : undefined}
            className={`${cls} hover:border-brand/40 hover:-translate-y-0.5 hover:shadow-md`}
          >
            {conteudo}
          </Link>
        ) : (
          <div key={i.rotulo} aria-current={i.ativo ? "true" : undefined} className={`${cls} hover:border-border-strong`}>
            {conteudo}
          </div>
        );
      })}
    </div>
  );
}
