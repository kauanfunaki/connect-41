import "server-only";

// O motor NEO no banco (Fase 2, 09/11/2026): processar as pendências, classificar à mão, cancelar um
// lançamento e devolver a transação ao automático. A decisão é pura (`motor/neo.ts`); aqui ficam a
// leitura, a gravação e a concorrência.
//
// Concorrência: cada transação é classificada numa transação de banco que começa "tomando" a linha
// (`updateMany` de pendente para processada). Se outra execução — ou outro contador — chegou antes, o
// `count` vem zero e a transação é pulada. As colunas de unicidade (`chavePadraoAtiva`,
// `transacaoSemRegra`) são a segunda barreira: dois pares automáticos vivos para a mesma transação o
// banco recusa.

import { randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { codigoAtivo, decisaoSemRegra, registroChaveAtiva, registroChavePadraoAtiva } from "../motor/chaves";
import { codigoContaSintetica, decidir, historicoManual, pernas, type ContraparteDoNeo, type Decisao, type Partidas, type RegraDoNeo } from "../motor/neo";
import { ESTRATEGIA_VALOR_SUSPEITO, motivoParaNaoContabilizar, ordenarRegras, type Dc } from "../motor/regras";
import { normalizarParaMatch } from "../motor/texto";
import { corta } from "@/lib/revisao-contabil/motor/py";
import type { EntradaClassificacaoManual } from "../entradas";
import { decDoBanco, empresaDoTenant, falha, limitesDoMes, NAO_ENCONTRADA, ok, type Resultado } from "./base";
import { descricaoDaAgencia } from "./cadastros";

export type Tx = Prisma.TransactionClient;

export type ResultadoDoNeo = {
  totalPendentes: number;
  associadas: number;
  semRegra: number;
  erros: number;
  classificadasPorContraparte: number;
  bloqueadasValorSuspeito: number;
};

export type TransacaoLida = { id: string; agenciaId: string; historico: string; dc: string; valor: Prisma.Decimal; data: Date };

// ─── Gravação comum ───────────────────────────────────────────────────────

/**
 * A conta contábil do banco da agência. Sem conta vinculada, cria (ou reaproveita) a conta sintética
 * `1.1.B.<id>` e vincula, como `_obter_conta_bancaria` — o arquivo do Domínio avisa que ela não tem
 * código reduzido.
 */
export async function contaBancaria(tenantId: string, empresaId: string, agenciaId: string): Promise<string> {
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const agencia = await tx.coreAgencia.findFirst({ where: { id: agenciaId, tenantId, empresaId, deletedAt: null } });
    if (!agencia) throw new Error("agência da transação não encontrada");
    if (agencia.contaContabilId) {
      const conta = await tx.corePlanoConta.findFirst({ where: { id: agencia.contaContabilId, empresaId, deletedAt: null }, select: { id: true } });
      if (conta) return conta.id;
    }
    const codigo = codigoContaSintetica(agencia.id);
    let conta = await tx.corePlanoConta.findFirst({ where: { empresaId, codigo, deletedAt: null }, select: { id: true } });
    if (!conta) {
      conta = await tx.corePlanoConta.create({
        data: { tenantId, empresaId, codigo, descricao: `Conta bancária ${descricaoDaAgencia(agencia)}`, tipo: "ativo", tipoSa: "A", codigoAtivo: codigoAtivo({ codigo, deletedAt: null }) },
        select: { id: true },
      });
    }
    await tx.coreAgencia.update({ where: { id: agencia.id }, data: { contaContabilId: conta.id } });
    return conta.id;
  });
}

export async function gravarPartidas(tx: Tx, base: { tenantId: string; empresaId: string }, t: TransacaoLida, p: Partidas, contaBancoId: string) {
  const lancamentoId = randomUUID();
  for (const perna of pernas(p, contaBancoId, t.historico)) {
    const chaves = { deletedAt: null, transacaoId: t.id, lancamentoId, dc: perna.dc, ordemComposicao: null };
    await tx.coreRegistro.create({
      data: {
        ...base, transacaoId: t.id, lancamentoId, agenciaId: t.agenciaId, valor: t.valor, dataLancamento: t.data, ...perna,
        chaveAtiva: registroChaveAtiva(chaves), chavePadraoAtiva: registroChavePadraoAtiva(chaves),
      },
    });
  }
}

