import "server-only";

// As leituras do painel do Contábil Core (Bloco D, Fase D1, 26/11/2026): as divergências da sombra do NEO
// ("Conflitos e qualidade", `consultar_divergencias`), as estatísticas da empresa (`StatsService`) e a carteira
// do escritório (`listar_carteira`). Só lê. Toda consulta é do tenant; as da empresa começam por
// `empresaDoTenant`. As contas e a montagem da resposta são as de `painel/painel.ts`, conferidas pelo gabarito.

import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { mesAtual } from "../tela";
import {
  mesesDaSerie,
  montarCarteira,
  montarEstatisticas,
  resumirDivergencias,
  type Divergencias,
  type Estatisticas,
  type ItemDaCarteira,
} from "../painel/painel";
import { decDoBanco, empresaDoTenant, falha, limitesDoMes, NAO_ENCONTRADA, ok, type Resultado } from "./base";
import { duasCasas } from "../exportacao/arquivos";

// ─── Conflitos e qualidade ────────────────────────────────────────────────

/**
 * As medições da sombra do NEO: as decisões com a divergência avaliada (verdadeiro ou falso), recortadas pelo
 * mês e pela conta bancária da transação. Como no original, entram as decisões de transação desfeita e as
 * decisões antigas de uma transação reclassificada (a decisão é registro; ver os achados).
 */
export async function consultarDivergencias(
  tenantId: string,
  empresaId: string,
  f: { mes: string | null; agenciaId: string | null },
): Promise<Resultado<Divergencias>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const periodo = f.mes ? limitesDoMes(f.mes) : null;
  const conta = { select: { id: true, codigo: true, descricao: true } } as const;
  const decisoes = await getPrisma().coreNeoDecisao.findMany({
    where: {
      tenantId,
      empresaId,
      contaDivergente: { not: null },
      transacao: { ...(f.agenciaId ? { agenciaId: f.agenciaId } : {}), ...(periodo ? { data: { gte: periodo.inicio, lte: periodo.fim } } : {}) },
    },
    select: {
      id: true, contaDivergente: true, contraparteId: true, origemEvidencia: true,
      conta, contaContraparte: conta,
      transacao: { select: { id: true, historico: true, valor: true } },
    },
  });
  return ok(
    resumirDivergencias(
      decisoes.map((d) => ({
        id: d.id, contaDivergente: d.contaDivergente === true, contraparteId: d.contraparteId, origemEvidencia: d.origemEvidencia,
        contaRegra: d.conta, contaContraparte: d.contaContraparte,
        transacao: { id: d.transacao.id, historico: d.transacao.historico, valor: duasCasas(decDoBanco(d.transacao.valor)) },
      })),
    ),
  );
}

// ─── Estatísticas da empresa ──────────────────────────────────────────────

/** Quantos meses a série pode ter (`meses` de 1 a 24, como a rota do original). */
export const MESES_DA_SERIE = { minimo: 1, maximo: 24, padrao: 12 } as const;

type PorMes = { mes: string; total: bigint | number }[];
const mapaDoMes = (linhas: PorMes) => new Map(linhas.map((l) => [l.mes, Number(l.total)]));

/**
 * `StatsService.obter`. O mês corrente é o do escritório (o original usava o de UTC); os instantes (partida,
 * nota, comprovante) caem no mês em UTC, como o `to_char` da sessão do PostgreSQL da produção.
 */
