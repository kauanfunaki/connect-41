// O histórico dos números da Home (06/10, opção A): lê as fotos diárias e
// grava a de hoje. As contas (selo, linha) são de `tendencia.ts`.
//
// Por que foto diária, e não reconstruir o passado das datas que já existem:
// - tarefas atrasadas pedem a etapa de cada cartão em cada dia — o Connect só
//   guarda a atual (o histórico de etapa está espalhado em `activities`);
// - prazo estourado de processo depende de feriados, suspensões e exigências
//   ao longo do tempo;
// - contas vencidas até daria (vencimento + baixa), mas cancelamento não tem
//   data e o título importado do Omie nasce com a data da importação — o
//   número do passado sairia errado, e um selo errado é pior que nenhum;
// - e qualquer reconstrução varre o acervo, que na produção é grande.
// Também não há agendador que sirva: o interno (`startAlertScheduler`) roda
// sem usuário, e metade das métricas é por pessoa. A foto, então, é tirada de
// forma preguiçosa quando a Home abre — com os números que os painéis já
// calcularam, sem consulta a mais.
//
// Custo, por abertura da Home:
// - leitura: uma consulta por requisição (`cache()`), pela chave primária
//   (tenant, escopo ∈ {"", o da pessoa}, métrica ∈ lista, dia ≥ 8 semanas) —
//   no máximo 18 métricas × 56 dias ≈ 1 mil linhas pequenas;
// - gravação: depois da resposta (`after()`), um upsert pela chave primária
//   por métrica que mudou desde a última foto do dia; número parado não grava.
// Sem a tabela (migration não rodada), tudo isso vira nada: os painéis ficam
// sem selo e sem linha, e o erro vai para o log.

import { cache } from "react";
import { after } from "next/server";
import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { addDaysToKey, saoPauloParts } from "@/lib/agenda";
import { METRICAS, TODAS_AS_METRICAS, ehMetricaDaHome, type MetricaDaHome } from "./metricas";
import { JANELA_DA_LINHA_DIAS, montarTendencia, type Foto, type Tendencia } from "./tendencia";

/** O escopo das métricas pessoais: o usuário, e o setor ativo quando há um (o número muda com ele). */
export function escopoPessoal(ctx: Pick<AuthContext, "userId" | "activeSector">): string | null {
  if (!ctx.userId) return null;
  return ctx.activeSector ? `${ctx.userId}:${ctx.activeSector}` : ctx.userId;
}

function escopoDa(metrica: MetricaDaHome, pessoal: string | null): string | null {
  return METRICAS[metrica].escopo === "pessoal" ? pessoal : "";
}

const chaveDa = (metrica: string, escopo: string) => `${escopo}|${metrica}`;

/** A coluna é DATE: o dia de São Paulo, à meia-noite UTC (é como o Prisma devolve). */
function diaDoBanco(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00.000Z`);
}

type Historico = { hojeKey: string; fotos: Map<string, Foto[]> };

const historicoDaHome = cache(async (tenantId: string, pessoal: string | null): Promise<Historico | null> => {
  const hojeKey = saoPauloParts(new Date()).dateKey;
  const desde = addDaysToKey(hojeKey, -(JANELA_DA_LINHA_DIAS - 1));
  try {
    const linhas = await getPrisma().homeMetricSnapshot.findMany({
      where: {
        tenantId,
        scope: { in: pessoal ? ["", pessoal] : [""] },
        metric: { in: TODAS_AS_METRICAS },
        day: { gte: diaDoBanco(desde) },
      },
      select: { scope: true, metric: true, day: true, value: true },
    });
    const fotos = new Map<string, Foto[]>();
    for (const l of linhas) {
      const chave = chaveDa(l.metric, l.scope);
      const lista = fotos.get(chave) ?? [];
      lista.push({ dia: l.day.toISOString().slice(0, 10), valor: Number(l.value) });
      fotos.set(chave, lista);
    }
    return { hojeKey, fotos };
  } catch (err) {
    console.error("[home] histórico dos números indisponível — painéis sem selo nem linha", err);
    return null;
  }
});

/**
 * Começa a leitura do histórico cedo, junto com as consultas dos painéis — o
 * `cache()` guarda a promessa, e cada painel só a reaproveita. Não lança: a
 * leitura já trata a própria falha.
 */
export function precarregarHistoricoDaHome(ctx: AuthContext): void {
  if (ctx.tenantId) void historicoDaHome(ctx.tenantId, escopoPessoal(ctx));
}

/**
 * A tendência de cada número pedido e, com `gravar`, a foto de hoje de cada
 * um que mudou — agendada para depois da resposta. Quem grava é o painel
 * (sabe os números dele); a faixa de destaques só lê.
 */
export async function tendenciasDaHome(
  ctx: AuthContext,
  valores: Partial<Record<MetricaDaHome, number>>,
  { gravar = true }: { gravar?: boolean } = {}
): Promise<Partial<Record<MetricaDaHome, Tendencia>>> {
  if (!ctx.tenantId) return {};
  const pessoal = escopoPessoal(ctx);
  const historico = await historicoDaHome(ctx.tenantId, pessoal);
  if (!historico) return {};

  const resultado: Partial<Record<MetricaDaHome, Tendencia>> = {};
  const fotosDeHoje: { metric: MetricaDaHome; scope: string; value: number }[] = [];
  for (const [metrica, valor] of Object.entries(valores)) {
    if (!ehMetricaDaHome(metrica) || valor === undefined || !Number.isFinite(valor)) continue;
    const escopo = escopoDa(metrica, pessoal);
    if (escopo === null) continue;
    const fotos = historico.fotos.get(chaveDa(metrica, escopo)) ?? [];
    const tendencia = montarTendencia(fotos, historico.hojeKey, valor, METRICAS[metrica]);
    if (tendencia) resultado[metrica] = tendencia;
    const deHoje = fotos.find((f) => f.dia === historico.hojeKey);
    if (gravar && deHoje?.valor !== valor) fotosDeHoje.push({ metric: metrica, scope: escopo, value: Math.round(valor) });
  }

  if (fotosDeHoje.length > 0) {
    const tenantId = ctx.tenantId;
    const day = diaDoBanco(historico.hojeKey);
    after(async () => {
      const prisma = getPrisma();
      // Upsert pela chave inteira: duas Homes abertas ao mesmo tempo gravam o
      // mesmo dia sem duplicar — fica o último valor visto.
      const resultados = await Promise.allSettled(
        fotosDeHoje.map((f) =>
          prisma.homeMetricSnapshot.upsert({
            where: { tenantId_scope_metric_day: { tenantId, scope: f.scope, metric: f.metric, day } },
            create: { tenantId, scope: f.scope, metric: f.metric, day, value: BigInt(f.value) },
            update: { value: BigInt(f.value) },
          })
        )
      );
      const falha = resultados.find((r) => r.status === "rejected");
      if (falha) console.error("[home] foto dos números não gravada", (falha as PromiseRejectedResult).reason);
    });
  }
  return resultado;
}
