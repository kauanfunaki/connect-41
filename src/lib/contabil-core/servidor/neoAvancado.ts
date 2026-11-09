import "server-only";

// O NEO além do básico (Fase 3, 09/11/2026): reclassificar, compor uma transação em vários pares,
// a fila agrupada, a simulação de regra e a classificação que já cria a regra da seleção. Porte de
// `neo/cancelamento.py` (reclassificar), `neo/composicao.py` (ADR-017), `neo/consultas.py` e de
// `_cadastrar_regra_da_selecao`/`criar_regra_e_aplicar` (`api/v1/neo.py`).

import { randomUUID } from "node:crypto";
import { getPrisma } from "@/lib/prisma";
import { registroChaveAtiva, registroChavePadraoAtiva, regraChaveAtiva, historicoNormalizado } from "../motor/chaves";
import { agruparPendencias, conferirComposicao, type ComponenteDaComposicao, type GrupoDePendencias } from "../motor/fila";
import { motivoParaNaoContabilizar, estrategiaDeMatch, type Dc } from "../motor/regras";
import { normalizarHistoricoContabil } from "../motor/texto";
import { corta } from "@/lib/revisao-contabil/motor/py";
import type { EntradaClassificacaoManual, EntradaRegra } from "../entradas";
import { decDoBanco, dia, empresaDoTenant, falha, limitesDoMes, NAO_ENCONTRADA, ok, paraBanco, type Resultado } from "./base";
import { salvarRegra } from "./cadastros";
import { cancelarLancamento, classificarManual, contaBancaria, gravarDecisao, gravarPartidas, processarNeo, tomar, type ResultadoManual, type Tx } from "./neo";
import { igual, somaTodos } from "../motor/decimal";

// ─── Reclassificar ────────────────────────────────────────────────────────

/**
 * Troca a classificação de uma transação numa transação de banco só: cancela os pares vivos e grava o
 * novo. Se a nova classificação for recusada (valor suspeito), o cancelamento também volta — nunca
 * fica o meio-termo de uma transação sem lançamento, que duas chamadas separadas deixariam.
 */
export async function reclassificar(
  tenantId: string,
  userId: string,
  empresaId: string,
  p: { transacaoId: string; contaId: string; descricao: string; motivo: string },
): Promise<Resultado<{ historico: string }>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const prisma = getPrisma();
  const base = { tenantId, empresaId };
  const conta = await prisma.corePlanoConta.findFirst({ where: { id: p.contaId, empresaId, deletedAt: null }, select: { id: true } });
  if (!conta) return falha("Conta contábil não encontrada nesta empresa.");
  const t = await prisma.coreTransacao.findFirst({
    where: { id: p.transacaoId, empresaId, deletedAt: null },
    select: { id: true, agenciaId: true, historico: true, dc: true, valor: true, data: true },
  });
  if (!t) return falha("Transação não encontrada.");
  const bloqueio = motivoParaNaoContabilizar({ historico: t.historico, valor: decDoBanco(t.valor) });
  if (bloqueio) return falha(bloqueio);
  const contaBanco = await contaBancaria(tenantId, empresaId, t.agenciaId);
  const historico = p.descricao.trim();
  return prisma.$transaction(async (tx) => {
    const n = await cancelarLancamento(tx, base, t.id, p.motivo, userId);
    if (!n) return falha<{ historico: string }>("Lançamento não encontrado ou já cancelado.");
    if (!(await tomar(tx, t, { automatico: false }))) throw new Error("transação não voltou para pendente");
    await gravarPartidas(tx, base, t, { contaId: conta.id, descricao: historico, historico, dc: t.dc as Dc, tipoRegra: "manual" }, contaBanco);
    await gravarDecisao(tx, base, t.id, { resultado: "associada", contaId: conta.id, estrategia: "manual", motivo: `Associação manual: ${historico}` });
    return ok({ historico: t.historico });
  });
}

