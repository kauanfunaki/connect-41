// Painel da carteira do BPO (22/10/2026) — a leitura do banco.
//
// Uma consulta agregada por coluna, nunca uma por empresa: a carteira do BPO
// passa de algumas centenas de empresas, e cada coluna é um `groupBy` pelo
// índice que a tela dela já usa. A soma de tudo são dez consultas, quaisquer
// que sejam as empresas. As regras (ordem, filtro, totais) estão em `regras.ts`.
//
// Cada número é o mesmo da tela para onde o painel leva:
// - vencidos: `whereDoRecorte("vencidas")`, o recorte "Vencido" de /pagar e
//   /receber — o valor é o saldo em aberto (valor menos a baixa parcial), como
//   nos números do Início do portal. Conta que veio do Omie e ainda não virou
//   entra como na lista: aparece, e a baixa é que fica no Omie;
// - extrato, linhas a conciliar e saldo: as contas com extrato da conciliação
//   (`TIPOS_COM_EXTRATO`) — o saldo pela mesma conferência da tela
//   (`saldosDasContas`), divergente quando calculado e banco não fecham no centavo;
// - pendências: em andamento (aberta ou respondida), do setor das pendências
//   do BPO e as antigas sem setor, como /pendencias;
// - aprovações: contas a pagar aguardando, como /aprovacoes;
// - portal: os acessos ativos que enxergam a empresa, pela regra comum
//   (`lerContasDasEmpresas`: ligada direto ou pela matriz com as filiais).

import { getPrisma } from "@/lib/prisma";
import { saoPauloParts } from "@/lib/agenda";
import { nomeExibicao } from "@/lib/companyName";
import { STATUS_OCULTOS_POR_PADRAO } from "@/lib/companyStatusFilter";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { whereDoRecorte } from "@/lib/financeiro/data";
import { TIPOS_COM_EXTRATO } from "@/lib/financeiro/tiposDeConta";
import { saldosDasContas } from "@/lib/financeiro/conciliacao/saldoDasContas";
import { soDoSetorPadrao, whereDoRecorteDeSetor } from "@/lib/financeiro/pendencias/setor";
import { lerContasDasEmpresas } from "@/lib/portal/empresasDaContaDb";
import type { LinhaDaCarteira, SomaDeVencidos } from "./regras";

const ZERO: SomaDeVencidos = { n: 0, centavos: 0 };

function contar<T>(mapa: Map<string, T>, chave: string, inicial: T, somar: (atual: T) => T) {
  mapa.set(chave, somar(mapa.get(chave) ?? inicial));
}

/**
 * As empresas atendidas pelo setor — `CompanyService` ativo no setor que opera
 * o painel, de empresa em operação (sem as inativas e as que saíram) — com
 * uma linha cada.
 *
 * `setor` é o setor do módulo neste escritório (o BPO, salvo transferência);
 * `setorDasPendencias`, o das pendências sem setor (`setorPadraoDasPendencias`).
 */
