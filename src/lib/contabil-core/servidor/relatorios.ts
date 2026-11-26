import "server-only";

// As leituras dos relatórios do Contábil Core (Bloco D, Fase D2, 26/11/2026): a DRE, o Balancete e o Livro
// Caixa (`RelatoriosService`, `src/domain/relatorios/service.py`). Só lê. Toda consulta é do tenant e começa por
// `empresaDoTenant`; as somas são do MySQL (`SUM` de `DECIMAL`, exato) e a montagem da resposta é a de
// `relatorios/relatorios.ts`, conferida pelo gabarito.

import { getPrisma } from "@/lib/prisma";
import { gerarPlanilhaDeTabelas } from "@/lib/planilha/tabelaDoExcel";
import { duasCasas } from "../exportacao/arquivos";
import {
  instantesDoPeriodo,
  montarBalancete,
  montarDre,
  montarLivroCaixa,
  type Balancete,
  type ContaDoRelatorio,
  type Dre,
  type LivroCaixa,
  type Periodo,
  type TotalDaConta,
} from "../relatorios/relatorios";
import { nomeDaPlanilha, planilhaDoRelatorio, type QualRelatorio } from "../relatorios/planilha";
import { dataDoDia, decDoBanco, dia, empresaDoTenant, falha, NAO_ENCONTRADA, ok, type Resultado } from "./base";

// ─── DRE e Balancete ──────────────────────────────────────────────────────

/**
 * As somas das partidas VIVAS da empresa no período, por conta e D/C (o `GROUP BY conta_id, dc` do original). A
 * partida cancelada (`deletedAt`), também a de uma importação desfeita, não entra. A conta bancária não filtra.
 */
async function somasDasPartidas(tenantId: string, empresaId: string, p: Periodo): Promise<TotalDaConta[]> {
  const { inicio, fim } = instantesDoPeriodo(p);
  const grupos = await getPrisma().coreRegistro.groupBy({
    by: ["contaId", "dc"],
    where: {
      tenantId,
      empresaId,
      deletedAt: null,
      ...(inicio || fim ? { dataLancamento: { ...(inicio ? { gte: inicio } : {}), ...(fim ? { lte: fim } : {}) } } : {}),
    },
    _sum: { valor: true },
  });
  return grupos.map((g) => ({ contaId: g.contaId, dc: g.dc, total: duasCasas(decDoBanco(g._sum.valor ?? 0)) }));
}

const CONTA = { id: true, codigo: true, descricao: true, tipo: true, deletedAt: true } as const;
const daConta = (c: { id: string; codigo: string; descricao: string; tipo: string; deletedAt: Date | null }): ContaDoRelatorio => ({
  id: c.id, codigo: c.codigo, descricao: c.descricao, tipo: c.tipo, apagada: c.deletedAt !== null,
});

/** `RelatoriosService.dre`: as contas com movimento, mesmo apagadas (o legado), só do plano desta empresa. */
export async function dreDaEmpresa(tenantId: string, empresaId: string, p: Periodo): Promise<Resultado<Dre>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const totais = await somasDasPartidas(tenantId, empresaId, p);
  const ids = [...new Set(totais.map((t) => t.contaId))];
  const contas = ids.length
    ? await getPrisma().corePlanoConta.findMany({ where: { tenantId, empresaId, id: { in: ids } }, select: CONTA })
    : [];
  return ok(montarDre(totais, contas.map(daConta), p));
}

/** `RelatoriosService.balancete`: toda conta viva do plano e a apagada com movimento no período. */
export async function balanceteDaEmpresa(tenantId: string, empresaId: string, p: Periodo): Promise<Resultado<Balancete>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const totais = await somasDasPartidas(tenantId, empresaId, p);
  const ids = [...new Set(totais.map((t) => t.contaId))];
  const contas = await getPrisma().corePlanoConta.findMany({
    where: { tenantId, empresaId, OR: [{ deletedAt: null }, ...(ids.length ? [{ id: { in: ids } }] : [])] },
    select: CONTA,
  });
  return ok(montarBalancete(totais, contas.map(daConta), p));
}

// ─── Livro Caixa ──────────────────────────────────────────────────────────

/**
 * `RelatoriosService.livro_caixa`: as transações VIVAS do extrato (classificadas ou não; a de uma importação
 * desfeita não entra) das contas bancárias vivas da empresa, ativas e inativas. O período é de datas do extrato.
 */
export async function livroCaixaDaEmpresa(tenantId: string, empresaId: string, p: Periodo): Promise<Resultado<LivroCaixa>> {
  if (!(await empresaDoTenant(tenantId, empresaId))) return falha(NAO_ENCONTRADA);
  const prisma = getPrisma();
  const agencias = await prisma.coreAgencia.findMany({
    where: { tenantId, empresaId, deletedAt: null },
    select: { id: true, bancoSigla: true, agencia: true, numero: true, digito: true },
  });
  if (agencias.length === 0) return ok(montarLivroCaixa([], null, [], p));
  const viva = { tenantId, empresaId, deletedAt: null, agenciaId: { in: agencias.map((a) => a.id) } };
  const [anteriores, transacoes] = await Promise.all([
    p.de
      ? prisma.coreTransacao.groupBy({ by: ["agenciaId", "dc"], where: { ...viva, data: { lt: dataDoDia(p.de) } }, _sum: { valor: true } })
      : Promise.resolve(null),
    prisma.coreTransacao.findMany({
      where: { ...viva, ...(p.de || p.ate ? { data: { ...(p.de ? { gte: dataDoDia(p.de) } : {}), ...(p.ate ? { lte: dataDoDia(p.ate) } : {}) } } : {}) },
      select: { id: true, agenciaId: true, data: true, historico: true, dc: true, valor: true },
    }),
  ]);
  return ok(
    montarLivroCaixa(
      agencias,
      anteriores?.map((g) => ({ agenciaId: g.agenciaId, dc: g.dc, total: duasCasas(decDoBanco(g._sum.valor ?? 0)) })) ?? null,
      transacoes.map((t) => ({ id: t.id, agenciaId: t.agenciaId, data: dia(t.data), historico: t.historico, dc: t.dc, valor: duasCasas(decDoBanco(t.valor)) })),
      p,
    ),
  );
}

// ─── Planilha ─────────────────────────────────────────────────────────────

/** O relatório pedido, como a tela o mostra. */
export function relatorioDaEmpresa(qual: QualRelatorio, tenantId: string, empresaId: string, p: Periodo): Promise<Resultado<Dre | Balancete | LivroCaixa>> {
  return qual === "dre" ? dreDaEmpresa(tenantId, empresaId, p) : qual === "balancete" ? balanceteDaEmpresa(tenantId, empresaId, p) : livroCaixaDaEmpresa(tenantId, empresaId, p);
}

/** A planilha do relatório (novo no Connect: o original só imprimia), com o nome do arquivo. */
export async function planilhaDoRelatorioDaEmpresa(
  qual: QualRelatorio,
  tenantId: string,
  empresaId: string,
  p: Periodo,
): Promise<Resultado<{ nome: string; conteudo: Buffer }>> {
  const empresa = await empresaDoTenant(tenantId, empresaId);
  if (!empresa) return falha(NAO_ENCONTRADA);
  const r = await relatorioDaEmpresa(qual, tenantId, empresaId, p);
  if (!r.ok) return r;
  const conteudo = await gerarPlanilhaDeTabelas(planilhaDoRelatorio(qual, r.valor, empresa, p));
  return ok({ nome: nomeDaPlanilha(qual, empresa.cnpj, p), conteudo });
}