// ─── Composição (ADR-017) ─────────────────────────────────────────────────

export type Composicao = {
  transacaoId: string;
  historico: string;
  valor: string;
  dc: string;
  /** O primeiro lançamento lido: impede gravar por cima de quem alterou a composição enquanto você editava. */
  lancamentoVigenteId: string;
  componentes: { lancamentoId: string; contaId: string; historico: string; valor: string }[];
};

type Partida = { id: string; lancamentoId: string; contaId: string; dc: string; valor: { toString(): string }; historico: string; dataLancamento: Date };

/** Os pares vivos da transação, conferidos: cada lançamento tem D e C do mesmo valor, e os componentes fecham o extrato. */
function conferirPares(t: { dc: string; valor: { toString(): string } }, partidas: Partida[]): { componentes: Partida[]; bancos: Partida[] } | string {
  const porLancamento = new Map<string, Partida[]>();
  for (const p of partidas) porLancamento.set(p.lancamentoId, [...(porLancamento.get(p.lancamentoId) ?? []), p]);
  for (const par of porLancamento.values()) {
    if (par.length !== 2 || new Set(par.map((p) => p.dc)).size !== 2 || par[0].valor.toString() !== par[1].valor.toString()) {
      return "As partidas atuais não formam pares contábeis válidos.";
    }
  }
  if (!porLancamento.size) return "A transação não possui classificação vigente.";
  const componentes = partidas.filter((p) => p.dc === t.dc);
  const bancos = partidas.filter((p) => p.dc !== t.dc);
  const total = somaTodos(componentes.map((p) => decDoBanco(p.valor.toString())));
  if (!igual(total, decDoBanco(t.valor.toString()))) return "A classificação atual não fecha o valor do extrato.";
  if (new Set(bancos.map((b) => b.contaId)).size !== 1) return "A composição atual tem contas bancárias divergentes.";
  return { componentes, bancos };
}

export async function obterComposicao(tenantId: string, empresaId: string, transacaoId: string): Promise<Resultado<Composicao>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const r = await lerComposicaoTx(getPrisma(), empresaId, transacaoId);
  if (typeof r === "string") return falha(r);
  return ok({
    transacaoId: r.t.id, historico: r.t.historico, valor: r.t.valor.toString(), dc: r.t.dc, lancamentoVigenteId: r.componentes[0].lancamentoId,
    componentes: r.componentes.map((p) => ({ lancamentoId: p.lancamentoId, contaId: p.contaId, historico: p.historico, valor: p.valor.toString() })),
  });
}

/**
 * Troca os pares da transação pela composição informada: cada componente vira um par próprio (mesma
 * transação, `lancamentoId` novo, `ordemComposicao` 1, 2, 3…). As partidas substituídas ficam no banco,
 * canceladas; a auditoria guarda as duas composições.
 */
