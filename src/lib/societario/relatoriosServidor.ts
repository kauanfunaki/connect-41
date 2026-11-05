// Os números dos relatórios do Societário, numa leitura só para a página e
// para a exportação (04/11/2026): a planilha sai do mesmo cálculo que a tela.

import { getPrisma } from "@/lib/prisma";
import { saoPauloParts } from "@/lib/agenda";
import { feriadosDoTenant } from "./fila";
import { diasUteisEntre } from "./processo";
import { tempoPorEtapa } from "./tempoPorEtapa";
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
  // Tempo por etapa (04/11/2026): as etapas concluídas no período, com início registrado.
  const etapas = await getPrisma().processStep.findMany({
    where: { tenantId, status: "CONCLUIDA", startedAt: { not: null }, doneAt: { gte: inicio, lte: agora } },
    select: { startedAt: true, doneAt: true, templateStep: { select: { label: true, position: true } }, process: { select: { type: { select: { name: true } } } } },
    take: 20_000,
  });
  const dia = (d: Date) => saoPauloParts(d).dateKey;
  return {
    tempoPorEtapa: tempoPorEtapa(
      etapas.map((e) => ({
        tipoNome: e.process.type.name,
        posicao: e.templateStep.position,
        etapa: e.templateStep.label,
        diasUteis: diasUteisEntre(dia(e.startedAt!), dia(e.doneAt!), feriados),
      }))
    ),
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
