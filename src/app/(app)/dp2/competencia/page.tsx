import { TelaDeCompetencias } from "@/components/dp2/TelaDeCompetencias";

/** Competência do mês do DP 2 (11/11/2026): a folha e as parcelas do 13º da empresa em foco. */
export default async function CompetenciasDoDp2({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const { empresa } = await searchParams;
  return <TelaDeCompetencias modulo="dp2_competencia" empresaPedida={empresa} soDecimo={false} />;
}
