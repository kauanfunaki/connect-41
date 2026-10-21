// A DRE que o cliente vê no portal, período a período (21/10/2026) — num lugar
// só, para o portal e para o "Ver como o cliente" da DRE da equipe.
//
// ─── Mesmo cálculo da equipe ────────────────────────────────────────────────
//
// Os mesmos loaders de `/dre` (`dreDoMes`; `dreDoAnoDaEmpresa` e `dreDoAno`) e
// de `/dre/economica` (`serieEconomica`), com as opções que a equipe vê quando
// não mexe no seletor dos impostos: o modelo da empresa e os impostos no
// padrão dele. Cada tela montava a sua chamada, e a DRE do cliente era a que
// sempre ficava um passo atrás. `doCliente.test.ts` confere linha a linha.

import type { ResultadoDoDre } from "@/lib/dre/calculo";
import { dreDoAnoDaEmpresa, dreDoMes } from "@/lib/dre/data";
import { dreDoAno, type DreAnual } from "@/lib/dre/anual";
import { opcoesDaUrl, type ModeloDoDre, type OpcoesDoDre } from "@/lib/dre/estrutura";
import { serieEconomica } from "@/lib/dre/dataEconomica";
import type { DreEconomica } from "@/lib/dre/economica";
import { acumuladoDoAno, competenciaDe, partesDaCompetencia, somarMeses } from "@/lib/financeiro/periodo";

export type RegimeDoCliente = "caixa" | "competencia";

/**
 * As opções da DRE do cliente: as da tela da equipe sem `impostos=fora`. A
 * visão "Impostos fora do resultado" é análise da equipe; o cliente recebe o
 * padrão do modelo da empresa.
 */
export function opcoesDoCliente(modelo: ModeloDoDre): OpcoesDoDre {
  return opcoesDaUrl(undefined, modelo);
}

export type DreDoClienteNoMes = {
  resultado: ResultadoDoDre;
  /** O mês anterior, só quando ele teve movimento — "subiu 100%" sobre zero diria nada. */
  anterior: ResultadoDoDre | null;
  temMovimento: boolean;
};

/**
 * Um mês ("AAAA-MM") no regime da aba. `temAnterior` vem de quem já leu os
 * meses com movimento (caixa); na competência a própria série diz.
 */
export async function dreDoClienteNoMes(
  tenantId: string,
  companyId: string,
  mes: string,
  regime: RegimeDoCliente,
  opcoes: OpcoesDoDre,
  temAnterior: boolean
): Promise<DreDoClienteNoMes> {
  const mesAnterior = somarMeses(mes, -1);
  if (regime === "caixa") {
    const [doMes, doAnterior] = await Promise.all([
      dreDoMes(tenantId, companyId, partesDaCompetencia(mes), opcoes),
      temAnterior ? dreDoMes(tenantId, companyId, partesDaCompetencia(mesAnterior), opcoes) : Promise.resolve(null),
    ]);
    return { resultado: doMes.resultado, anterior: doAnterior?.resultado ?? null, temMovimento: doMes.lancamentos > 0 };
  }
  // O mês anterior vem na mesma consulta, como em /dre/economica.
  const serie = await serieEconomica(tenantId, companyId, [mes, mesAnterior], { tipo: "todos" }, opcoes);
  const dre = serie.get(mes)!;
  const doAnterior = serie.get(mesAnterior);
  return {
    resultado: dre.resultado,
    anterior: doAnterior && temResultado(doAnterior) ? doAnterior.resultado : null,
    temMovimento: temResultado(dre),
  };
}

/**
 * Os doze meses do ano no regime da aba. Caixa é a visão anual de `/dre`;
 * competência monta as mesmas colunas da DRE econômica de cada mês, numa
 * consulta só.
 */
export async function dreDoClienteNoAno(
  tenantId: string,
  companyId: string,
  ano: number,
  regime: RegimeDoCliente,
  opcoes: OpcoesDoDre
): Promise<DreAnual> {
  if (regime === "caixa") return dreDoAno((await dreDoAnoDaEmpresa(tenantId, companyId, ano, opcoes)).meses, opcoes);
  const competencias = acumuladoDoAno(competenciaDe(ano, 12));
  const serie = await serieEconomica(tenantId, companyId, competencias, { tipo: "todos" }, opcoes);
  return dreDoAno(
    competencias.map((c) => {
      const d = serie.get(c)!;
      return {
        mes: partesDaCompetencia(c).mes,
        porGrupo: d.resultado.porGrupo,
        temMovimento: temResultado(d),
        porCategoria: d.resultado.porCategoria,
      };
    }),
    opcoes
  );
}

/** Mês só com perda ou diferença de acordo ainda tem resultado a mostrar. */
function temResultado(d: DreEconomica): boolean {
  return d.lancamentos > 0 || d.cobranca.perdas !== 0 || d.cobranca.acrescimosDeAcordo !== 0 || d.cobranca.descontosDeAcordo !== 0;
}
