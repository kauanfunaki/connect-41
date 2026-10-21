// A leitura e a gravação das regras de conciliação (fila do BPO, 21/10). A
// regra de quem casa com quem e de quando lançar sozinho é pura e mora em
// `regras.ts`; aqui é o banco.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { saoPauloParts } from "@/lib/agenda";
import { centavosDeDecimal } from "../contas";
import { decimalDeCentavos, validarCamposDoLancamento } from "../manual";
import { competenciaDoInstante } from "../periodo";
import { categoriaDaEmpresa } from "../planoDeContas";
import { centroNaCriacao } from "../centroDeCustoServidor";
import { projetoInformado } from "../projetoServidor";
import { apagarBaixa, RecusaDaBaixa } from "../baixa/servidor";
import { TIPOS_COM_EXTRATO } from "../tiposDeConta";
import { empresaLidaDoOmie } from "@/lib/integracoes/omie/viradaServidor";
import { rankearCandidatos } from "./casamento";
import { candidatosDaEmpresa } from "./candidatos";
import { lancarEConciliar, RecusaDaLinha } from "./lancarDaTransacao";
import { decisaoDaLinha, regraCasa, regrasQueCasam, tipoDaRegra, type RegraParaCasar } from "./regras";

type Db = ReturnType<typeof getPrisma> | Prisma.TransactionClient;

/** A regra como as telas e a gravação usam: a condição e a ação, com os nomes. */
export type RegraDaEmpresa = RegraParaCasar & {
  companyId: string;
  counterpartyId: string;
  categoryId: string | null;
  costCenterId: string | null;
  projectId: string | null;
  descricao: string | null;
  contraparteNome: string;
  categoriaNome: string | null;
  centroNome: string | null;
  projetoNome: string | null;
  contaNome: string | null;
};

const SELECAO = {
  id: true,
  companyId: true,
  name: true,
  direction: true,
  textContains: true,
  minAmount: true,
  maxAmount: true,
  bankAccountId: true,
  counterpartyId: true,
  categoryId: true,
  costCenterId: true,
  projectId: true,
  description: true,
  mode: true,
  active: true,
  counterparty: { select: { name: true } },
  category: { select: { name: true } },
  costCenter: { select: { name: true } },
  project: { select: { name: true } },
  bankAccount: { select: { nickname: true } },
} satisfies Prisma.BankReconciliationRuleSelect;

type LinhaDaRegra = Prisma.BankReconciliationRuleGetPayload<{ select: typeof SELECAO }>;

function paraRegra(r: LinhaDaRegra): RegraDaEmpresa {
  return {
    id: r.id,
    companyId: r.companyId,
    nome: r.name,
    sentido: r.direction,
    texto: r.textContains,
    minCentavos: r.minAmount === null ? null : centavosDeDecimal(r.minAmount),
    maxCentavos: r.maxAmount === null ? null : centavosDeDecimal(r.maxAmount),
    bankAccountId: r.bankAccountId,
    modo: r.mode,
    ativa: r.active,
    counterpartyId: r.counterpartyId,
    categoryId: r.categoryId,
    costCenterId: r.costCenterId,
    projectId: r.projectId,
    descricao: r.description,
    contraparteNome: r.counterparty.name,
    categoriaNome: r.category?.name ?? null,
    centroNome: r.costCenter?.name ?? null,
    projetoNome: r.project?.name ?? null,
    contaNome: r.bankAccount?.nickname ?? null,
  };
}

