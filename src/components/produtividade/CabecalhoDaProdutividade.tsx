import { GitBranch, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { ROTAS_DA_PRODUTIVIDADE, type AbaDaProdutividade } from "@/lib/tech-interno/rotasDaProdutividade";

/**
 * O título e as abas da Produtividade: Pessoas, a de entrada, e GitHub
 * (09/11/2026; até ali havia também o Painel, com os números do time). Sem
 * hook — serve ao painel cliente do GitHub, que desenha as duas abas. Cada aba
 * tem o período dela (De/Até).
 */
export function CabecalhoDaProdutividade({
  aba,
  subtitulo,
  acao,
}: {
  aba: AbaDaProdutividade;
  subtitulo: string;
  acao?: React.ReactNode;
}) {
  return (
    <>
      <PageHeader title="Produtividade" subtitle={subtitulo} action={acao} />
      <AbasDeLink
        className="mb-6"
        aria-label="Produtividade"
        ativa={aba}
        abas={[
          { chave: "pessoas", rotulo: "Pessoas", href: ROTAS_DA_PRODUTIVIDADE.pessoas, icone: <Users /> },
          { chave: "github", rotulo: "GitHub", href: ROTAS_DA_PRODUTIVIDADE.github, icone: <GitBranch /> },
        ]}
      />
    </>
  );
}
