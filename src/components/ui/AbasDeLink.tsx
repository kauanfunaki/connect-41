import Link from "next/link";
import { Contador } from "@/components/ui/Contador";

export type AbaDeLink = {
  chave: string;
  rotulo: string;
  href: string;
  icone?: React.ReactNode;
  /** Vira um contador ao lado do rótulo — em vez de "Contas · 6" no texto. */
  contagem?: number;
};

/**
 * Abas por link, no desenho das abas de Cadastros (`ui/Tabs`): texto com a
 * barra embaixo da ativa, sobre uma linha que atravessa a página.
 *
 * Até 30/09 eram pílulas com borda — o mesmo desenho dos filtros logo abaixo,
 * e a conferência do Kauan apontou que ninguém distinguia "troca a tela" de
 * "filtra a lista". Aba é isto; filtro é o botão "Filtros" (`FiltrosDaTela`).
 *
 * Mora em `ui/` desde 07/10/2026 (nasceu em `financeiro/FiltroDePeriodo.tsx`,
 * que segue reexportando): são as abas que valem para 19 telas, de vários
 * setores. Navegam por URL, então marcam a ativa com `aria-current="page"` —
 * não com `role="tab"`, que pediria um `tabpanel` do outro lado.
 */
export function AbasDeLink({
  abas,
  ativa,
  className = "mb-4",
}: {
  abas: AbaDeLink[];
  ativa: string;
  /** Troca o respiro de baixo (padrão `mb-4`). */
  className?: string;
}) {
  return (
    <nav className={`scroll-x-hidden flex items-center gap-1 border-b border-border overflow-x-auto ${className}`.trim()} aria-label="Abas">
      {abas.map((a) => {
        const ativo = a.chave === ativa;
        // Sem anel próprio: o `:focus-visible` global desenha o dele, e o
        // `ring` que havia aqui nunca aparecia (07/10/2026).
        return (
          <Link
            key={a.chave}
            href={a.href}
            aria-current={ativo ? "page" : undefined}
            className={`relative flex items-center gap-1.5 px-3.5 h-10 text-label font-medium whitespace-nowrap transition-colors rounded-t-md ${
              ativo ? "text-brand" : "text-fg-secondary hover:text-fg hover:bg-surface-hover"
            }`}
          >
            {a.icone && <span className="flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4">{a.icone}</span>}
            {a.rotulo}
            {a.contagem !== undefined && <Contador valor={a.contagem} tom={ativo ? "marca" : "neutro"} teto={Number.MAX_SAFE_INTEGER} />}
            {ativo && <span className="absolute left-2.5 right-2.5 -bottom-px h-[2px] rounded-full bg-brand" />}
          </Link>
        );
      })}
    </nav>
  );
}