/** As regras da empresa, pela ordem do nome. */
export async function regrasDaEmpresa(db: Db, tenantId: string, companyId: string, opcoes: { soAtivas?: boolean } = {}): Promise<RegraDaEmpresa[]> {
  const linhas = await db.bankReconciliationRule.findMany({
    where: { tenantId, companyId, ...(opcoes.soAtivas ? { active: true } : {}) },
    select: SELECAO,
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  return linhas.map(paraRegra);
}

/** Uma regra do tenant, ou nula. */
export async function regraDoTenant(db: Db, tenantId: string, id: string): Promise<RegraDaEmpresa | null> {
  const r = await db.bankReconciliationRule.findFirst({ where: { id, tenantId }, select: SELECAO });
  return r ? paraRegra(r) : null;
}

/** As regras que já lançaram nestas linhas e foram desfeitas — por linha. */
export async function regrasDesfeitas(db: Db, tenantId: string, transactionIds: string[]): Promise<Map<string, Set<string>>> {
  const mapa = new Map<string, Set<string>>();
  if (transactionIds.length === 0) return mapa;
  const desfeitas = await db.bankRuleApplication.findMany({
    where: { tenantId, transactionId: { in: transactionIds }, undoneAt: { not: null }, ruleId: { not: null } },
    select: { transactionId: true, ruleId: true },
  });
  for (const d of desfeitas) {
    const s = mapa.get(d.transactionId) ?? new Set<string>();
    s.add(d.ruleId!);
    mapa.set(d.transactionId, s);
  }
  return mapa;
}

// ─── Lançar pela regra ──────────────────────────────────────────────────────

/** A ação da regra conferida no banco: o que o lançamento vai levar. */
export type AcaoPronta = {
  regra: RegraDaEmpresa;
  kind: "PAGAR" | "RECEBER";
  counterpartyId: string;
  categoryId: string | null;
  costCenterId: string | null;
  projectId: string | null;
};

/**
 * Confere a ação da regra contra o cadastro de hoje: a contraparte ativa na
 * empresa, a categoria do plano dela e do tipo certo, o centro e o projeto
 * ativos. Uma vez por regra — a prévia e a importação lançam várias linhas.
 */
export async function prepararAcao(tenantId: string, regra: RegraDaEmpresa): Promise<{ ok: true; acao: AcaoPronta } | { ok: false; erro: string }> {
  const prisma = getPrisma();
  const kind = tipoDaRegra(regra.sentido);
  const contraparte = await prisma.financeCounterparty.findFirst({
    where: { id: regra.counterpartyId, tenantId, companyId: regra.companyId },
    select: { id: true, active: true, defaultCostCenterId: true },
  });
  if (!contraparte || !contraparte.active) return { ok: false, erro: `Regra "${regra.nome}": a contraparte está inativa — edite a regra.` };
  if (kind === "PAGAR" && !regra.categoryId) {
    return { ok: false, erro: `Regra "${regra.nome}": a categoria saiu do plano — edite a regra.` };
  }
  if (regra.categoryId) {
    const categoria = await prisma.financeCategory.findFirst({
      where: { ...categoriaDaEmpresa(tenantId, regra.companyId, regra.categoryId, kind), active: true },
      select: { id: true },
    });
    if (!categoria) return { ok: false, erro: `Regra "${regra.nome}": a categoria não vale mais para esta empresa — edite a regra.` };
  }
  const centro = await centroNaCriacao({
    tenantId,
    companyId: regra.companyId,
    informadoId: regra.costCenterId,
    padraoDaContraparteId: contraparte.defaultCostCenterId,
  });
  if (!centro.ok) return { ok: false, erro: `Regra "${regra.nome}": ${centro.erro}` };
  const projeto = await projetoInformado({ tenantId, companyId: regra.companyId, informadoId: regra.projectId });
  if (!projeto.ok) return { ok: false, erro: `Regra "${regra.nome}": ${projeto.erro}` };
  return {
    ok: true,
    acao: { regra, kind, counterpartyId: contraparte.id, categoryId: regra.categoryId, costCenterId: centro.centroId, projectId: projeto.projetoId },
  };
}

/** A linha do extrato como a gravação pela regra precisa dela. */
export type LinhaParaLancar = {
  id: string;
  bankAccountId: string;
  companyId: string;
  status: "PENDENTE" | "CONCILIADA" | "IGNORADA";
  centavos: number;
  postedAt: Date;
  memo: string | null;
  nome: string | null;
};

const SELECAO_DA_LINHA = {
  id: true,
  bankAccountId: true,
  status: true,
  amount: true,
  postedAt: true,
  memo: true,
  payeeName: true,
  bankAccount: { select: { companyId: true, type: true } },
} satisfies Prisma.BankTransactionSelect;

function paraLinha(t: Prisma.BankTransactionGetPayload<{ select: typeof SELECAO_DA_LINHA }>): LinhaParaLancar {
  return {
    id: t.id,
    bankAccountId: t.bankAccountId,
    companyId: t.bankAccount.companyId,
    status: t.status,
    centavos: centavosDeDecimal(t.amount),
    postedAt: t.postedAt,
    memo: t.memo,
    nome: t.payeeName,
  };
}

/** Uma linha do extrato do tenant, ou nula. */
export async function linhaDoTenant(tenantId: string, id: string): Promise<LinhaParaLancar | null> {
  const t = await getPrisma().bankTransaction.findFirst({ where: { id, tenantId }, select: SELECAO_DA_LINHA });
  return t ? paraLinha(t) : null;
}

/**
 * Lança uma linha pela regra: o lançamento pago e conciliado, e o registro de
 * qual regra lançou. Numa transação própria — na prévia e na importação, uma
 * linha recusada não desfaz as outras.
 */
export async function lancarLinhaPelaRegra(p: {
  tenantId: string;
  userId: string | null;
  acao: AcaoPronta;
  linha: LinhaParaLancar;
  automatico: boolean;
}): Promise<{ ok: true; entryId: string; applicationId: string } | { ok: false; erro: string }> {
  const { acao, linha } = p;
  if (linha.companyId !== acao.regra.companyId) return { ok: false, erro: "A linha é de outra empresa." };
  if (linha.status !== "PENDENTE") return { ok: false, erro: "Esta linha não está mais pendente — atualize a tela." };
  if (!regraCasa(acao.regra, linha)) return { ok: false, erro: `A regra "${acao.regra.nome}" não pega esta linha.` };

  const dataKey = saoPauloParts(linha.postedAt).dateKey;
  const v = validarCamposDoLancamento(
    {
      kind: acao.kind,
      competencia: competenciaDoInstante(linha.postedAt),
      vencimento: dataKey,
      valor: decimalDeCentavos(Math.abs(linha.centavos)),
      descricao: (acao.regra.descricao ?? linha.memo ?? linha.nome ?? "").slice(0, 255),
      pagoEm: dataKey,
      categoryId: acao.categoryId,
    },
    saoPauloParts(new Date()).dateKey
  );
  if (!v.ok) return { ok: false, erro: v.erro };
  const d = v.dados;

  try {
    const r = await getPrisma().$transaction(async (tx) => {
      const { entryId } = await lancarEConciliar(tx, {
        tenantId: p.tenantId,
        companyId: linha.companyId,
        userId: p.userId,
        transacao: { id: linha.id, bankAccountId: linha.bankAccountId },
        dataKey,
        kind: d.kind,
        centavos: d.centavos,
        counterpartyId: acao.counterpartyId,
        categoryId: d.categoryId,
        costCenterId: acao.costCenterId,
        projectId: acao.projectId,
        competencia: d.competencia,
        descricao: d.descricao,
      });
      const registro = await tx.bankRuleApplication.create({
        data: {
          tenantId: p.tenantId,
          companyId: linha.companyId,
          ruleId: acao.regra.id,
          ruleName: acao.regra.nome,
          transactionId: linha.id,
          financeEntryId: entryId,
          automatic: p.automatico,
          createdById: p.userId,
        },
        select: { id: true },
      });
      return { entryId, applicationId: registro.id };
    });
    return { ok: true, ...r };
  } catch (err) {
    if (err instanceof RecusaDaLinha || err instanceof RecusaDaBaixa) return { ok: false, erro: err.message };
    throw err;
  }
}

// ─── Na importação do extrato ───────────────────────────────────────────────

/**
 * Depois de importar o extrato: as regras em modo "lançar" lançam as linhas
 * novas que pegam sem dúvida (`decisaoDaLinha`). Só as linhas desta
 * importação — a linha que já estava pendente ficou assim por escolha de
 * alguém, e a reimportação não traz linha nova. Empresa ainda lida do Omie não
 * lança nada: até a virada, o Omie é a fonte.
 */
export async function lancarPelasRegrasNaImportacao(p: {
  tenantId: string;
  userId: string | null;
  bankAccountId: string;
  importId: string;
}): Promise<{ lancadas: number; recusas: string[] }> {
  const prisma = getPrisma();
  const conta = await prisma.bankAccount.findFirst({ where: { id: p.bankAccountId, tenantId: p.tenantId }, select: { companyId: true } });
  if (!conta) return { lancadas: 0, recusas: [] };
  const regras = await regrasDaEmpresa(prisma, p.tenantId, conta.companyId, { soAtivas: true });
  if (!regras.some((r) => r.modo === "LANCAR")) return { lancadas: 0, recusas: [] };
  if (await empresaLidaDoOmie(p.tenantId, conta.companyId)) return { lancadas: 0, recusas: [] };

  const linhas = (
    await prisma.bankTransaction.findMany({
      where: { tenantId: p.tenantId, bankAccountId: p.bankAccountId, importId: p.importId, status: "PENDENTE" },
      select: SELECAO_DA_LINHA,
      orderBy: { postedAt: "asc" },
    })
  ).map(paraLinha);
  if (linhas.length === 0) return { lancadas: 0, recusas: [] };

  const [candidatos, desfeitas] = await Promise.all([
    candidatosDaEmpresa(p.tenantId, conta.companyId, linhas.map((l) => ({ amount: decimalDeCentavos(l.centavos) }))),
    regrasDesfeitas(prisma, p.tenantId, linhas.map((l) => l.id)),
  ]);

  const acoes = new Map<string, Awaited<ReturnType<typeof prepararAcao>>>();
  let lancadas = 0;
  const recusas: string[] = [];
  for (const linha of linhas) {
    const dataKey = saoPauloParts(linha.postedAt).dateKey;
    const ranking = rankearCandidatos({ centavos: linha.centavos, dataKey, memo: linha.memo, nome: linha.nome }, candidatos);
    const decisao = decisaoDaLinha(regras, linha, {
      lidaDoOmie: false,
      candidatosDeMesmoValor: ranking.length,
      desfeitas: desfeitas.get(linha.id),
    });
    if (decisao.tipo !== "lancar") continue;
    let preparada = acoes.get(decisao.regra.id);
    if (!preparada) {
      preparada = await prepararAcao(p.tenantId, decisao.regra);
      acoes.set(decisao.regra.id, preparada);
      if (!preparada.ok) recusas.push(preparada.erro);
    }
    if (!preparada.ok) continue;
    const r = await lancarLinhaPelaRegra({ tenantId: p.tenantId, userId: p.userId, acao: preparada.acao, linha, automatico: true });
    if (r.ok) lancadas++;
    else recusas.push(r.erro);
  }
  return { lancadas, recusas: [...new Set(recusas)] };
}

// ─── A prévia ───────────────────────────────────────────────────────────────

export type ItemDaPrevia = {
  transactionId: string;
  dataKey: string;
  contaNome: string;
  memo: string | null;
  nome: string | null;
  centavos: number;
  /** Lançamentos em aberto do mesmo valor: a linha pode ser um deles. */
  candidatosDeMesmoValor: number;
  /** Outras regras ativas que também pegam a linha. */
  outrasRegras: number;
  /** Esta regra já lançou aqui e alguém desfez. */
  desfeita: boolean;
};

/** Teto da prévia. Mais que isso, aplica-se em partes — e alguém deveria olhar a regra. */
export const LIMITE_DA_PREVIA = 500;

/**
 * As linhas pendentes da empresa que a regra pegaria agora, das contas com
 * extrato, da mais antiga para a mais nova. Nada é gravado aqui.
 */
export async function previaDaRegra(tenantId: string, regra: RegraDaEmpresa): Promise<{ itens: ItemDaPrevia[]; limitado: boolean }> {
  const prisma = getPrisma();
  const brutas = await prisma.bankTransaction.findMany({
    where: {
      tenantId,
      status: "PENDENTE",
      amount: regra.sentido === "SAIDA" ? { lt: 0 } : { gt: 0 },
      ...(regra.bankAccountId ? { bankAccountId: regra.bankAccountId } : {}),
      bankAccount: { companyId: regra.companyId, type: { in: [...TIPOS_COM_EXTRATO] } },
    },
    select: { ...SELECAO_DA_LINHA, bankAccount: { select: { companyId: true, type: true, nickname: true } } },
    orderBy: { postedAt: "asc" },
    take: 5_000,
  });
  const casam = brutas.filter((t) => regraCasa(regra, { ...paraLinha(t) }));
  const limitado = casam.length > LIMITE_DA_PREVIA;
  const linhas = casam.slice(0, LIMITE_DA_PREVIA);
  if (linhas.length === 0) return { itens: [], limitado: false };

  const [candidatos, desfeitas, outras] = await Promise.all([
    candidatosDaEmpresa(tenantId, regra.companyId, linhas),
    regrasDesfeitas(prisma, tenantId, linhas.map((l) => l.id)),
    regrasDaEmpresa(prisma, tenantId, regra.companyId, { soAtivas: true }),
  ]);
  const semEsta = outras.filter((r) => r.id !== regra.id);
  return {
    limitado,
    itens: linhas.map((t) => {
      const l = paraLinha(t);
      const dataKey = saoPauloParts(t.postedAt).dateKey;
      return {
        transactionId: t.id,
        dataKey,
        contaNome: t.bankAccount.nickname,
        memo: t.memo,
        nome: t.payeeName,
        centavos: l.centavos,
        candidatosDeMesmoValor: rankearCandidatos({ centavos: l.centavos, dataKey, memo: l.memo, nome: l.nome }, candidatos).length,
        outrasRegras: regrasQueCasam(semEsta, l).length,
        desfeita: desfeitas.get(t.id)?.has(regra.id) ?? false,
      };
    }),
  };
}

// ─── Desfazer ───────────────────────────────────────────────────────────────

export class RecusaDoDesfazer extends Error {}

/**
 * Desfaz o que uma regra lançou: a linha volta às pendentes, a baixa sai, e o
 * lançamento é cancelado — foi a regra que o criou, não há "antes" para voltar
 * (como a ponta da transferência desfeita). A regra não lança sozinha de novo
 * nesta linha (`regrasDesfeitas`).
 *
 * Se alguém já desfez a conciliação pela tela, o lançamento ficou em aberto: é
 * cancelado se continua sem baixa. Com baixa de outra origem, ou conciliado
 * com outra linha, é recusa — alguém mexeu nele, e a decisão é de quem mexeu.
 */
export async function desfazerLancamentoDaRegra(tx: Prisma.TransactionClient, tenantId: string, applicationId: string, userId: string | null) {
  const a = await tx.bankRuleApplication.findFirst({
    where: { id: applicationId, tenantId },
    select: {
      id: true,
      undoneAt: true,
      transactionId: true,
      financeEntryId: true,
      financeEntry: {
        select: {
          status: true,
          payments: { select: { id: true, origin: true, bankMatch: { select: { id: true, transactionId: true } } } },
          bankMatches: { select: { id: true, transactionId: true } },
        },
      },
      transaction: { select: { status: true, matches: { select: { id: true, financeEntryId: true } } } },
    },
  });
  if (!a) throw new RecusaDoDesfazer("Registro não encontrado.");
  if (a.undoneAt) throw new RecusaDoDesfazer("Este lançamento da regra já foi desfeito.");
  const conta = a.financeEntry;

  if (conta.status !== "CANCELADO") {
    const daLinha = conta.payments.filter((b) => b.bankMatch?.transactionId === a.transactionId);
    const outras = conta.payments.filter((b) => b.bankMatch?.transactionId !== a.transactionId);
    if (outras.length > 0 || conta.bankMatches.some((m) => m.transactionId !== a.transactionId)) {
      throw new RecusaDoDesfazer("Este lançamento já tem outra baixa ou outra conciliação — desfaça por Contas a pagar e a receber.");
    }
    if (daLinha.length > 0) {
      // A linha conciliada só com este lançamento: é o que a regra fez.
      if (a.transaction.matches.some((m) => m.financeEntryId !== a.financeEntryId)) {
        throw new RecusaDoDesfazer("A linha do extrato foi conciliada junto com outros lançamentos — desfaça a conciliação primeiro.");
      }
      await tx.bankTransactionMatch.deleteMany({ where: { transactionId: a.transactionId, financeEntryId: a.financeEntryId } });
      for (const b of daLinha) await apagarBaixa(tx, b.id, tenantId);
      const voltou = await tx.bankTransaction.updateMany({
        where: { id: a.transactionId, tenantId, status: "CONCILIADA" },
        data: { status: "PENDENTE", reconciledAt: null, reconciledById: null },
      });
      if (voltou.count !== 1) throw new RecusaDoDesfazer("A linha do extrato acabou de mudar — atualize a tela.");
    }
    await tx.financeEntry.updateMany({
      where: { id: a.financeEntryId, tenantId },
      data: { status: "CANCELADO", closeReason: "CANCELADO", paidAt: null, paidPrincipal: "0" },
    });
  }
  const marcado = await tx.bankRuleApplication.updateMany({
    where: { id: a.id, undoneAt: null },
    data: { undoneAt: new Date(), undoneById: userId },
  });
  if (marcado.count !== 1) throw new RecusaDoDesfazer("Este lançamento da regra acabou de ser desfeito por outra pessoa.");
  return { transactionId: a.transactionId, financeEntryId: a.financeEntryId };
}