type DadosDaDecisao = {
  resultado: "associada" | "sem_regra" | "erro";
  regraId?: string | null;
  contaId?: string | null;
  estrategia?: string | null;
  motivo?: string | null;
  contraparteId?: string | null;
  contaContraparteId?: string | null;
  origemEvidencia?: string | null;
  contaDivergente?: boolean | null;
};

/**
 * Grava o desfecho. Uma decisão `sem_regra` aberta é ENCERRADA no lugar (atualizada), em vez de ficar
 * órfã enquanto uma linha nova entra — senão a fila "Sem regra" listaria um lançamento já feito.
 */
export async function gravarDecisao(tx: Tx, base: { tenantId: string; empresaId: string }, transacaoId: string, d: DadosDaDecisao) {
  const dados = {
    regraId: d.regraId ?? null, contaId: d.contaId ?? null, resultado: d.resultado, estrategia: d.estrategia ?? null,
    motivo: d.motivo == null ? null : corta(d.motivo, 500), contraparteId: d.contraparteId ?? null, contaContraparteId: d.contaContraparteId ?? null,
    origemEvidencia: d.origemEvidencia ?? null, contaDivergente: d.contaDivergente ?? null, processadoEm: new Date(),
    transacaoSemRegra: decisaoSemRegra({ resultado: d.resultado, transacaoId }),
  };
  const aberta = await tx.coreNeoDecisao.findUnique({ where: { transacaoSemRegra: transacaoId }, select: { id: true } });
  if (aberta) return tx.coreNeoDecisao.update({ where: { id: aberta.id }, data: dados, select: { id: true } });
  return tx.coreNeoDecisao.create({ data: { ...base, transacaoId, ...dados }, select: { id: true } });
}

/** Toma a transação pendente para classificar. Falso: outra execução chegou antes. */
export async function tomar(tx: Tx, t: { id: string }, extra: { automatico: boolean }): Promise<boolean> {
  const r = await tx.coreTransacao.updateMany({
    where: { id: t.id, status: "pendente", deletedAt: null, ...(extra.automatico ? { autoRecusadoEm: null } : {}) },
    // A classificação manual resolve a recusa: um humano decidiu.
    data: { status: "processada", ...(extra.automatico ? {} : { autoRecusadoEm: null, autoRecusadoPorId: null }) },
  });
  return r.count === 1;
}

// ─── Processar ────────────────────────────────────────────────────────────

