import { GitBranch, Users, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { ROTAS_DA_PRODUTIVIDADE, type AbaDaProdutividade } from "@/lib/tech-interno/rotasDaProdutividade";

/**
 * O título e as abas da Produtividade (05/11/2026): Time, Pessoas e GitHub.
 * Sem hook — serve às telas do servidor (Time, Pessoas) e ao painel cliente
 * do GitHub. O período escolhido em Time vai junto para Pessoas, e volta.
 */
export function CabecalhoDaProdutividade({
  aba,
  subtitulo,
  periodo,
  acao,
}: {
  aba: AbaDaProdutividade;
  subtitulo: string;
  /** O `?periodo=` de Time e Pessoas, quando não é o padrão. */
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
          { chave: "time", rotulo: "Time", href: `${ROTAS_DA_PRODUTIVIDADE.time}${q}`, icone: <UsersRound /> },
          { chave: "pessoas", rotulo: "Pessoas", href: `${ROTAS_DA_PRODUTIVIDADE.pessoas}${q}`, icone: <Users /> },
          { chave: "github", rotulo: "GitHub", href: ROTAS_DA_PRODUTIVIDADE.github, icone: <GitBranch /> },
        ]}
      />
    </>
  );
}
