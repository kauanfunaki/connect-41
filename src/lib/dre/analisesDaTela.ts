// As sete análises da aba "Análises e reconciliação" da DRE e o endereço de
// cada uma (`/dre/analises?aba=`).
//
// Eram uma segunda fileira de abas embaixo das quatro DREs; desde 16/11/2026
// (melhoria-718, pedido do BPO: uma fileira só) são o seletor "Análise", na
// fileira do mês. O parâmetro e a análise padrão são os mesmos — os links do
// CFO (`cfo.ts`) e os favoritos seguem valendo.
//
// Regra pura, sem Prisma: o seletor é componente cliente.

export const ANALISES_DA_DRE = [
  { chave: "economico-financeiro", rotulo: "Econômico × financeiro" },
  { chave: "reconciliacao", rotulo: "Reconciliação lucro → caixa" },
  { chave: "comparativos", rotulo: "Comparativos" },
  { chave: "forecast", rotulo: "Forecast" },
  { chave: "cenarios", rotulo: "Cenários" },
  { chave: "indicadores", rotulo: "Indicadores" },
  { chave: "cfo", rotulo: "CFO" },
] as const;

export type AnaliseDaDre = (typeof ANALISES_DA_DRE)[number]["chave"];

/** A análise que o endereço pede; sem `aba` (ou com uma que não existe), a primeira. */
export function analiseDaUrl(aba: string | undefined): AnaliseDaDre {
  return ANALISES_DA_DRE.find((a) => a.chave === aba)?.chave ?? "economico-financeiro";
}

/**
 * O endereço de uma análise, com a empresa e o mês da tela. Só os três: o que
 * é de uma análise (a comparação, o método do forecast, a pergunta do CFO) não
 * segue para a outra.
 */
export function hrefDaAnalise(analise: AnaliseDaDre, companyId: string, mes: string): string {
  return `/dre/analises?aba=${analise}&empresa=${companyId}&mes=${mes}`;
}