export async function alterarComposicao(
  tenantId: string,
  userId: string,
  empresaId: string,
  p: { transacaoId: string; lancamentoVigenteId: string; componentes: ComponenteDaComposicao[]; motivo: string },
): Promise<Resultado<{ antes: Composicao["componentes"]; depois: Composicao["componentes"] }>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const prisma = getPrisma();
  const base = { tenantId, empresaId };
  const contas = [...new Set(p.componentes.map((c) => c.contaId))];
  const achadas = await prisma.corePlanoConta.count({ where: { id: { in: contas }, empresaId, deletedAt: null } });
  if (achadas !== contas.length) return falha("Uma das contas contábeis não pertence a esta empresa.");

  return prisma.$transaction(async (tx) => {
    // Trava a transação: duas composições ao mesmo tempo não podem se sobrepor.
    await tx.$queryRaw`SELECT id FROM core_transacoes WHERE id = ${p.transacaoId} FOR UPDATE`;
    const r = await lerComposicaoTx(tx, empresaId, p.transacaoId);
    if (typeof r === "string") return falha<{ antes: Composicao["componentes"]; depois: Composicao["componentes"] }>(r);
    if (r.componentes[0].lancamentoId !== p.lancamentoVigenteId) return falha<{ antes: Composicao["componentes"]; depois: Composicao["componentes"] }>("A classificação mudou. Atualize a tela antes de salvar.");
    const erro = conferirComposicao(p.componentes, decDoBanco(r.t.valor));
    if (erro) return falha<{ antes: Composicao["componentes"]; depois: Composicao["componentes"] }>(erro);

    const agora = new Date();
    await tx.coreRegistro.updateMany({
      where: { id: { in: [...r.componentes, ...r.bancos].map((x) => x.id) } },
      data: { deletedAt: agora, canceladoEm: agora, canceladoPorId: userId, motivoCancelamento: corta(p.motivo, 300), chaveAtiva: null, chavePadraoAtiva: null },
    });
    const banco = r.bancos[0];
    const depois: Composicao["componentes"] = [];
    let ordem = 0;
    for (const c of p.componentes) {
      ordem++;
      const lancamentoId = randomUUID();
      const historico = corta(normalizarHistoricoContabil(c.historico), 500);
      const comum = {
        ...base, transacaoId: r.t.id, lancamentoId, ordemComposicao: ordem, agenciaId: r.t.agenciaId, historico, historicoExtrato: r.t.historico,
        tipoRegra: "manual", valor: paraBanco(c.valor), dataLancamento: banco.dataLancamento,
      };
      const oposto = r.t.dc === "D" ? "C" : "D";
      for (const [dc, contaId, descricao] of [
        [r.t.dc, c.contaId, historico],
        [oposto, banco.contaId, corta(normalizarHistoricoContabil(`Contrapartida bancária: ${c.historico}`), 500)],
      ] as const) {
        const chaves = { deletedAt: null, transacaoId: r.t.id, lancamentoId, dc: dc as Dc, ordemComposicao: ordem };
        await tx.coreRegistro.create({ data: { ...comum, dc, contaId, descricao, chaveAtiva: registroChaveAtiva(chaves), chavePadraoAtiva: registroChavePadraoAtiva(chaves) } });
      }
      depois.push({ lancamentoId, contaId: c.contaId, historico, valor: paraBanco(c.valor) });
    }
    await gravarDecisao(tx, base, r.t.id, {
      resultado: "associada", contaId: p.componentes.length === 1 ? p.componentes[0].contaId : null, estrategia: "manual", motivo: `Composição manual: ${p.motivo}`,
    });
    await tx.coreTransacao.update({ where: { id: r.t.id }, data: { autoRecusadoEm: null, autoRecusadoPorId: null } });
    const antes = r.componentes.map((x) => ({ lancamentoId: x.lancamentoId, contaId: x.contaId, historico: x.historico, valor: x.valor.toString() }));
    return ok({ antes, depois });
  });
}

async function lerComposicaoTx(tx: Tx, empresaId: string, transacaoId: string) {
  const t = await tx.coreTransacao.findFirst({ where: { id: transacaoId, empresaId, deletedAt: null }, select: { id: true, historico: true, dc: true, valor: true, status: true, agenciaId: true } });
  if (!t) return "Transação bancária não encontrada.";
  if (t.status !== "processada") return "A transação não possui classificação vigente.";
  const partidas = await tx.coreRegistro.findMany({
    where: { empresaId, transacaoId, deletedAt: null },
    select: { id: true, lancamentoId: true, contaId: true, dc: true, valor: true, historico: true, dataLancamento: true },
    orderBy: [{ ordemComposicao: "asc" }, { createdAt: "asc" }],
  });
  const r = conferirPares(t, partidas);
  return typeof r === "string" ? r : { t, ...r };
}

// ─── Fila agrupada ────────────────────────────────────────────────────────

