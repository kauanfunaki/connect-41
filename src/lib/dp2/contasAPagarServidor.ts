// Lança as contas da folha no Contas a pagar da empresa (25/11/2026,
// funcionalidade-770). As regras moram em contasAPagarDaFolha.ts.

import { getPrisma } from "@/lib/prisma";
import { ondeDaEmpresa } from "@/lib/financeiro/planoDeContas";
import { apurarCompetencia } from "./apuracao";
import { regimeDaCategoria } from "./categorias";
import { categoriaDaConta, contasDaFolha, type TipoDaContaDaFolha } from "./contasAPagarDaFolha";
import { colaboradoresDaCompetencia, configDaEmpresa } from "./servidor";
import type { Encargos, ItemDoHolerite } from "./mensal";

export type ResultadoDasContas =
  | { ok: true; criadas: TipoDaContaDaFolha[]; atualizadas: TipoDaContaDaFolha[]; jaPagas: TipoDaContaDaFolha[]; semCategoria: TipoDaContaDaFolha[] }
  | { ok: false; erro: string };

const n = (v: unknown) => Number(v ?? 0);

export async function lancarContasDaFolha(tenantId: string, competenciaId: string, userId: string): Promise<ResultadoDasContas> {
  const prisma = getPrisma();
  const comp = await prisma.dp2Competencia.findFirst({ where: { id: competenciaId, tenantId } });
  if (!comp) return { ok: false, erro: "Competência não encontrada." };
  if (comp.tipo !== "MENSAL") return { ok: false, erro: "As contas a pagar saem da folha mensal." };
  if (comp.situacao !== "FECHADA") return { ok: false, erro: "Feche a competência antes de lançar as contas a pagar." };

  const [calculos, pessoas, informacoes, cfg, categorias] = await Promise.all([
    prisma.dp2Calculo.findMany({ where: { tenantId, competenciaId } }),
    colaboradoresDaCompetencia(tenantId, comp.companyId, comp.ano, comp.mes),
    prisma.dp2InformacaoDaApuracao.findMany({ where: { tenantId, competenciaId } }),
    configDaEmpresa(tenantId, comp.companyId),
    prisma.financeCategory.findMany({ where: ondeDaEmpresa(tenantId, comp.companyId, { kind: "PAGAR" }), select: { id: true, name: true, companyId: true } }),
  ]);
  if (calculos.length === 0) return { ok: false, erro: "A competência não tem cálculo." };
  const apuracao = apurarCompetencia({
    calculos: calculos.map((c) => ({
      proventos: n(c.proventos),
      inss: n(c.inss),
      irrf: n(c.irrf),
      encargos: c.encargos as unknown as Encargos,
      itens: (c.itens as unknown as ItemDoHolerite[]) ?? [],
      empregado: regimeDaCategoria(pessoas.find((p) => p.id === c.personId)?.dp2Vinculo?.categoria) === "CLT",
    })),
    informacoes: informacoes.map((i) => ({ tipo: i.tipo, valor: n(i.valor) })),
    pisSobreFolha: cfg.pisSobreFolha,
  });
  const contas = contasDaFolha({
    ano: comp.ano,
    mes: comp.mes,
    liquido: calculos.reduce((s, c) => s + n(c.liquido), 0),
    inssARecolher: apuracao.inssARecolher,
    irrfARecolher: apuracao.irrfARecolher,
    pisARecolher: apuracao.pisARecolher,
    fgts: calculos.reduce((s, c) => s + n(c.fgts), 0),
  });
  const competence = `${comp.ano}-${String(comp.mes).padStart(2, "0")}`;
  const r = { criadas: [] as TipoDaContaDaFolha[], atualizadas: [] as TipoDaContaDaFolha[], jaPagas: [] as TipoDaContaDaFolha[], semCategoria: [] as TipoDaContaDaFolha[] };

  await prisma.$transaction(async (tx) => {
    for (const conta of contas) {
      const categoryId = categoriaDaConta(conta, categorias);
      if (!categoryId) r.semCategoria.push(conta.tipo);
      const existente = await tx.financeEntry.findFirst({
        where: { tenantId, companyId: comp.companyId, kind: "PAGAR", documentNumber: conta.chave, status: { not: "CANCELADO" } },
        select: { id: true, status: true, paidPrincipal: true, _count: { select: { payments: true } } },
      });
      const dueDate = new Date(`${conta.vencimento}T12:00:00.000Z`);
      if (existente) {
        if (existente.status === "PAGO" || n(existente.paidPrincipal) > 0 || existente._count.payments > 0) {
          r.jaPagas.push(conta.tipo);
          continue;
        }
        await tx.financeEntry.update({ where: { id: existente.id }, data: { amount: conta.valor.toFixed(2), dueDate, description: conta.descricao } });
        r.atualizadas.push(conta.tipo);
        continue;
      }
      const achado = await tx.financeCounterparty.findFirst({
        where: { tenantId, companyId: comp.companyId, ...(conta.credor.documento ? { document: conta.credor.documento } : { name: conta.credor.nome }) },
        select: { id: true },
      });
      const counterpartyId =
        achado?.id ?? (await tx.financeCounterparty.create({ data: { tenantId, companyId: comp.companyId, name: conta.credor.nome, document: conta.credor.documento }, select: { id: true } })).id;
      await tx.financeEntry.create({
        data: {
          tenantId,
          companyId: comp.companyId,
          kind: "PAGAR",
          // Sem categoria a conta fica provisória, para o BPO classificar antes de conferir.
          status: categoryId ? "CONFERIDO" : "PROVISORIO",
          approvalStatus: "NAO_REQUER",
          counterpartyId,
          categoryId,
          competence,
          dueDate,
          amount: conta.valor.toFixed(2),
          description: conta.descricao,
          documentNumber: conta.chave,
          createdById: userId,
          ...(categoryId ? { reviewedById: userId, reviewedAt: new Date() } : {}),
        },
      });
      r.criadas.push(conta.tipo);
    }
  });
  return { ok: true, ...r };
}
