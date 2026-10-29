import Link from "next/link";
import { Contador } from "@/components/ui/Contador";
import { classeDaAba, classeDaFileira, ConteudoDaAba, MarcaDaAbaAtiva } from "@/components/ui/desenhoDaAba";

export type AbaDeLink = {
  chave: string;
  rotulo: string;
  href: string;
  /** Obrigatório desde 29/10/2026: toda aba tem o seu, em cima do rótulo. */
  icone: React.ReactNode;
  /** Vira um contador no canto do ícone — em vez de "Contas · 6" no texto. */
  contagem?: number;
};

/**
 * Abas por link, no desenho das abas de Cadastros (`ui/Tabs`): ícone em cima
 * do rótulo, com a barra embaixo da ativa, sobre uma linha que atravessa a
 * página.
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
  "aria-label": rotuloDaNav = "Abas",
}: {
  abas: AbaDeLink[];
  ativa: string;
  /** Troca o respiro de baixo (padrão `mb-4`). */
  className?: string;
  /** Nomeia a navegação quando a tela empilha mais de uma fileira de abas. */
  "aria-label"?: string;
}) {
  return (
    <nav className={`${classeDaFileira} ${className}`.trim()} aria-label={rotuloDaNav}>
      {abas.map((a) => {
        const ativo = a.chave === ativa;
        // Sem anel próprio: o `:focus-visible` global desenha o dele, e o
        // `ring` que havia aqui nunca aparecia (07/10/2026).
        return (
          <Link key={a.chave} href={a.href} aria-current={ativo ? "page" : undefined} className={classeDaAba(ativo)}>
            <ConteudoDaAba
              icone={a.icone}
              rotulo={a.rotulo}
              contador={a.contagem !== undefined && <Contador valor={a.contagem} tom={ativo ? "marca" : "neutro"} pequeno teto={999} />}
            />
            {ativo && <MarcaDaAbaAtiva />}
          </Link>
        );
      })}
    </nav>
  );
}