/** Processa as pendências da empresa (opcionalmente de uma conta bancária e de um mês "AAAA-MM"). */
export async function processarNeo(tenantId: string, empresaId: string, filtro: { agenciaId: string | null; mes: string | null }): Promise<Resultado<ResultadoDoNeo>> {
  const empresa = await empresaDoTenant(tenantId, empresaId);
  if (!empresa) return falha(NAO_ENCONTRADA);
  const prisma = getPrisma();
  const base = { tenantId, empresaId };

  const [regrasLidas, contrapartesLidas] = await Promise.all([
    prisma.coreRegra.findMany({
      where: { empresaId, ativa: true, tipo: "automatica", deletedAt: null, ...(filtro.agenciaId ? { OR: [{ agenciaId: filtro.agenciaId }, { agenciaId: null }] } : {}) },
      select: { id: true, agenciaId: true, historico: true, dc: true, contaId: true, descricao: true, manterHistorico: true, tipo: true },
    }),
    prisma.coreContraparte.findMany({
      where: { empresaId, ativa: true, deletedAt: null },
      select: { id: true, documento: true, tipo: true, origem: true, razaoSocial: true, nomeFantasia: true, contaContabilId: true },
    }),
  ]);
  const regras = ordenarRegras(regrasLidas.map((r) => ({ ...r, dc: r.dc as Dc })));
  const formas = new Map<string, string>();
  const formaDeMatch = (r: RegraDoNeo) => {
    let f = formas.get(r.id);
    if (f === undefined) formas.set(r.id, (f = normalizarParaMatch(r.historico)));
    return f;
  };
  const contrapartes: ContraparteDoNeo[] = contrapartesLidas;

  const periodo = filtro.mes ? limitesDoMes(filtro.mes) : null;
  const pendentes = await prisma.coreTransacao.findMany({
    where: {
      empresaId, status: "pendente", deletedAt: null,
      // Quem teve a classificação automática recusada por um humano espera decisão humana.
      autoRecusadoEm: null,
      ...(filtro.agenciaId ? { agenciaId: filtro.agenciaId } : {}),
      ...(periodo ? { data: { gte: periodo.inicio, lte: periodo.fim } } : {}),
    },
    select: { id: true, agenciaId: true, historico: true, dc: true, valor: true, data: true },
    orderBy: [{ data: "asc" }, { id: "asc" }],
  });
  const abertas = new Set(
    (await prisma.coreNeoDecisao.findMany({ where: { empresaId, transacaoSemRegra: { in: pendentes.map((p) => p.id) } }, select: { transacaoId: true } })).map((d) => d.transacaoId),
  );

  const contasDoBanco = new Map<string, string>();
  const r: ResultadoDoNeo = { totalPendentes: pendentes.length, associadas: 0, semRegra: 0, erros: 0, classificadasPorContraparte: 0, bloqueadasValorSuspeito: 0 };

  for (const t of pendentes) {
    const decisao: Decisao = decidir(
      { id: t.id, agenciaId: t.agenciaId, historico: t.historico, dc: t.dc as Dc, valor: decDoBanco(t.valor) },
      { regras, contrapartes, cnpjDaEmpresa: empresa.cnpj, formaDeMatch },
    );
    try {
      if (decisao.tipo === "valor_suspeito") {
        // Reescreve sempre: o motivo genérico de antes esconderia justamente o aviso.
        await prisma.$transaction((tx) => gravarDecisao(tx, base, t.id, { resultado: "sem_regra", estrategia: ESTRATEGIA_VALOR_SUSPEITO, motivo: decisao.motivo }));
        r.semRegra++;
        r.bloqueadasValorSuspeito++;
        continue;
      }
      if (decisao.tipo === "sem_regra") {
        // Sem motivo novo, reescrever a decisão aberta a cada execução seria só ruído.
        if (decisao.recusa || !abertas.has(t.id)) {
          await prisma.$transaction((tx) => gravarDecisao(tx, base, t.id, { resultado: "sem_regra", motivo: decisao.motivo }));
        }
        r.semRegra++;
        continue;
      }
      let contaBanco = contasDoBanco.get(t.agenciaId);
      if (!contaBanco) contasDoBanco.set(t.agenciaId, (contaBanco = await contaBancaria(tenantId, empresaId, t.agenciaId)));
      const feito = await prisma.$transaction(async (tx) => {
        if (!(await tomar(tx, t, { automatico: true }))) return false;
        await gravarPartidas(tx, base, t, decisao.partidas, contaBanco);
        if (decisao.tipo === "regra") {
          const s = decisao.sombra;
          await gravarDecisao(tx, base, t.id, {
            resultado: "associada", regraId: decisao.regra.id, contaId: decisao.regra.contaId, estrategia: decisao.estrategia, motivo: decisao.motivo,
            contraparteId: s?.contraparteId, contaContraparteId: s?.contaContraparteId, origemEvidencia: s?.origemEvidencia, contaDivergente: s?.contaDivergente ?? null,
          });
        } else {
          await gravarDecisao(tx, base, t.id, { resultado: "associada", contaId: decisao.contraparte.contaContabilId, estrategia: "contraparte", motivo: decisao.motivo });
        }
        return true;
      });
      if (!feito) {
        r.totalPendentes--;
        continue;
      }
      r.associadas++;
      if (decisao.tipo === "contraparte") r.classificadasPorContraparte++;
    } catch (e) {
      // Erro de dado (banco recusou) vira decisão `erro` e não para o extrato; erro de programação sobe.
      if (!(e instanceof Prisma.PrismaClientKnownRequestError)) throw e;
      console.error("[contabil-core] neo: transação com erro", e.code);
      await prisma.$transaction(async (tx) => {
        await tx.coreTransacao.updateMany({ where: { id: t.id, status: "pendente" }, data: { status: "erro" } });
        await gravarDecisao(tx, base, t.id, { resultado: "erro", motivo: `Erro ao gravar a classificação (${e.code}).` });
      });
      r.erros++;
    }
  }
  return ok(r);
}

