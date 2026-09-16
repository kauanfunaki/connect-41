// As consultas da cobrança: a fila, o detalhe do título, os acordos, a régua e
// o que o portal mostra. As decisões são das regras puras desta pasta; aqui só
// se busca o que elas precisam e se monta a linha que a tela lê.
//
// O escopo é o primeiro argumento, como em `consultas.ts` do financeiro: a
// equipe vê o tenant, o portal vê só as empresas do grupo — e lista vazia é
// **nada**, nunca tudo.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { saoPauloParts } from "@/lib/agenda";
import { nomeExibicao } from "@/lib/companyName";
import { centavosDeDecimal } from "../contas";
import { whereDoEscopo, type EscopoFinanceiro } from "../consultas";
import { diasEntre } from "../periodo";
import { faixaDoAtraso, type ChaveDaFaixa } from "../analise";
import {
  situacaoDeCobranca,
  proximaAcao,
  prioridadeNaFila,
  ordenarFila,
  type SituacaoDeCobranca,
  type UltimoContato,
  type ProximaAcao,
  type CanalDeContato,
  type ResultadoDoContato,
  type StatusDoAcordo,
} from "./regras";
import { avaliarRegua, lerPassos, PASSOS_PADRAO, type VereditoDaRegua } from "./regua";
import { resumoDoAcordo, type ResumoDoAcordo } from "./acordo";

export const MODULO_DE_COBRANCA = "bpo_cobranca";

/** Início do dia de hoje em São Paulo — vencimento antes disto é vencido. */
function inicioDeHoje(hojeKey: string): Date {
  return new Date(`${hojeKey}T00:00:00-03:00`);
}

/** Título a receber vencido e em aberto: o universo da cobrança. */
export function whereVencidosEmAberto(e: EscopoFinanceiro, hojeKey: string): Prisma.FinanceEntryWhereInput {
  return {
    ...whereDoEscopo(e),
    kind: "RECEBER",
    status: { in: ["PROVISORIO", "CONFERIDO"] },
    paidAt: null,
    dueDate: { lt: inicioDeHoje(hojeKey) },
  };
}

// ─── Régua ──────────────────────────────────────────────────────────────────

export type ConfigDaRegua = { ligada: boolean; passos: number[]; passosTexto: string; existe: boolean };

/** A régua do tenant. Sem linha, desligada com os passos padrão. */
export async function configDaRegua(tenantId: string): Promise<ConfigDaRegua> {
  const prisma = getPrisma();
  const c = await prisma.collectionReminderConfig.findUnique({ where: { tenantId }, select: { enabled: true, steps: true } });
  if (!c) return { ligada: false, passos: PASSOS_PADRAO, passosTexto: PASSOS_PADRAO.join(","), existe: false };
  const lidos = lerPassos(c.steps);
  // Passos gravados que deixaram de valer (regra mais estreita depois) não
  // podem virar "manda para todo mundo": a régua fica desligada até alguém salvar.
  if (!lidos.ok) return { ligada: false, passos: PASSOS_PADRAO, passosTexto: c.steps, existe: true };
  return { ligada: c.enabled, passos: lidos.passos, passosTexto: lidos.passos.join(","), existe: true };
}

export async function empresasForaDaRegua(tenantId: string): Promise<Set<string>> {
  const prisma = getPrisma();
  const linhas = await prisma.collectionReminderOptOut.findMany({ where: { tenantId }, select: { companyId: true } });
  return new Set(linhas.map((l) => l.companyId));
}

// ─── A linha de cobrança ────────────────────────────────────────────────────

const SELECAO_DA_LINHA = {
  id: true,
  status: true,
  closeReason: true,
  paidAt: true,
  amount: true,
  dueDate: true,
  description: true,
  companyId: true,
  counterpartyId: true,
  agreementId: true,
  collectionOwnerId: true,
  lossAt: true,
  company: { select: { name: true, displayName: true } },
  counterparty: { select: { name: true, email: true } },
  collectionOwner: { select: { name: true } },
  agreement: { select: { status: true } },
  collectionContacts: {
    orderBy: [{ contactedAt: "desc" }, { createdAt: "desc" }],
    take: 1,
    select: { outcome: true, channel: true, contactedAt: true, nextActionAt: true },
  },
  reminderLogs: { select: { step: true } },
} satisfies Prisma.FinanceEntrySelect;

