// A leitura do painel do Societário e da visão por órgão (04/11/2026, lote D dos
// ajustes de 03/11). As contas que se repetem vêm das telas de origem: os
// protocolos parados (Exigências), o prazo do processo (Relatórios), a fila de
// licenças e o quadro de certidões — o painel não tem regra própria de prazo.

import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { nomeExibicao } from "@/lib/companyName";
import { feriadosDoTenant } from "./fila";
import { processosEstourados } from "./painel-data";
import { licencasARenovar } from "./licencas-data";
import { diasAte } from "./licencas";
import { STATUS_SEM_CONCLUSAO } from "./processo";
import { listarProtocolosParados, diasDaLista } from "./protocolosParadosServidor";
import { diasParaCobrarOProtocolo } from "./protocoloParadoServidor";
import { positivasNaoVistas } from "@/lib/certidoes/servidor";
import { acessoAsCertidoes } from "@/lib/certidoes/acesso";
import { ROTULO_DA_CERTIDAO } from "@/lib/certidoes/regras";
import { maquinaSemSinal } from "@/lib/robo/tarefas";
import { ordenarFila, textoDoPrazoEmDias, type ItemDaFila } from "./painelDoSetor";

const DIA_MS = 24 * 60 * 60 * 1000;
/** A fila do dia mostra até isto; os números do alto contam tudo. */
const ITENS_NA_FILA = 40;

export type NumerosDoPainel = {
  parados: number;
  exigencias7: number;
  estourados: number;
  licencas: number;
  /** Nulo quando a pessoa não vê as certidões (módulo desligado ou sem acesso). */
  positivas: number | null;
  /** O robô: "ok", "sem sinal" ou nulo quando não há máquina. */
  robo: "ok" | "sem_sinal" | null;
};