/** Acima disto a fila agrupada descreve só uma fatia (e diz isso), em vez de carregar tudo na memória. */
export const TETO_DO_AGRUPAMENTO = 10_000;

export async function filaAgrupada(
  tenantId: string,
  empresaId: string,
  f: { agenciaId: string | null; mes: string | null },
): Promise<{ grupos: GrupoDePendencias[]; totalPendentes: number; parcial: boolean }> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return { grupos: [], totalPendentes: 0, parcial: false };
  const prisma = getPrisma();
  const periodo = f.mes ? limitesDoMes(f.mes) : null;
  // A fila do original: pendências com decisão `sem_regra` (as que o NEO já viu e não classificou).
  const where = {
    tenantId, empresaId, status: "pendente", deletedAt: null, decisoes: { some: { resultado: "sem_regra" } },
    ...(f.agenciaId ? { agenciaId: f.agenciaId } : {}),
    ...(periodo ? { data: { gte: periodo.inicio, lte: periodo.fim } } : {}),
  };
  const [totalPendentes, lidas] = await Promise.all([
    prisma.coreTransacao.count({ where }),
    prisma.coreTransacao.findMany({ where, select: { id: true, historico: true, dc: true, valor: true, data: true, agenciaId: true }, orderBy: [{ data: "asc" }, { id: "asc" }], take: TETO_DO_AGRUPAMENTO }),
  ]);
  const grupos = agruparPendencias(lidas.map((t) => ({ ...t, valor: decDoBanco(t.valor), data: dia(t.data) })));
  return { grupos: grupos.slice(0, 50), totalPendentes, parcial: totalPendentes > TETO_DO_AGRUPAMENTO };
}

// ─── Simulação de regra ───────────────────────────────────────────────────

export type Simulacao = { pendencias: number; amostras: string[]; contabilizadas: number; conflitos: number; amostrasDeConflito: string[] };

/**
 * O alcance de uma regra, sem gravar nada: quantas pendências ela pegaria e quantas transações já
 * contabilizadas ela também casaria — e, dessas, quantas estão numa conta diferente (conflito). Usa
 * a mesma função de casamento do motor: uma segunda régua faria a prévia mentir.
 */
export async function simularRegra(
  tenantId: string,
  empresaId: string,
  p: { historico: string; dc: Dc; agenciaId: string | null; contaId: string },
): Promise<Resultado<Simulacao>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const prisma = getPrisma();
  if (!(await prisma.corePlanoConta.findFirst({ where: { id: p.contaId, empresaId, deletedAt: null }, select: { id: true } }))) return falha("Conta contábil não encontrada nesta empresa.");
  const s: Simulacao = { pendencias: 0, amostras: [], contabilizadas: 0, conflitos: 0, amostrasDeConflito: [] };
  let cursor: string | undefined;
  // Em lotes, para uma empresa com anos de extrato não carregar tudo de uma vez.
  for (;;) {
    const lote = await prisma.coreTransacao.findMany({
      where: { empresaId, deletedAt: null, dc: p.dc, status: { in: ["pendente", "processada"] }, ...(p.agenciaId ? { agenciaId: p.agenciaId } : {}) },
      select: { id: true, historico: true, status: true, registros: { where: { deletedAt: null, dc: p.dc }, select: { contaId: true } } },
      orderBy: { id: "asc" },
      take: 2000,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!lote.length) break;
    for (const t of lote) {
      if (estrategiaDeMatch(p.historico, t.historico) === null) continue;
      if (t.status === "pendente") {
        s.pendencias++;
        if (!s.amostras.includes(t.historico) && s.amostras.length < 5) s.amostras.push(t.historico);
        continue;
      }
      // Processada sem partida não é contabilizada: não infla a prévia.
      if (!t.registros.length) continue;
      s.contabilizadas++;
      if (t.registros.some((r) => r.contaId !== p.contaId)) {
        s.conflitos++;
        if (s.amostrasDeConflito.length < 5) s.amostrasDeConflito.push(t.historico);
      }
    }
    cursor = lote[lote.length - 1].id;
  }
  return ok(s);
}