// ─── Classificação manual ─────────────────────────────────────────────────

export type ResultadoManual = { classificadas: string[]; ignoradas: string[]; bloqueadas: { transacaoId: string; motivo: string }[] };

/**
 * Classifica até 200 pendências na mesma conta. Ids de outra empresa ou já processados são ignorados:
 * a seleção da tela é uma fotografia que pode ter envelhecido. Transação com valor suspeito ou sem
 * histórico é recusada uma a uma, sem derrubar o lote.
 */
export async function classificarManual(tenantId: string, empresaId: string, d: EntradaClassificacaoManual): Promise<Resultado<ResultadoManual>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const prisma = getPrisma();
  const base = { tenantId, empresaId };
  const conta = await prisma.corePlanoConta.findFirst({ where: { id: d.contaId, empresaId, deletedAt: null }, select: { id: true } });
  if (!conta) return falha("Conta contábil não encontrada nesta empresa.");

  const lidas = await prisma.coreTransacao.findMany({
    where: { id: { in: d.transacaoIds }, empresaId, status: "pendente", deletedAt: null },
    select: { id: true, agenciaId: true, historico: true, dc: true, valor: true, data: true },
  });
  const porId = new Map(lidas.map((t) => [t.id, t]));
  const res: ResultadoManual = { classificadas: [], ignoradas: d.transacaoIds.filter((id) => !porId.has(id)), bloqueadas: [] };
  const contasDoBanco = new Map<string, string>();

  for (const id of d.transacaoIds) {
    const t = porId.get(id);
    if (!t) continue;
    const bloqueio = motivoParaNaoContabilizar({ historico: t.historico, valor: decDoBanco(t.valor) });
    if (bloqueio) {
      await prisma.$transaction((tx) => gravarDecisao(tx, base, t.id, { resultado: "sem_regra", estrategia: ESTRATEGIA_VALOR_SUSPEITO, motivo: bloqueio }));
      res.bloqueadas.push({ transacaoId: t.id, motivo: bloqueio });
      continue;
    }
    const historico = historicoManual(t, d.descricao, d.manterHistorico);
    if (!historico) {
      res.bloqueadas.push({ transacaoId: t.id, motivo: "O lançamento não possui histórico. Informe um histórico contábil." });
      continue;
    }
    let contaBanco = contasDoBanco.get(t.agenciaId);
    if (!contaBanco) contasDoBanco.set(t.agenciaId, (contaBanco = await contaBancaria(tenantId, empresaId, t.agenciaId)));
    const feito = await prisma.$transaction(async (tx) => {
      if (!(await tomar(tx, t, { automatico: false }))) return false;
      // O texto do contador vira o HISTÓRICO do lançamento; a linha do banco fica em `historicoExtrato`.
      await gravarPartidas(tx, base, t, { contaId: conta.id, descricao: historico, historico, dc: t.dc as Dc, tipoRegra: "manual" }, contaBanco);
      await gravarDecisao(tx, base, t.id, { resultado: "associada", contaId: conta.id, estrategia: "manual", motivo: `Associação manual: ${historico}` });
      return true;
    });
    if (feito) res.classificadas.push(t.id);
    else res.ignoradas.push(t.id);
  }
  return ok(res);
}

// ─── Cancelar e liberar ───────────────────────────────────────────────────

/**
 * Desfaz o lançamento de uma transação (todos os pares vivos, inclusive de composição) e a devolve à
 * fila para decisão HUMANA (`autoRecusadoEm`): sem isso, a mesma regra reclassificaria na próxima
 * execução e desfazer não teria efeito. A decisão é log: o cancelamento vira uma linha nova.
 */