type Bruta = Prisma.FinanceEntryGetPayload<{ select: typeof SELECAO_DA_LINHA }>;

export type LinhaDeCobranca = {
  id: string;
  empresaId: string;
  empresaNome: string;
  sacadoId: string;
  sacadoNome: string;
  sacadoEmail: string | null;
  descricao: string | null;
  valorCentavos: number;
  vencimento: Date;
  vencimentoKey: string;
  diasDeAtraso: number;
  faixa: ChaveDaFaixa;
  situacao: SituacaoDeCobranca | null;
  acao: ProximaAcao;
  prioridade: number;
  responsavelId: string | null;
  responsavelNome: string | null;
  ultimoContato: (UltimoContato & { canal: CanalDeContato; em: Date }) | null;
  parcelaDeAcordo: boolean;
  regua: VereditoDaRegua;
};

function ultimoContatoDe(b: Bruta): LinhaDeCobranca["ultimoContato"] {
  const c = b.collectionContacts[0];
  if (!c) return null;
  return {
    resultado: c.outcome,
    canal: c.channel,
    em: c.contactedAt,
    contatoKey: saoPauloParts(c.contactedAt).dateKey,
    proximaAcaoKey: c.nextActionAt ? saoPauloParts(c.nextActionAt).dateKey : null,
  };
}

function montarLinha(
  b: Bruta,
  hojeKey: string,
  regua: { config: ConfigDaRegua; fora: Set<string> }
): LinhaDeCobranca {
  const vencimentoKey = saoPauloParts(b.dueDate).dateKey;
  const ultimoContato = ultimoContatoDe(b);
  const situacao = situacaoDeCobranca(
    { status: b.status, closeReason: b.closeReason, paidAt: b.paidAt, vencimentoKey, statusDoAcordo: b.agreement?.status ?? null, ultimoContato },
    hojeKey
  );
  const acao = proximaAcao({ ultimoContato }, situacao, hojeKey);
  return {
    id: b.id,
    empresaId: b.companyId,
    empresaNome: nomeExibicao(b.company),
    sacadoId: b.counterpartyId,
    sacadoNome: b.counterparty.name,
    sacadoEmail: b.counterparty.email,
    descricao: b.description,
    valorCentavos: centavosDeDecimal(b.amount),
    vencimento: b.dueDate,
    vencimentoKey,
    diasDeAtraso: Math.max(0, diasEntre(vencimentoKey, hojeKey)),
    faixa: faixaDoAtraso(vencimentoKey, hojeKey),
    situacao,
    acao,
    prioridade: situacao ? prioridadeNaFila(situacao, acao) : 9,
    responsavelId: b.collectionOwnerId,
    responsavelNome: b.collectionOwner?.name ?? null,
    ultimoContato,
    parcelaDeAcordo: b.agreementId !== null,
    regua: avaliarRegua(
      {
        situacao,
        vencimentoKey,
        ultimoContato,
        email: b.counterparty.email,
        empresaForaDaRegua: regua.fora.has(b.companyId),
        enviados: b.reminderLogs.map((l) => l.step),
      },
      regua.config,
      hojeKey
    ),
  };
}

export type FiltroDaFila = {
  empresaId?: string | null;
  faixa?: ChaveDaFaixa | null;
  situacao?: SituacaoDeCobranca | null;
  /** Id de usuário, ou "sem" para sem responsável. */
  responsavel?: string | null;
};

const LIMITE_DA_FILA = 2000;

/**
 * A fila: vencidos em aberto (e os perdidos, quando é isso que se filtra), já
 * com situação, próxima ação e veredito da régua, na ordem de trabalho.
 *
 * Faixa e situação são filtradas **depois** de calcular, pelo mesmo motivo de
 * `listarContas`: são derivadas, e repetir a regra em SQL é como as duas
 * versões começam a discordar.
 */