// ─── Classificar e criar a regra da seleção ───────────────────────────────

export type ResultadoComRegra = ResultadoManual & { regraCriada: string | null; semelhantes: number | null };

/**
 * Classifica a seleção e cadastra a regra que a descreve. A regra é conferida ANTES de classificar
 * (seleção de um lado só, padrão ainda livre): o original fazia tudo numa transação e desfazia o lote se
 * o cadastro falhasse; aqui cada transação é a sua, então a recusa vem antes de qualquer gravação.
 * Com "aplicar nos semelhantes", o NEO roda em seguida na conta bancária da regra.
 */
export async function classificarComRegra(
  tenantId: string,
  empresaId: string,
  d: EntradaClassificacaoManual,
  regra: { historico: string; agenciaId: string | null; manterHistorico: boolean; aplicarNosSemelhantes: boolean },
): Promise<Resultado<ResultadoComRegra>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const prisma = getPrisma();
  const lados = new Set((await prisma.coreTransacao.findMany({ where: { id: { in: d.transacaoIds }, empresaId, status: "pendente", deletedAt: null }, select: { dc: true } })).map((t) => t.dc));
  if (lados.size > 1) return falha("A seleção mistura débito e crédito, e uma regra vale para um lado só. Separe em duas seleções — ou classifique sem criar regra.");
  if (!lados.size) return falha("Nenhuma das transações selecionadas está pendente.");
  const dc = [...lados][0] as Dc;
  const entrada: EntradaRegra = {
    contaId: d.contaId, agenciaId: regra.agenciaId, descricao: (d.descricao ?? regra.historico).slice(0, 500), historico: regra.historico, dc,
    tipo: "automatica", manterHistorico: regra.manterHistorico,
  };
  const chave = regraChaveAtiva({ ativa: true, deletedAt: null, agenciaId: regra.agenciaId, historicoNormalizado: historicoNormalizado(regra.historico) });
  if (await prisma.coreRegra.findFirst({ where: { empresaId, chaveAtiva: chave }, select: { id: true } })) {
    return falha("Já existe uma regra ativa com este padrão no banco selecionado.");
  }

  const classificacao = await classificarManual(tenantId, empresaId, d);
  if (!classificacao.ok) return classificacao;
  if (!classificacao.valor.classificadas.length) {
    return falha("Nenhuma das transações selecionadas pôde ser classificada, então não há seleção para a regra descrever.");
  }
  const criada = await salvarRegra(tenantId, empresaId, null, entrada);
  if (!criada.ok) return ok({ ...classificacao.valor, regraCriada: null, semelhantes: null });
  let semelhantes: number | null = null;
  if (regra.aplicarNosSemelhantes) {
    const r = await processarNeo(tenantId, empresaId, { agenciaId: regra.agenciaId, mes: null });
    semelhantes = r.ok ? r.valor.associadas : null;
  }
  return ok({ ...classificacao.valor, regraCriada: criada.valor.id, semelhantes });
}

/** Cria a regra validada e roda o NEO só no escopo revisado na tela (`criar_regra_e_aplicar`). */
export async function criarRegraEAplicar(tenantId: string, empresaId: string, d: EntradaRegra, mes: string | null) {
  if (d.tipo !== "automatica") {
    return falha<{ regraId: string; associadas: number }>("Só regra automática pode ser criada e aplicada de uma vez: regra manual não é usada pelo motor.");
  }
  const regra = await salvarRegra(tenantId, empresaId, null, d);
  if (!regra.ok) return regra;
  const r = await processarNeo(tenantId, empresaId, { agenciaId: d.agenciaId, mes });
  return ok({ regraId: regra.valor.id, associadas: r.ok ? r.valor.associadas : 0 });
}
