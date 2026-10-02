import Link from "next/link";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { CampoMes } from "@/components/ui/CampoMes";
import { Button } from "@/components/ui/Button";

type Props = {
  /** Rota do próprio formulário. */
  acao: string;
  empresas?: { id: string; nome: string }[];
  empresaId?: string | null;
  /** Oferece "Todas as empresas" — telas de consolidado. */
  permitirTodas?: boolean;
  /** "AAAA-MM". Sem valor, o seletor de mês não aparece. */
  mes?: string;
  /** Parâmetros que o filtro precisa carregar (aba, modo…). */
  extras?: Record<string, string | undefined>;
  /** Campos a mais no mesmo formulário (ex.: centro de custo), antes do botão. */
  children?: React.ReactNode;
};

/**
 * Empresa e mês por GET.
 *
 * Formulário comum com botão, e não select que navega sozinho: com quase
 * quatrocentas empresas, quem troca empresa e mês de uma vez não quer duas
 * navegações — e o GET deixa a URL copiável, que é como relatório é mandado
 * para outra pessoa.
 */
export function FiltroDePeriodo({ acao, empresas, empresaId, permitirTodas, mes, extras, children }: Props) {
  return (
    <form method="get" action={acao} className="flex flex-wrap items-center gap-2 mb-4">
      {Object.entries(extras ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      {empresas && (
        // Com busca, e não `<select>`: a lista de empresas é longa (quase
        // quatrocentas no escritório), a mesma regra do cadastro de empresas.
        <SearchableSelect
          key={empresaId ?? ""}
          name="empresa"
          compact
          className="w-72 max-w-full"
          aria-label="Empresa"
          options={empresas.map((e) => ({ value: e.id, label: e.nome }))}
          defaultValue={empresaId ?? ""}
          vazioLabel={permitirTodas ? "Todas as empresas" : undefined}
          placeholder="Buscar empresa…"
        />
      )}
      {mes !== undefined && (
        <CampoMes compact name="mes" defaultValue={mes} className="w-40" aria-label="Mês" />
      )}
      {children}
      <Button type="submit" variant="secondary" size="sm">
        Aplicar
      </Button>
    </form>
  );
}

/**
 * Abas por link, no desenho das abas de Cadastros (`ui/Tabs`): texto com a
 * barra embaixo da ativa, sobre uma linha que atravessa a página.
 *
 * Até 30/09 eram pílulas com borda — o mesmo desenho dos filtros logo abaixo,
 * e a conferência do Kauan apontou que ninguém distinguia "troca a tela" de
 * "filtra a lista". Aba é isto; filtro é o botão "Filtros" (`FiltrosDaTela`).
 */
export function AbasDeLink({
  abas,
  ativa,
}: {
  /** `contagem` vira um selo ao lado do rótulo — em vez de "Contas · 6" no texto. */
  abas: { chave: string; rotulo: string; href: string; icone?: React.ReactNode; contagem?: number }[];
  ativa: string;
}) {
  return (
    <nav className="scroll-x-hidden flex items-center gap-1 border-b border-border overflow-x-auto mb-4" aria-label="Abas">
      {abas.map((a) => {
        const ativo = a.chave === ativa;
        return (
          <Link
            key={a.chave}
            href={a.href}
            aria-current={ativo ? "page" : undefined}
            className={`relative flex items-center gap-1.5 px-3.5 h-10 text-[length:var(--fs-label)] font-medium whitespace-nowrap transition-colors rounded-t-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
              ativo ? "text-brand" : "text-fg-secondary hover:text-fg hover:bg-surface-hover"
            }`}
          >
            {a.icone && <span className="flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4">{a.icone}</span>}
            {a.rotulo}
            {a.contagem !== undefined && (
              <span
                className={`inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[length:var(--fs-micro)] font-semibold tabular-nums ${
                  ativo ? "bg-brand/10 text-brand" : "bg-surface-2 text-fg-muted"
                }`}
              >
                {a.contagem}
              </span>
            )}
            {ativo && <span className="absolute left-2.5 right-2.5 -bottom-px h-[2px] rounded-full bg-brand" />}
          </Link>
        );
      })}
    </nav>
  );
}

type ItemDeTotal = {
  rotulo: string;
  valor: string;
  /** Classe de cor do valor (`text-danger`, `text-warning`, `text-brand`, `text-fg-muted`). Pinta o ícone junto. */
  tom?: string;
  icone?: React.ReactNode;
  /** Linha de apoio embaixo do valor. */
  detalhe?: string;
  /** Torna o cartão um atalho — em /pagar, "Vencido" abre o recorte de vencidas. */
  href?: string;
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
};

/** `className` troca o respiro de baixo (padrão `mb-5`): em coluna com `gap`, passe "". */
export function FaixaDeTotais({ itens, className = "mb-5" }: { itens: ItemDeTotal[]; className?: string }) {
  return (
    <div className={`grid grid-cols-2 ${COLUNAS_XL[itens.length] ?? "xl:grid-cols-4"} gap-3 ${className}`.trim()}>
      {itens.map((i) => {
        const conteudo = (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[length:var(--fs-helper)] font-medium text-fg-muted truncate c41-cortavel">{i.rotulo}</span>
              {i.icone && (
                <span
                  className={`inline-flex w-8 h-8 rounded-lg items-center justify-center flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4 ${seloDoTom(i.tom)}`}
                >
                  {i.icone}
                </span>
              )}
            </div>
            <span
              className={`block font-display text-[length:var(--fs-title)] 2xl:text-[length:var(--fs-metric)] font-semibold tabular-nums leading-tight tracking-[-0.01em] truncate c41-cortavel ${i.tom ?? "text-fg"}`}
            >
              {i.valor}
            </span>
            {i.detalhe && <span className="block text-[length:var(--fs-micro)] text-fg-muted truncate">{i.detalhe}</span>}
          </>
        );
        const cls =
          "group bg-surface border border-border rounded-lg px-4 py-3.5 flex flex-col gap-1.5 min-w-0 shadow-[var(--c41-shadow-xs)] transition-[border-color,box-shadow,transform] duration-150";
        return i.href ? (
          <Link
            key={i.rotulo}
            href={i.href}
            className={`${cls} hover:border-brand/40 hover:-translate-y-0.5 hover:shadow-[var(--c41-shadow-md)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40`}
          >
            {conteudo}
          </Link>
        ) : (
          <div key={i.rotulo} className={`${cls} hover:border-border-strong`}>
            {conteudo}
          </div>
        );
      })}
    </div>
  );
}
