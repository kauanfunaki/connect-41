// Os números dos relatórios do Societário, numa leitura só para a página e
// para a exportação (04/11/2026): a planilha sai do mesmo cálculo que a tela.

import { feriadosDoTenant } from "./fila";
import { processosParaRelatorio } from "./painel-data";
import {
  inicioDoPeriodo,
  slaPorTipo,
  resumoDeVoltas,
  processosComMaisVoltas,
  produtividadePorResponsavel,
  custoPorProcesso,
  totaisDeCusto,
  type Periodo,
} from "./relatorios";

export async function dadosDosRelatorios(tenantId: string, periodo: Periodo, agora = new Date()) {
  const inicio = inicioDoPeriodo(periodo, agora);
  const feriados = await feriadosDoTenant(tenantId);
  const processos = await processosParaRelatorio(tenantId, inicio, agora, feriados);
  const custos = custoPorProcesso(processos);
  const abertos = processos.filter((p) => p.concluidoEm === null);
  return {
    processos,
    abertos: abertos.length,
    estouradosAbertos: abertos.filter((p) => p.prazo.situacao === "estourado").length,
    concluidos: processos.length - abertos.length,
    sla: slaPorTipo(processos),
    voltas: resumoDeVoltas(processos),
    maisVoltas: processosComMaisVoltas(processos),
    produtividade: produtividadePorResponsavel(processos, inicio, agora),
    custos,
    totais: totaisDeCusto(custos),
  };
}

export type DadosDosRelatorios = Awaited<ReturnType<typeof dadosDosRelatorios>>;