export async function cancelarLancamento(tx: Tx, base: { tenantId: string; empresaId: string }, transacaoId: string, motivo: string, userId: string | null): Promise<number> {
  const agora = new Date();
  const partidas = await tx.coreRegistro.findMany({ where: { empresaId: base.empresaId, transacaoId, deletedAt: null }, select: { id: true } });
  if (!partidas.length) return 0;
  await tx.coreRegistro.updateMany({
    where: { id: { in: partidas.map((p) => p.id) } },
    data: { deletedAt: agora, canceladoEm: agora, canceladoPorId: userId, motivoCancelamento: corta(motivo, 300), chaveAtiva: null, chavePadraoAtiva: null },
  });
  await tx.coreTransacao.update({ where: { id: transacaoId }, data: { status: "pendente", autoRecusadoEm: agora, autoRecusadoPorId: userId } });
  await gravarDecisao(tx, base, transacaoId, { resultado: "sem_regra", estrategia: "manual", motivo: `Classificação cancelada: ${motivo}` });
  return partidas.length;
}

export async function cancelarClassificacao(tenantId: string, userId: string, empresaId: string, transacaoId: string, motivo: string): Promise<Resultado<{ partidas: number; historico: string }>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const prisma = getPrisma();
  return prisma.$transaction(async (tx) => {
    const t = await tx.coreTransacao.findFirst({ where: { id: transacaoId, empresaId, deletedAt: null }, select: { id: true, historico: true } });
    if (!t) return falha<{ partidas: number; historico: string }>("Transação não encontrada.");
    const n = await cancelarLancamento(tx, { tenantId, empresaId }, t.id, motivo, userId);
    if (!n) return falha<{ partidas: number; historico: string }>("Lançamento não encontrado ou já cancelado.");
    return ok({ partidas: n, historico: t.historico });
  });
}

/** Devolve ao automático uma transação que um humano tinha tirado do motor. */
export async function liberarParaAutomatico(tenantId: string, empresaId: string, transacaoId: string): Promise<Resultado<{ historico: string }>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const prisma = getPrisma();
  const t = await prisma.coreTransacao.findFirst({ where: { id: transacaoId, empresaId, deletedAt: null, status: "pendente" }, select: { id: true, historico: true, autoRecusadoEm: true } });
  if (!t) return falha("Transação pendente não encontrada.");
  if (!t.autoRecusadoEm) return falha("Esta transação já está liberada para o automático.");
  await prisma.coreTransacao.update({ where: { id: t.id }, data: { autoRecusadoEm: null, autoRecusadoPorId: null } });
  return ok({ historico: t.historico });
}

// ─── Consultas ────────────────────────────────────────────────────────────

/** As pendências da fila do NEO, com o motivo da última decisão (sem regra, valor suspeito, recusa). */
export async function listarPendencias(tenantId: string, empresaId: string, filtro: { agenciaId?: string | null; mes?: string | null; busca?: string | null }) {
  if (!(await empresaDoTenant(tenantId, empresaId))) return [];
  const periodo = filtro.mes ? limitesDoMes(filtro.mes) : null;
  return getPrisma().coreTransacao.findMany({
    where: {
      tenantId, empresaId, status: "pendente", deletedAt: null,
      ...(filtro.agenciaId ? { agenciaId: filtro.agenciaId } : {}),
      ...(periodo ? { data: { gte: periodo.inicio, lte: periodo.fim } } : {}),
      ...(filtro.busca?.trim() ? { historico: { contains: filtro.busca.trim() } } : {}),
    },
    select: {
      id: true, data: true, historico: true, dc: true, valor: true, agenciaId: true, autoRecusadoEm: true,
      decisoes: { where: { transacaoSemRegra: { not: null } }, select: { motivo: true, estrategia: true }, take: 1 },
    },
    orderBy: [{ data: "asc" }, { ordem: "asc" }, { id: "asc" }],
    take: 500,
  });
}