export async function carregarCarteira(
  tenantId: string,
  setor: string,
  setorDasPendencias: string,
  agora: Date
): Promise<LinhaDaCarteira[]> {
  const prisma = getPrisma();
  const hojeKey = saoPauloParts(agora).dateKey;

  const servicos = await prisma.companyService.findMany({
    where: { tenantId, sectorCode: setor, status: "ACTIVE", company: { status: { notIn: STATUS_OCULTOS_POR_PADRAO } } },
    select: {
      companyId: true,
      responsibleUserId: true,
      responsible: { select: { name: true } },
      company: { select: { name: true, displayName: true, cnpj: true } },
    },
  });
  if (servicos.length === 0) return [];
  const ids = servicos.map((s) => s.companyId);

  const [vencidos, contas, pendencias, aprovacoes, contasDoPortal] = await Promise.all([
    prisma.financeEntry.groupBy({
      by: ["companyId", "kind"],
      where: { tenantId, companyId: { in: ids }, ...whereDoRecorte("vencidas", hojeKey) },
      _count: { _all: true },
      _sum: { amount: true, paidPrincipal: true },
    }),
    prisma.bankAccount.findMany({
      where: { tenantId, companyId: { in: ids }, type: { in: [...TIPOS_COM_EXTRATO] } },
      select: { id: true, companyId: true, type: true, active: true, openingBalance: true, openingBalanceDate: true },
    }),
    prisma.clientRequest.groupBy({
      by: ["companyId"],
      where: {
        AND: [
          { tenantId, companyId: { in: ids }, status: { in: ["ABERTA", "RESPONDIDA"] } },
          whereDoRecorteDeSetor(soDoSetorPadrao(setorDasPendencias)),
        ],
      },
      _count: { _all: true },
    }),
    prisma.financeEntry.groupBy({
      by: ["companyId"],
      where: { tenantId, companyId: { in: ids }, kind: "PAGAR", status: { not: "CANCELADO" }, approvalStatus: "AGUARDANDO" },
      _count: { _all: true },
    }),
    lerContasDasEmpresas(tenantId, ids),
  ]);

  const contaIds = contas.map((c) => c.id);
  const ativas = contas.filter((c) => c.active);
  // Sem saldo inicial a conferência nunca chega a "conferido": nem entra na soma por dia.
  const conferiveis = ativas.filter((c) => c.openingBalance !== null && c.openingBalanceDate !== null);
  const idsDoPortal = [...new Set([...contasDoPortal.values()].flatMap((m) => [...m.keys()]))];

  const [importacoes, pendentes, saldos, acessos] = await Promise.all([
    ativas.length > 0
      ? prisma.bankStatementImport.groupBy({
          by: ["bankAccountId"],
          where: { tenantId, bankAccountId: { in: ativas.map((c) => c.id) } },
          _max: { createdAt: true },
        })
      : Promise.resolve([]),
    contaIds.length > 0
      ? prisma.bankTransaction.groupBy({
          by: ["bankAccountId"],
          where: { tenantId, bankAccountId: { in: contaIds }, status: "PENDENTE" },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    conferiveis.length > 0 ? saldosDasContas(tenantId, conferiveis) : Promise.resolve(new Map()),
    idsDoPortal.length > 0
      ? prisma.portalUser.findMany({ where: { tenantId, id: { in: idsDoPortal }, active: true }, select: { id: true, lastLoginAt: true } })
      : Promise.resolve([]),
  ]);

  // ─── De conta para empresa ──────────────────────────────────────────────
  const empresaDaConta = new Map(contas.map((c) => [c.id, c.companyId]));
  const contasComExtrato = new Map<string, number>();
  for (const c of ativas) contar(contasComExtrato, c.companyId, 0, (n) => n + 1);

  const ultimoExtrato = new Map<string, string>();
  for (const i of importacoes) {
    const empresa = empresaDaConta.get(i.bankAccountId);
    if (!empresa || !i._max.createdAt) continue;
    const dia = saoPauloParts(i._max.createdAt).dateKey;
    const atual = ultimoExtrato.get(empresa);
    if (!atual || dia > atual) ultimoExtrato.set(empresa, dia);
  }

  const linhasPendentes = new Map<string, number>();
  for (const p of pendentes) {
    const empresa = empresaDaConta.get(p.bankAccountId);
    if (empresa) contar(linhasPendentes, empresa, 0, (n) => n + p._count._all);
  }

  const divergentes = new Map<string, number>();
  for (const [contaId, situacao] of saldos) {
    if (situacao.tipo !== "conferido" || situacao.divergenciaCentavos === 0) continue;
    const empresa = empresaDaConta.get(contaId);
    if (empresa) contar(divergentes, empresa, 0, (n) => n + 1);
  }

  // ─── O resto, já por empresa ────────────────────────────────────────────
  const vencidosPor = new Map<string, SomaDeVencidos>();
  for (const v of vencidos) {
    const valor = v._sum.amount ? centavosDeDecimal(v._sum.amount) : 0;
    const baixado = v._sum.paidPrincipal ? centavosDeDecimal(v._sum.paidPrincipal) : 0;
    vencidosPor.set(`${v.companyId}|${v.kind}`, { n: v._count._all, centavos: valor - baixado });
  }
  const pendenciasPor = new Map(pendencias.map((p) => [p.companyId, p._count._all]));
  const aprovacoesPor = new Map(aprovacoes.map((a) => [a.companyId, a._count._all]));
  const loginPor = new Map(acessos.map((a) => [a.id, a.lastLoginAt]));

  return servicos.map((s) => {
    const doPortal = [...(contasDoPortal.get(s.companyId)?.keys() ?? [])].filter((id) => loginPor.has(id));
    const ultimoAcessoPortal = doPortal.reduce<Date | null>((m, id) => {
      const d = loginPor.get(id) ?? null;
      return d && (!m || d > m) ? d : m;
    }, null);
    return {
      companyId: s.companyId,
      nome: nomeExibicao(s.company),
      cnpj: s.company.cnpj,
      analistaId: s.responsibleUserId,
      analistaNome: s.responsible?.name ?? null,
      vencidosPagar: vencidosPor.get(`${s.companyId}|PAGAR`) ?? ZERO,
      vencidosReceber: vencidosPor.get(`${s.companyId}|RECEBER`) ?? ZERO,
      contasComExtrato: contasComExtrato.get(s.companyId) ?? 0,
      ultimoExtratoKey: ultimoExtrato.get(s.companyId) ?? null,
      linhasAConciliar: linhasPendentes.get(s.companyId) ?? 0,
      contasComSaldoDivergente: divergentes.get(s.companyId) ?? 0,
      pendenciasAbertas: pendenciasPor.get(s.companyId) ?? 0,
      aprovacoesAguardando: aprovacoesPor.get(s.companyId) ?? 0,
      ultimoAcessoPortal,
      acessosAoPortal: doPortal.length,
    };
  });
}