export async function painelDoSocietario(ctx: AuthContext, agora = new Date()): Promise<{ numeros: NumerosDoPainel; fila: ItemDaFila[] }> {
  const tenantId = ctx.tenantId!;
  const prisma = getPrisma();
  const daqui7 = new Date(agora.getTime() + 7 * DIA_MS);
  // 05/11/2026: cada número lê só o que conta (as licenças a renovar, os
  // processos abertos sem protocolos e taxas, as positivas não vistas), e não
  // as listas inteiras das telas de origem — a tela levava de 3 a 5 segundos.
  const [dias, feriados, exigencias, aRenovar, acessoCertidoes, roboLigado] = await Promise.all([
    diasParaCobrarOProtocolo(tenantId).catch(() => 15),
    feriadosDoTenant(tenantId),
    prisma.processRequirement.findMany({
      where: {
        tenantId,
        resolvedAt: null,
        dueAt: { lte: daqui7 },
        protocol: { process: { tenantId, concludedAt: null, status: { notIn: STATUS_SEM_CONCLUSAO } } },
      },
      select: {
        id: true,
        description: true,
        dueAt: true,
        protocol: { select: { organ: { select: { name: true } }, process: { select: { id: true, type: { select: { name: true } }, company: { select: { name: true, displayName: true } } } } } },
      },
      orderBy: { dueAt: "asc" },
      take: 300,
    }),
    licencasARenovar(tenantId, agora),
    acessoAsCertidoes(ctx),
    isModuleEnabled(tenantId, "societario_robo"),
  ]);
  const [parados, estourados, positivasDaFila, maquinas] = await Promise.all([
    listarProtocolosParados(tenantId, dias, agora),
    processosEstourados(tenantId, agora, feriados),
    acessoCertidoes ? positivasNaoVistas(tenantId) : Promise.resolve(null),
    roboLigado
      ? prisma.robotTask
          // As máquinas distintas saem do banco (groupBy), e não de todas as tarefas do mês.
          .groupBy({ by: ["machineSlug"], where: { tenantId, machineSlug: { not: null }, createdAt: { gte: new Date(agora.getTime() - 30 * DIA_MS) } } })
          .then((t) => prisma.opsWatcher.findMany({ where: { tenantId, isActive: true, slug: { in: t.map((x) => x.machineSlug!) } }, select: { lastHeartbeatAt: true } }))
      : Promise.resolve([]),
  ]);

  const fila: ItemDaFila[] = [];
  for (const p of parados) {
    fila.push({
      chave: `parado-${p.id}`, tipo: "parado", titulo: p.processo, detalhe: `${p.empresa} · ${p.orgao} · parado há ${p.diasParado} dias`,
      selo: "parado", tom: "perigo", href: `/processos/${p.processoId}`, peso: p.diasParado, protocoloId: p.id,
    });
  }
  for (const e of exigencias) {
    const d = diasAte(e.dueAt!, agora);
    const proc = e.protocol.process;
    fila.push({
      chave: `exigencia-${e.id}`, tipo: "exigencia", titulo: `${proc.type.name} — ${nomeExibicao(proc.company)}`,
      detalhe: `Exigência de ${e.protocol.organ.name}: ${e.description.slice(0, 120)} · ${textoDoPrazoEmDias(d)}`,
      selo: d <= 0 ? "exigência vencendo" : "exigência", tom: d <= 0 ? "perigo" : "atencao", href: `/processos/${proc.id}`, peso: d, urgente: d <= 0,
    });
  }
  for (const p of estourados) {
    fila.push({
      chave: `estourado-${p.id}`, tipo: "estourado", titulo: `${p.tipoNome} — ${p.empresaNome}`,
      detalhe: `${p.prazo.dias} de ${p.prazo.previstoMax} dias úteis`, selo: "estourado", tom: "perigo", href: `/processos/${p.id}`,
      peso: p.prazo.dias - (p.prazo.previstoMax ?? 0),
    });
  }
  for (const l of aRenovar) {
    const d = diasAte(l.expiresAt, agora);
    fila.push({
      chave: `licenca-${l.id}`, tipo: "licenca", titulo: `${l.kind} — ${l.empresaNome}`, detalhe: `Licença ${textoDoPrazoEmDias(d)}`,
      selo: d < 0 ? "vencida" : "renovar", tom: d < 0 ? "perigo" : "atencao", href: `/licencas?busca=${encodeURIComponent(l.empresaNome)}`, peso: d, urgente: d < 0,
    });
  }
  const positivas = positivasDaFila ? positivasDaFila.length : null;
  for (const c of positivasDaFila ?? []) {
    fila.push({
      chave: `certidao-${c.id}`, tipo: "certidao", titulo: c.empresa, detalhe: `Certidão ${ROTULO_DA_CERTIDAO[c.tipo] ?? c.tipo} positiva`,
      selo: "positiva", tom: "perigo", href: "/certidoes?recorte=positivas", peso: 0,
    });
  }

  return {
    numeros: {
      parados: parados.length,
      exigencias7: exigencias.length,
      estourados: estourados.length,
      licencas: aRenovar.length,
      positivas,
      robo: maquinas.length === 0 ? null : maquinas.some((m) => maquinaSemSinal(m.lastHeartbeatAt, agora)) ? "sem_sinal" : "ok",
    },
    fila: ordenarFila(fila).slice(0, ITENS_NA_FILA),
  };
}

// ─── Visão por órgão ─────────────────────────────────────────────────────────

export type LinhaDoOrgao = {
  id: string;
  nome: string;
  esperando: number;
  parados: number;
  /** Dias corridos do protocolo à resposta, nos respondidos dos últimos 90 dias. */
  respostaMediaDias: number | null;
  /** Reapresentações por protocolo nos últimos 90 dias. */
  voltasPorProtocolo: number | null;
  ultimaResposta: Date | null;
};

