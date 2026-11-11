import { TelaDeCompetencias } from "@/components/dp2/TelaDeCompetencias";

/** 13º salário do DP 2 (11/11/2026): as parcelas da empresa em foco, calculadas como competência. */
export default async function DecimoTerceiroDoDp2({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const { empresa } = await searchParams;
  return <TelaDeCompetencias modulo="dp2_decimo" empresaPedida={empresa} soDecimo />;
}
