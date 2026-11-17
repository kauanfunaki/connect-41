import { Crown, House, Keyboard, Settings2, Trophy } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { AbasDeLink, type AbaDeLink } from "@/components/ui/AbasDeLink";

export type AbaDaAcademia = "inicio" | "testes" | "ranking" | "hall" | "admin";

/**
 * O cabeçalho de toda página da Academia (10/11/2026, pedido do Kauan): o
 * título e as abas. A frase de que nada dali vira avaliação foi para o artigo
 * de ajuda (17/11/2026, melhoria-707).
 * A Fase 2 (11/11/2026) trouxe o Hall dos campeões; a de administração só
 * aparece para quem administra (Administrador, Super Admin e a coordenação da
 * Tech).
 */
export function CabecalhoDaAcademia({ ativa, podeAdministrar, acao }: { ativa: AbaDaAcademia; podeAdministrar: boolean; acao?: React.ReactNode }) {
  const abas: AbaDeLink[] = [
    { chave: "inicio", rotulo: "Início", href: "/academia", icone: <House /> },
    { chave: "testes", rotulo: "Testes", href: "/academia/testes", icone: <Keyboard /> },
    { chave: "ranking", rotulo: "Ranking", href: "/academia/ranking", icone: <Trophy /> },
    { chave: "hall", rotulo: "Hall dos campeões", href: "/academia/hall", icone: <Crown /> },
    ...(podeAdministrar ? [{ chave: "admin", rotulo: "Administração", href: "/academia/admin", icone: <Settings2 /> }] : []),
  ];
  return (
    <>
      <PageHeader title="Academia" action={acao} />
      <AbasDeLink abas={abas} ativa={ativa} aria-label="Seções da Academia" />
    </>
  );
}
