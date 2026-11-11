import { Crown } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { CabecalhoDaAcademia } from "@/components/academia/CabecalhoDaAcademia";
import { HallDosCampeoes } from "@/components/academia/HallDosCampeoes";
import { abrirAcademia } from "@/lib/academia/servidor";
import { hallParaTela, mesesDoHall, parabensDeQuemOlha } from "@/lib/academia/hallServidor";
import { MESES_DO_HALL } from "@/lib/academia/hall";

export const metadata = { title: "Hall dos campeões · Academia" };

/**
 * O Hall dos campeões (Fase 2, 11/11/2026, Controle interno funcionalidade-594):
 * os vencedores de cada mês encerrado, por teste, e a maior evolução, com o
 * prêmio registrado. O mês é gravado na primeira visita depois que ele acaba.
 */
export default async function HallDaAcademiaPage() {
  const { ctx, podeAdministrar } = await abrirAcademia();
  const [hall, parabens] = await Promise.all([hallParaTela(ctx), parabensDeQuemOlha(ctx, mesesDoHall())]);
  return (
    <PageContainer>
      <CabecalhoDaAcademia ativa="hall" podeAdministrar={podeAdministrar} />
      <p className="mb-4 max-w-3xl text-ui text-fg-secondary">
        O pódio de cada teste (o ranking geral do mês) e a maior evolução da equipe, nos últimos {MESES_DO_HALL} meses encerrados. Dê os parabéns aos colegas: cada um recebe o aviso no sino.
      </p>
      {hall.foraDoRanking && (
        <p className="mb-4 text-helper text-fg-muted">Você escolheu não aparecer no ranking: aqui aparecem só os seus lugares no Hall.</p>
      )}
      {hall.meses.length === 0 ? (
        <EmptyState icon={<Crown />} title="O Hall ainda está vazio" description="Quando um mês com resultados valendo acabar, os campeões dele aparecem aqui." />
      ) : (
        <HallDosCampeoes meses={hall.meses} parabens={parabens} />
      )}
    </PageContainer>
  );
}