export async function estatisticasDaEmpresa(
  tenantId: string,
  empresaId: string,
  meses: number = MESES_DA_SERIE.padrao,
  agora: Date = new Date(),
): Promise<Resultado<Estatisticas & { mesAtual: string }>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const prisma = getPrisma();
  const atual = mesAtual(agora);
  const inicio = limitesDoMes(mesesDaSerie(atual, meses)[0]).inicio;
  const viva = { tenantId, empresaId, deletedAt: null };
  const comLancamento = { registros: { some: { deletedAt: null } } };

  const [transacoes, conciliadas, registros, notas, comprovantes, agencias, porAgencia, conciliadasPorAgencia, tMes, rMes, cMes, nMes] = await Promise.all([
    prisma.coreTransacao.count({ where: viva }),
    prisma.coreTransacao.count({ where: { ...viva, ...comLancamento } }),
    prisma.coreRegistro.count({ where: viva }),
    prisma.coreNotaFiscal.count({ where: viva }),
    prisma.coreComprovante.count({ where: viva }),
    // As ativas, como o original: a apagada que ficou ativa também entra (ver os achados).
    prisma.coreAgencia.findMany({ where: { tenantId, empresaId, ativa: true }, select: { id: true, bancoSigla: true, agencia: true, numero: true } }),
    prisma.coreTransacao.groupBy({ by: ["agenciaId"], where: viva, _count: { _all: true } }),
    prisma.coreTransacao.groupBy({ by: ["agenciaId"], where: { ...viva, ...comLancamento }, _count: { _all: true } }),
    prisma.$queryRaw<PorMes>(Prisma.sql`
      SELECT DATE_FORMAT(\`data\`, '%Y-%m') AS mes, COUNT(*) AS total FROM core_transacoes
      WHERE \`tenantId\` = ${tenantId} AND \`empresaId\` = ${empresaId} AND \`deletedAt\` IS NULL AND \`data\` >= ${inicio}
      GROUP BY mes`),
    prisma.$queryRaw<PorMes>(Prisma.sql`
      SELECT DATE_FORMAT(\`dataLancamento\`, '%Y-%m') AS mes, COUNT(*) AS total FROM core_registros
      WHERE \`tenantId\` = ${tenantId} AND \`empresaId\` = ${empresaId} AND \`deletedAt\` IS NULL AND \`dataLancamento\` >= ${inicio}
      GROUP BY mes`),
    prisma.$queryRaw<PorMes>(Prisma.sql`
      SELECT DATE_FORMAT(\`dataPagamento\`, '%Y-%m') AS mes, COUNT(*) AS total FROM core_comprovantes
      WHERE \`tenantId\` = ${tenantId} AND \`empresaId\` = ${empresaId} AND \`deletedAt\` IS NULL AND \`dataPagamento\` IS NOT NULL
        AND \`dataPagamento\` >= ${inicio}
      GROUP BY mes`),
    prisma.$queryRaw<PorMes>(Prisma.sql`
      SELECT DATE_FORMAT(\`dataEmissao\`, '%Y-%m') AS mes, COUNT(*) AS total FROM core_notas_fiscais
      WHERE \`tenantId\` = ${tenantId} AND \`empresaId\` = ${empresaId} AND \`deletedAt\` IS NULL AND \`dataEmissao\` >= ${inicio}
      GROUP BY mes`),
  ]);
  const total = new Map(porAgencia.map((g) => [g.agenciaId, g._count._all]));
  const conc = new Map(conciliadasPorAgencia.map((g) => [g.agenciaId, g._count._all]));
  const estatisticas = montarEstatisticas(
    {
      transacoes, conciliadas, registros, notas, comprovantes,
      porMes: { transacoes: mapaDoMes(tMes), registros: mapaDoMes(rMes), comprovantes: mapaDoMes(cMes), notas: mapaDoMes(nMes) },
      agencias: agencias.map((a) => ({ ...a, total: total.get(a.id) ?? 0, conciliadas: conc.get(a.id) ?? 0 })),
    },
    meses,
    atual,
  );
  return ok({ ...estatisticas, mesAtual: atual });
}

// ─── Carteira do escritório ───────────────────────────────────────────────

/**
 * `listar_carteira`: as empresas ativas do escritório com o trabalho da competência. No original, o
 * administrador via todas e o contador só as da permissão dele; no Connect, quem vê o módulo vê as empresas
 * do escritório (as mesmas do seletor de empresa).
 */
export async function carteiraDoEscritorio(tenantId: string, mes: string): Promise<{ mes: string; itens: ItemDaCarteira[] }> {
  const prisma = getPrisma();
  const { inicio, fim } = limitesDoMes(mes);
  const [empresas, grupos] = await Promise.all([
    prisma.coreEmpresa.findMany({ where: { tenantId, ativa: true, deletedAt: null }, select: { id: true, razaoSocial: true } }),
    prisma.coreTransacao.groupBy({
      by: ["empresaId", "status"],
      where: { tenantId, deletedAt: null, data: { gte: inicio, lte: fim }, empresa: { ativa: true, deletedAt: null } },
      _count: { _all: true },
      _sum: { valor: true },
    }),
  ]);
  return {
    mes,
    itens: montarCarteira(
      empresas,
      grupos.map((g) => ({ empresaId: g.empresaId, status: g.status, quantidade: g._count._all, valor: duasCasas(decDoBanco(g._sum.valor ?? 0)) })),
    ),
  };
}
