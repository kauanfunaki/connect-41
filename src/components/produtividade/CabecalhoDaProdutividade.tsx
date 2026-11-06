import { GitBranch, LayoutDashboard, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { ROTAS_DA_PRODUTIVIDADE, type AbaDaProdutividade } from "@/lib/tech-interno/rotasDaProdutividade";

/**
 * O título e as abas da Produtividade: Painel, Pessoas e GitHub (06/11/2026;
 * o Painel era "Time"). Sem hook — serve à tela do servidor (Painel) e ao
 * painel cliente do GitHub (Pessoas e GitHub). O período do Painel fica no
 * Painel: Pessoas e GitHub têm o período deles (De/Até).
 */
export function CabecalhoDaProdutividade({
  aba,
  subtitulo,
  periodo,
  acao,
}: {
  aba: AbaDaProdutividade;
  subtitulo: string;
  /** O `?periodo=` do Painel, quando não é o padrão — para voltar a ele com o mesmo período. */
  periodo?: string;
  acao?: React.ReactNode;
}) {
  const q = periodo ? `?periodo=${encodeURIComponent(periodo)}` : "";
  return (
    <>
      <PageHeader title="Produtividade" subtitle={subtitulo} action={acao} />
      <AbasDeLink
        className="mb-6"
        aria-label="Produtividade"
        ativa={aba}
        abas={[
          { chave: "painel", rotulo: "Painel", href: `${ROTAS_DA_PRODUTIVIDADE.painel}${q}`, icone: <LayoutDashboard /> },
          { chave: "pessoas", rotulo: "Pessoas", href: ROTAS_DA_PRODUTIVIDADE.pessoas, icone: <Users /> },
          { chave: "github", rotulo: "GitHub", href: ROTAS_DA_PRODUTIVIDADE.github, icone: <GitBranch /> },
        ]}
      />
    </>
  );
}
