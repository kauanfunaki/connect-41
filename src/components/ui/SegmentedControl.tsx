"use client";

import Link from "next/link";

// Genérico em `K` para que a união de chaves do call-site chegue inteira no
// `onChange`: com `key: string`, o `setView` do quadro exigia um `as` de volta
// para "board" | "list" — cast é exatamente o que um componente de biblioteca
// não deveria obrigar quem o usa a escrever.
export type SegmentItem<K extends string = string> = {
  key: K;
  label: string;
  icon?: React.ReactNode;
  /** Texto de apoio no hover — o que a opção significa, quando o rótulo não basta. */
  title?: string;
  /** Só no modo botão. O segmento ativo já vem desabilitado sozinho. */
  disabled?: boolean;
};

type Comum<K extends string> = {
  /** `key` do segmento ativo. */
  active: K;
  /** Do que é o grupo ("Visão da agenda") — vira o rótulo dele no leitor de tela. */
  label: string;
  /**
   * Como o segmento ativo se pinta.
   *
   * `neutral` (padrão) é o troca-visão: Lista/Quadro, Dia/Semana/Mês. A opção
   * escolhida é uma preferência de quem olha, some ao recarregar, e um destaque
   * colorido só competiria com o conteúdo.
   *
   * `brand` é o grava-valor: o segmento ativo **é um dado do registro**, e
   * precisa ser legível de relance na ficha inteira. É o destino de um
   * documento fiscal, não a aba em que você estava.
   */
  tone?: "neutral" | "brand";
  className?: string;
};

type PorEstado<K extends string> = Comum<K> & {
  items: SegmentItem<K>[];
  onChange: (key: K) => void;
};

type PorUrl<K extends string> = Comum<K> & {
  /** Com `href`, o segmento vira <Link>: mesmo desenho, estado na URL. */
  items: (SegmentItem<K> & { href: string })[];
  onChange?: undefined;
};

// Caixa e segmento vieram medidos dos dois call-sites, que tinham a MESMA
// string de classe palavra por palavra. O divisor vira `first:border-l-0` (a
// versão da agenda) e não "border-l só no segundo" (a do quadro): a primeira
// escala para três segmentos, a segunda não.
const CAIXA = "inline-flex rounded-lg border border-border overflow-hidden flex-shrink-0";
const SEGMENTO =
  "h-8 px-3 flex items-center gap-1.5 text-[12px] font-medium border-l border-border first:border-l-0 transition-colors";
const ATIVO = {
  neutral: "bg-surface-hover text-fg",
  brand: "bg-brand-subtle text-brand",
} as const;
// Sem fundo no hover de propósito: no tom neutro o ativo JÁ é
// `bg-surface-hover`, e um inativo sob o mouse ficaria idêntico a ele.
const INATIVO = "text-fg-muted hover:text-fg";
// Só no modo botão, e só em segmento inativo: o ativo nunca desbota — ele é a
// resposta à pergunta "onde eu estou", e apagá-lo esconderia justamente isso.
const DESABILITADO = "disabled:opacity-[var(--c41-disabled-op)] disabled:cursor-default";

/**
 * Grupo de segmentos: duas ou três opções mutuamente exclusivas, numa caixa só.
 *
 * ─── Por que não é uma variante do `Tabs` ────────────────────────────────────
 *
 * O `Tabs` é `h-10`, com indicador de sublinhado e `border-b` de largura cheia:
 * é a barra de navegação no topo de uma página. Este aqui é `h-8` e vive DENTRO
 * de uma barra de ferramentas, ao lado de um `Input compact`. A diferença é de
 * estrutura, não de tamanho — enfiar os dois no mesmo componente pediria uma
 * prop que troca o desenho inteiro.
 *
 * ─── Os dois modos, e a acessibilidade de cada um ────────────────────────────
 *
 * Item com `href` vira `<Link>` (mesma convenção do `Button`), e aí o estado
 * mora na URL: o certo é `aria-current="page"`. Sem `href` é `<button>` com
 * `onChange`, estado no cliente, e aí é `aria-pressed`.
 *
 * **Nenhum dos dois é `role="tab"`.** A agenda usava `role="tablist"` para
 * links que navegam para URLs diferentes, sem `tabpanel` nenhum do outro lado —
 * um leitor de tela anuncia "aba 1 de 3" e o Home/End do padrão ARIA não faz
 * nada. Links de navegação se marcam com `aria-current`, e é isso que este
 * componente faz.
 *
 * Sem `focus-visible:outline-none`: os dois call-sites originais dependiam do
 * anel padrão do navegador, e trocá-lo por um `ring` seria pior — a caixa tem
 * `overflow-hidden` e recortaria o anel.
 */
export function SegmentedControl<K extends string>({
  items,
  active,
  label,
  tone = "neutral",
  onChange,
  className = "",
}: PorEstado<K> | PorUrl<K>) {
  return (
    <div role="group" aria-label={label} className={`${CAIXA} ${className}`.trim()}>
      {items.map((item) => {
        const ativo = item.key === active;
        const classe = `${SEGMENTO} ${ativo ? ATIVO[tone] : INATIVO}`;
        const conteudo = (
          <>
            {item.icon}
            {item.label}
          </>
        );

        return "href" in item ? (
          <Link
            key={item.key}
            href={item.href}
            title={item.title}
            aria-current={ativo ? "page" : undefined}
            className={classe}
          >
            {conteudo}
          </Link>
        ) : (
          <button
            key={item.key}
            type="button"
            // O ativo NÃO é desabilitado: `disabled` o tiraria da ordem de
            // tabulação, e quem navega por teclado perderia justamente o
            // segmento que responde "onde eu estou". O clique repetido é
            // barrado aqui, sem custo de acessibilidade.
            disabled={item.disabled}
            onClick={() => {
              if (!ativo) onChange?.(item.key);
            }}
            title={item.title}
            aria-pressed={ativo}
            className={`${classe} ${ativo ? "cursor-default" : DESABILITADO}`}
          >
            {conteudo}
          </button>
        );
      })}
    </div>
  );
}