export async function filaDeCobranca(tenantId: string, filtro: FiltroDaFila, agora: Date) {
  const prisma = getPrisma();
  const hojeKey = saoPauloParts(agora).dateKey;
  const escopo: EscopoFinanceiro = { tenantId, companyIds: filtro.empresaId ? [filtro.empresaId] : null };
  const doResponsavel: Prisma.FinanceEntryWhereInput =
    filtro.responsavel === "sem" ? { collectionOwnerId: null } : filtro.responsavel ? { collectionOwnerId: filtro.responsavel } : {};
  const where: Prisma.FinanceEntryWhereInput =
    filtro.situacao === "PERDA"
      ? { ...whereDoEscopo(escopo), kind: "RECEBER", closeReason: "PERDA", ...doResponsavel }
      : { ...whereVencidosEmAberto(escopo, hojeKey), ...doResponsavel };

  const [brutas, config, fora] = await Promise.all([
    prisma.financeEntry.findMany({ where, select: SELECAO_DA_LINHA, orderBy: { dueDate: "asc" }, take: LIMITE_DA_FILA + 1 }),
    configDaRegua(tenantId),
    empresasForaDaRegua(tenantId),
  ]);
  const todas = brutas.slice(0, LIMITE_DA_FILA).map((b) => montarLinha(b, hojeKey, { config, fora }));
  const filtradas = todas.filter(
    (l) => (!filtro.faixa || l.faixa === filtro.faixa) && (!filtro.situacao || l.situacao === filtro.situacao)
  );
  const linhas = ordenarFila(filtradas);
  return {
    linhas,
    paraHoje: linhas.filter((l) => l.acao.paraHoje),
    limitado: brutas.length > LIMITE_DA_FILA,
    config,
    totais: {
      titulos: linhas.length,
      centavos: linhas.reduce((n, l) => n + l.valorCentavos, 0),
      semContato: linhas.filter((l) => l.situacao === "VENCIDO_SEM_CONTATO").length,
      semEmail: linhas.filter((l) => "motivo" in l.regua && l.regua.motivo === "SEM_EMAIL").length,
    },
  };
}

/**
 * A situação de cobrança de lançamentos já listados — o selo de `/receber`.
 * Uma consulta pelos ids, sem refazer a tela.
 */
