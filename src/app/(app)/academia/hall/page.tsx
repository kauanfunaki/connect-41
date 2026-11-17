import { Crown } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { CabecalhoDaAcademia } from "@/components/academia/CabecalhoDaAcademia";
import { HallDosCampeoes } from "@/components/academia/HallDosCampeoes";
import { abrirAcademia } from "@/lib/academia/servidor";
import { hallParaTela, mesesDoHall, parabensDeQuemOlha } from "@/lib/academia/hallServidor";

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
      {hall.foraDoRanking && (
        <p className="mb-4 text-helper text-fg-muted">Você escolheu não aparecer no ranking: aqui aparecem só os seus lugares no Hall.</p>
      )}
      {hall.meses.length === 0 ? (
        <EmptyState icon={<Crown />} title="O Hall ainda está vazio" description="Os campeões aparecem quando o mês fechar." />
      ) : (
        <HallDosCampeoes meses={hall.meses} parabens={parabens} />
      )}
    </PageContainer>
  );
}