/** Os órgãos com protocolo esperando ou respondido nos últimos 90 dias; o de mais esperando primeiro. */
export async function visaoPorOrgao(tenantId: string, agora = new Date()) {
  const prisma = getPrisma();
  const desde = new Date(agora.getTime() - 90 * DIA_MS);
  const prazo = diasDaLista(await diasParaCobrarOProtocolo(tenantId).catch(() => 15));
  const protocolos = await prisma.processProtocol.findMany({
    where: {
      tenantId,
      OR: [
        { outcome: "PENDENTE", process: { concludedAt: null, status: { notIn: STATUS_SEM_CONCLUSAO } } },
        { resolvedAt: { gte: desde } },
        { submittedAt: { gte: desde } },
      ],
    },
    select: { organId: true, attempt: true, submittedAt: true, resolvedAt: true, outcome: true, process: { select: { concludedAt: true, status: true } }, organ: { select: { name: true } } },
    take: 20_000,
  });
  const por = new Map<string, LinhaDoOrgao & { tempos: number[]; recentes: number; voltas: number }>();
  for (const p of protocolos) {
    let l = por.get(p.organId);
    if (!l) {
      l = { id: p.organId, nome: p.organ.name, esperando: 0, parados: 0, respostaMediaDias: null, voltasPorProtocolo: null, ultimaResposta: null, tempos: [], recentes: 0, voltas: 0 };
      por.set(p.organId, l);
    }
    const aberto = p.process.concludedAt === null && !(STATUS_SEM_CONCLUSAO as readonly string[]).includes(p.process.status);
    if (p.outcome === "PENDENTE" && aberto) {
      l.esperando++;
      if ((agora.getTime() - p.submittedAt.getTime()) / DIA_MS >= prazo) l.parados++;
    }
    if (p.resolvedAt && p.resolvedAt >= desde) {
      l.tempos.push((p.resolvedAt.getTime() - p.submittedAt.getTime()) / DIA_MS);
      if (!l.ultimaResposta || p.resolvedAt > l.ultimaResposta) l.ultimaResposta = p.resolvedAt;
    }
    if (p.submittedAt >= desde) {
      l.recentes++;
      if (p.attempt > 1) l.voltas++;
    }
  }
  const linhas: LinhaDoOrgao[] = [...por.values()]
    .map((l) => ({
      id: l.id, nome: l.nome, esperando: l.esperando, parados: l.parados, ultimaResposta: l.ultimaResposta,
      respostaMediaDias: l.tempos.length ? Math.round((l.tempos.reduce((s, t) => s + t, 0) / l.tempos.length) * 10) / 10 : null,
      voltasPorProtocolo: l.recentes ? Math.round((l.voltas / l.recentes) * 10) / 10 : null,
    }))
    .sort((a, b) => b.esperando - a.esperando || b.parados - a.parados || a.nome.localeCompare(b.nome, "pt-BR"));
  return { linhas, prazoDoParado: prazo };
}

/** Os protocolos esperando num órgão, do que espera há mais tempo. */
export async function protocolosDoOrgao(tenantId: string, organId: string, agora = new Date()) {
  const lista = await getPrisma().processProtocol.findMany({
    where: { tenantId, organId, outcome: "PENDENTE", process: { concludedAt: null, status: { notIn: STATUS_SEM_CONCLUSAO } } },
    select: {
      id: true, number: true, attempt: true, submittedAt: true,
      process: { select: { id: true, title: true, type: { select: { name: true } }, company: { select: { name: true, displayName: true } } } },
    },
    orderBy: { submittedAt: "asc" },
    take: 300,
  });
  return lista.map((p) => ({
    id: p.id,
    processoId: p.process.id,
    processo: p.process.title ? `${p.process.type.name} — ${p.process.title}` : p.process.type.name,
    empresa: nomeExibicao(p.process.company),
    numero: p.number,
    tentativa: p.attempt,
    protocoladoEm: p.submittedAt,
    dias: Math.floor((agora.getTime() - p.submittedAt.getTime()) / DIA_MS),
  }));
}