export async function situacoesDeCobranca(tenantId: string, entryIds: string[], hojeKey: string): Promise<Map<string, SituacaoDeCobranca | null>> {
  if (entryIds.length === 0) return new Map();
  const prisma = getPrisma();
  const linhas = await prisma.financeEntry.findMany({
    where: { tenantId, id: { in: entryIds }, kind: "RECEBER" },
    select: {
      id: true,
      status: true,
      closeReason: true,
      paidAt: true,
      dueDate: true,
      agreement: { select: { status: true } },
      collectionContacts: {
        orderBy: [{ contactedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
        select: { outcome: true, contactedAt: true, nextActionAt: true },
      },
    },
  });
  return new Map(
    linhas.map((l) => {
      const c = l.collectionContacts[0];
      const situacao = situacaoDeCobranca(
        {
          status: l.status,
          closeReason: l.closeReason,
          paidAt: l.paidAt,
          vencimentoKey: saoPauloParts(l.dueDate).dateKey,
          statusDoAcordo: l.agreement?.status ?? null,
          ultimoContato: c
            ? {
                resultado: c.outcome,
                contatoKey: saoPauloParts(c.contactedAt).dateKey,
                proximaAcaoKey: c.nextActionAt ? saoPauloParts(c.nextActionAt).dateKey : null,
              }
            : null,
        },
        hojeKey
      );
      return [l.id, situacao];
    })
  );
}

// ─── Detalhe do título ──────────────────────────────────────────────────────

export type ParcelaDoAcordo = {
  id: string;
  valorCentavos: number;
  vencimento: Date;
  pagoEm: Date | null;
  status: "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO";
  closeReason: "CANCELADO" | "RENEGOCIADO" | "PERDA" | null;
};

const SELECAO_DO_ACORDO = {
  id: true,
  status: true,
  originalAmount: true,
  agreedAmount: true,
  installments: true,
  agreedAt: true,
  closedAt: true,
  notes: true,
  companyId: true,
  counterpartyId: true,
  company: { select: { name: true, displayName: true } },
  counterparty: { select: { name: true } },
  createdBy: { select: { name: true } },
  parcelas: {
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    select: { id: true, amount: true, dueDate: true, paidAt: true, status: true, closeReason: true },
  },
  originais: {
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    select: { id: true, amount: true, dueDate: true, description: true, competence: true },
  },
} satisfies Prisma.CollectionAgreementSelect;

type AcordoBruto = Prisma.CollectionAgreementGetPayload<{ select: typeof SELECAO_DO_ACORDO }>;

export type AcordoMontado = {
  id: string;
  status: StatusDoAcordo;
  empresaId: string;
  empresaNome: string;
  sacadoId: string;
  sacadoNome: string;
  originalCentavos: number;
  acordadoCentavos: number;
  diferencaCentavos: number;
  acordadoEm: Date;
  encerradoEm: Date | null;
  notas: string | null;
  criadoPor: string | null;
  parcelas: ParcelaDoAcordo[];
  originais: { id: string; valorCentavos: number; vencimento: Date; descricao: string | null; competencia: string }[];
  resumo: ResumoDoAcordo;
};

function montarAcordo(a: AcordoBruto): AcordoMontado {
  const parcelas = a.parcelas.map((p) => ({
    id: p.id,
    valorCentavos: centavosDeDecimal(p.amount),
    vencimento: p.dueDate,
    pagoEm: p.paidAt,
    status: p.status,
    closeReason: p.closeReason,
  }));
  const originalCentavos = centavosDeDecimal(a.originalAmount);
  const acordadoCentavos = centavosDeDecimal(a.agreedAmount);
  return {
    id: a.id,
    status: a.status,
    empresaId: a.companyId,
    empresaNome: nomeExibicao(a.company),
    sacadoId: a.counterpartyId,
    sacadoNome: a.counterparty.name,
    originalCentavos,
    acordadoCentavos,
    diferencaCentavos: acordadoCentavos - originalCentavos,
    acordadoEm: a.agreedAt,
    encerradoEm: a.closedAt,
    notas: a.notes,
    criadoPor: a.createdBy?.name ?? null,
    parcelas,
    originais: a.originais.map((o) => ({
      id: o.id,
      valorCentavos: centavosDeDecimal(o.amount),
      vencimento: o.dueDate,
      descricao: o.description,
      competencia: o.competence,
    })),
    resumo: resumoDoAcordo(parcelas.map((p) => ({ ...p, paidAt: p.pagoEm }))),
  };
}

/** Tudo que a tela de um título precisa, ou `null` fora do tenant ou se não é a receber. */
export async function carregarTitulo(tenantId: string, entryId: string, agora: Date) {
  const prisma = getPrisma();
  const hojeKey = saoPauloParts(agora).dateKey;
  const b = await prisma.financeEntry.findFirst({
    where: { id: entryId, tenantId, kind: "RECEBER" },
    select: {
      ...SELECAO_DA_LINHA,
      competence: true,
      lossReason: true,
      lossBy: { select: { name: true } },
      collectionContacts: {
        orderBy: [{ contactedAt: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          outcome: true,
          channel: true,
          contactedAt: true,
          nextActionAt: true,
          notes: true,
          createdAt: true,
          user: { select: { name: true } },
        },
      },
      collectionEvents: {
        orderBy: { createdAt: "desc" },
        select: { id: true, kind: true, reason: true, createdAt: true, user: { select: { name: true } } },
      },
      reminderLogs: { orderBy: { sentAt: "desc" }, select: { step: true, sentAt: true, to: true, ok: true, error: true } },
      agreement: { select: SELECAO_DO_ACORDO },
      renegotiatedAgreement: { select: SELECAO_DO_ACORDO },
    },
  });
  if (!b) return null;

  const [config, fora] = await Promise.all([configDaRegua(tenantId), empresasForaDaRegua(tenantId)]);
  const linha = montarLinha(b, hojeKey, { config, fora });

  // Candidatos a acordo: os vencidos em aberto do mesmo sacado na mesma
  // empresa. O próprio título entra se for um deles.
  const candidatosBrutos = await prisma.financeEntry.findMany({
    where: {
      ...whereVencidosEmAberto({ tenantId, companyIds: [b.companyId] }, hojeKey),
      counterpartyId: b.counterpartyId,
      OR: [{ agreementId: null }, { agreement: { status: { not: "ATIVO" } } }],
    },
    select: { id: true, amount: true, dueDate: true, description: true, competence: true },
    orderBy: { dueDate: "asc" },
    take: 200,
  });

  return {
    linha,
    competencia: b.competence,
    status: b.status,
    closeReason: b.closeReason,
    perda: b.closeReason === "PERDA" ? { em: b.lossAt, motivo: b.lossReason, por: b.lossBy?.name ?? null } : null,
    contatos: b.collectionContacts.map((c) => ({
      id: c.id,
      resultado: c.outcome as ResultadoDoContato,
      canal: c.channel as CanalDeContato,
      em: c.contactedAt,
      proximaAcao: c.nextActionAt,
      notas: c.notes,
      por: c.user?.name ?? null,
      registradoEm: c.createdAt,
    })),
    eventos: b.collectionEvents.map((e) => ({ id: e.id, tipo: e.kind, motivo: e.reason, em: e.createdAt, por: e.user?.name ?? null })),
    envios: b.reminderLogs,
    acordoDaParcela: b.agreement ? montarAcordo(b.agreement) : null,
    acordoRenegociado: b.renegotiatedAgreement ? montarAcordo(b.renegotiatedAgreement) : null,
    candidatosAoAcordo: candidatosBrutos.map((c) => ({
      id: c.id,
      valorCentavos: centavosDeDecimal(c.amount),
      vencimento: c.dueDate,
      vencimentoKey: saoPauloParts(c.dueDate).dateKey,
      descricao: c.description,
      competencia: c.competence,
    })),
  };
}

// ─── Acordos ────────────────────────────────────────────────────────────────

export async function listarAcordos(escopo: EscopoFinanceiro, filtro: { status?: StatusDoAcordo | null }) {
  const prisma = getPrisma();
  const where: Prisma.CollectionAgreementWhereInput = {
    tenantId: escopo.tenantId,
    ...(escopo.companyIds === null ? {} : { companyId: { in: escopo.companyIds } }),
    ...(filtro.status ? { status: filtro.status } : {}),
  };
  const [acordos, porStatus] = await Promise.all([
    prisma.collectionAgreement.findMany({ where, select: SELECAO_DO_ACORDO, orderBy: [{ agreedAt: "desc" }, { id: "asc" }], take: 500 }),
    prisma.collectionAgreement.groupBy({
      by: ["status"],
      where: { tenantId: escopo.tenantId, ...(escopo.companyIds === null ? {} : { companyId: { in: escopo.companyIds } }) },
      _count: { _all: true },
    }),
  ]);
  return {
    acordos: acordos.map(montarAcordo),
    contagem: Object.fromEntries(porStatus.map((p) => [p.status, p._count._all])) as Partial<Record<StatusDoAcordo, number>>,
  };
}

export async function carregarAcordo(tenantId: string, id: string): Promise<AcordoMontado | null> {
  const prisma = getPrisma();
  const a = await prisma.collectionAgreement.findFirst({ where: { id, tenantId }, select: SELECAO_DO_ACORDO });
  return a ? montarAcordo(a) : null;
}

// ─── Régua (aba) ────────────────────────────────────────────────────────────

export async function dadosDaAbaRegua(tenantId: string) {
  const prisma = getPrisma();
  const [config, foraDaRegua, envios, errosNaSemana] = await Promise.all([
    configDaRegua(tenantId),
    prisma.collectionReminderOptOut.findMany({
      where: { tenantId },
      select: { companyId: true, createdAt: true, company: { select: { name: true, displayName: true } }, createdBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.collectionReminderLog.findMany({
      where: { tenantId },
      select: {
        id: true,
        step: true,
        sentAt: true,
        to: true,
        ok: true,
        error: true,
        entry: { select: { id: true, amount: true, counterparty: { select: { name: true } }, company: { select: { name: true, displayName: true } } } },
      },
      orderBy: { sentAt: "desc" },
      take: 100,
    }),
    prisma.collectionReminderLog.count({ where: { tenantId, ok: false, sentAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
  ]);
  return {
    config,
    foraDaRegua: foraDaRegua.map((f) => ({ companyId: f.companyId, empresaNome: nomeExibicao(f.company), desde: f.createdAt, por: f.createdBy?.name ?? null })),
    envios: envios.map((e) => ({
      id: e.id,
      passo: e.step,
      em: e.sentAt,
      para: e.to,
      ok: e.ok,
      erro: e.error,
      entryId: e.entry.id,
      sacadoNome: e.entry.counterparty.name,
      empresaNome: nomeExibicao(e.entry.company),
      valorCentavos: centavosDeDecimal(e.entry.amount),
    })),
    errosNaSemana,
  };
}

// ─── Portal ─────────────────────────────────────────────────────────────────

/** Quantos títulos das empresas do cliente estão em cobrança — o contador da home. */
export async function contagemDeCobrancaDoCliente(escopo: EscopoFinanceiro, agora: Date): Promise<number> {
  const hojeKey = saoPauloParts(agora).dateKey;
  return getPrisma().financeEntry.count({ where: whereVencidosEmAberto(escopo, hojeKey) });
}

/**
 * O que o cliente vê da cobrança: títulos vencidos com faixa, situação e o
 * último contato **resumido** (data, canal, resultado — a anotação é interna),
 * e os acordos com parcelas e o que já foi pago.
 *
 * Responsável e veredito da régua ficam de fora: são organização da equipe, e
 * "sacado sem e-mail" no portal viraria pedido de cadastro por outro canal.
 */
export async function cobrancaDoCliente(escopo: EscopoFinanceiro, agora: Date) {
  const prisma = getPrisma();
  const hojeKey = saoPauloParts(agora).dateKey;
  const [brutas, acordos] = await Promise.all([
    prisma.financeEntry.findMany({
      where: whereVencidosEmAberto(escopo, hojeKey),
      select: SELECAO_DA_LINHA,
      orderBy: { dueDate: "asc" },
      take: 500,
    }),
    listarAcordos(escopo, {}),
  ]);
  const regua = { config: { ligada: false, passos: [], passosTexto: "", existe: false }, fora: new Set<string>() };
  const titulos = ordenarFila(brutas.map((b) => montarLinha(b, hojeKey, regua))).map((l) => ({
    id: l.id,
    empresaNome: l.empresaNome,
    sacadoNome: l.sacadoNome,
    descricao: l.descricao,
    valorCentavos: l.valorCentavos,
    vencimento: l.vencimento,
    diasDeAtraso: l.diasDeAtraso,
    faixa: l.faixa,
    situacao: l.situacao,
    ultimoContato: l.ultimoContato ? { em: l.ultimoContato.em, canal: l.ultimoContato.canal, resultado: l.ultimoContato.resultado } : null,
  }));
  return {
    titulos,
    // Observação do acordo e quem o criou são da equipe — ficam de fora.
    acordos: acordos.acordos
      .filter((a) => a.status !== "DESFEITO")
      .map((a) => ({
        id: a.id,
        status: a.status,
        empresaNome: a.empresaNome,
        sacadoNome: a.sacadoNome,
        originalCentavos: a.originalCentavos,
        acordadoCentavos: a.acordadoCentavos,
        acordadoEm: a.acordadoEm,
        parcelas: a.parcelas,
        resumo: a.resumo,
      })),
  };
}
