import { House, Keyboard, Settings2, Trophy } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { AbasDeLink, type AbaDeLink } from "@/components/ui/AbasDeLink";

export type AbaDaAcademia = "inicio" | "testes" | "ranking" | "admin";

/**
 * O cabeçalho de toda página da Academia (10/11/2026, pedido do Kauan): o
 * título, a frase que deixa claro que nada dali vira avaliação, e as abas.
 * Mais abas chegam na Fase 2; a de administração só aparece para quem
 * administra (Administrador, Super Admin e a coordenação da Tech).
 */
export function CabecalhoDaAcademia({ ativa, podeAdministrar, acao }: { ativa: AbaDaAcademia; podeAdministrar: boolean; acao?: React.ReactNode }) {
  const abas: AbaDeLink[] = [
    { chave: "inicio", rotulo: "Início", href: "/academia", icone: <House /> },
    { chave: "testes", rotulo: "Testes", href: "/academia/testes", icone: <Keyboard /> },
    { chave: "ranking", rotulo: "Ranking", href: "/academia/ranking", icone: <Trophy /> },
    ...(podeAdministrar ? [{ chave: "admin", rotulo: "Administração", href: "/academia/admin", icone: <Settings2 /> }] : []),
  ];
  return (
    <>
      <PageHeader title="Academia" subtitle="Treine, aprenda e dispute com os colegas. Nada daqui entra em avaliação de desempenho." action={acao} />
      <AbasDeLink abas={abas} ativa={ativa} aria-label="Seções da Academia" />
    </>
  );
}
