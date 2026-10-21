// As retenções na fonte no banco (lote D, 20/10): a leitura, a gravação e as
// contas dos impostos. As regras moram em `retencoes.ts`.

import type { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { saoPauloParts } from "@/lib/agenda";
import { ehImpostosRetidosServicosTomados } from "@/lib/dre/impostosRetidosNoCmv";
import { centavosDeDecimal } from "./contas";
import { decimalDeCentavos } from "./manual";
import { instanteDaData } from "./periodo";
import { ondeDaEmpresa } from "./planoDeContas";
import {
  categoriaDoImposto,
  credorDoImposto,
  descricaoDaContaDoImposto,
  TRIBUTO,
  TRIBUTOS_RETIDOS,
  vencimentoDoImposto,
  type ContaDoImposto,
  type PassoDaRetencao,
  type RetencaoAtual,
  type TributoRetido,
} from "./retencoes";

type Tx = Prisma.TransactionClient;
type Cliente = Tx | ReturnType<typeof getPrisma>;

/** Recusa no meio da gravação: a transação volta inteira, e a tela mostra o porquê. */
export class RecusaDaRetencao extends Error {}

const ESTADO_DA_CONTA = { id: true, status: true, paidPrincipal: true, dueDate: true } as const;
/** A conta do imposto que ainda se pode mudar ou cancelar: em aberto, sem baixa nenhuma. */
const EM_ABERTO_SEM_BAIXA = { status: { in: ["PROVISORIO", "CONFERIDO"] }, paidPrincipal: 0, payments: { none: {} } } satisfies Prisma.FinanceEntryWhereInput;

type EstadoDaConta = { id: string; status: "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO"; paidPrincipal: { toString(): string }; dueDate: Date };

function contaDoImposto(c: EstadoDaConta | null): ContaDoImposto | null {
  if (!c) return null;
  return { id: c.id, temBaixa: c.status === "PAGO" || centavosDeDecimal(c.paidPrincipal) > 0, cancelada: c.status === "CANCELADO" };
}

export type RetencaoDaConta = RetencaoAtual & {
  /** O vencimento da conta do imposto, para a tela dizer quando sai. */
  vencimentoKey: string | null;
};

/** As retenções da conta, na ordem dos tributos, com o estado da conta de cada imposto. */
export async function retencoesDaConta(cliente: Cliente, tenantId: string, entryId: string): Promise<RetencaoDaConta[]> {
  const linhas = await cliente.financeEntryRetention.findMany({
    where: { tenantId, entryId },
    select: { tax: true, amount: true, taxEntry: { select: ESTADO_DA_CONTA } },
  });
  return linhas
    .map((l) => ({
      tributo: l.tax,
      centavos: centavosDeDecimal(l.amount),
      conta: contaDoImposto(l.taxEntry),
      vencimentoKey: l.taxEntry ? saoPauloParts(l.taxEntry.dueDate).dateKey : null,
    }))
    .sort((a, b) => TRIBUTOS_RETIDOS.indexOf(a.tributo) - TRIBUTOS_RETIDOS.indexOf(b.tributo));
}

/** O credor do imposto na empresa — a Receita pelo CNPJ, a prefeitura pelo nome —, criado se ainda não existe. */
async function credor(tx: Tx, tenantId: string, companyId: string, tributo: TributoRetido): Promise<string> {
  const c = credorDoImposto(tributo);
  const achado = await tx.financeCounterparty.findFirst({
    where: { tenantId, companyId, ...(c.documento ? { document: c.documento } : { name: c.nome }) },
    select: { id: true },
  });
  if (achado) return achado.id;
  return (await tx.financeCounterparty.create({ data: { tenantId, companyId, name: c.nome, document: c.documento }, select: { id: true } })).id;
}

/** A categoria de retidos do plano da empresa — a dela antes da do escritório —, se o plano tem. */
async function categoriaDosRetidos(tx: Tx, tenantId: string, companyId: string): Promise<string | null> {
  const categorias = await tx.financeCategory.findMany({
    where: ondeDaEmpresa(tenantId, companyId, { kind: "PAGAR" }),
    select: { id: true, name: true, companyId: true },
  });
  const casam = categorias.filter((c) => ehImpostosRetidosServicosTomados(c.name));
  return (casam.find((c) => c.companyId !== null) ?? casam[0])?.id ?? null;
}

/** A conta de origem, como a conta do imposto herda dela. */
export type ContaDeOrigem = {
  id: string;
  companyId: string;
  counterpartyId: string;
  competence: string;
  categoryId: string | null;
  costCenterId: string | null;
  projectId: string | null;
  documentNumber: string | null;
};

/**
 * Aplica o plano das retenções: grava cada uma e cria, muda ou cancela a conta
 * do imposto. A conta do imposto nasce conferida e sem aprovação — é imposto
 * devido, não pagamento a fornecedor —, com o centro, o projeto e a competência
 * da conta de origem. Mudar e cancelar são condicionados a ela seguir em
 * aberto e sem baixa: a que ganhou baixa no meio-tempo derruba a transação.
 */
export async function aplicarRetencoes(tx: Tx, p: { tenantId: string; userId: string | null; conta: ContaDeOrigem; passos: PassoDaRetencao[] }): Promise<void> {
  if (p.passos.length === 0) return;
  const { tenantId, conta } = p;
  const criar = p.passos.some((s) => s.tipo === "criar");
  const [fornecedor, retidos] = criar
    ? await Promise.all([
        tx.financeCounterparty.findUnique({ where: { id: conta.counterpartyId }, select: { name: true } }),
        categoriaDosRetidos(tx, tenantId, conta.companyId),
      ])
    : [null, null];
  const chave = (tributo: TributoRetido) => ({ entryId_tax: { entryId: conta.id, tax: tributo } });

  for (const passo of p.passos) {
    if (passo.tipo === "criar") {
      const doImposto = await tx.financeEntry.create({
        data: {
          tenantId,
          companyId: conta.companyId,
          kind: "PAGAR",
          status: "CONFERIDO",
          approvalStatus: "NAO_REQUER",
          counterpartyId: await credor(tx, tenantId, conta.companyId, passo.tributo),
          categoryId: categoriaDoImposto(passo.tributo, { categoriaDaConta: conta.categoryId, categoriaDosRetidos: retidos }),
          costCenterId: conta.costCenterId,
          projectId: conta.projectId,
          competence: conta.competence,
          dueDate: instanteDaData(vencimentoDoImposto(passo.tributo, conta.competence)),
          amount: decimalDeCentavos(passo.centavos),
          description: descricaoDaContaDoImposto(passo.tributo, { documento: conta.documentNumber, fornecedor: fornecedor?.name ?? "" }),
          createdById: p.userId,
          reviewedById: p.userId,
          reviewedAt: new Date(),
        },
        select: { id: true },
      });
      await tx.financeEntryRetention.upsert({
        where: chave(passo.tributo),
        create: { tenantId, entryId: conta.id, tax: passo.tributo, amount: decimalDeCentavos(passo.centavos), taxEntryId: doImposto.id },
        update: { amount: decimalDeCentavos(passo.centavos), taxEntryId: doImposto.id },
      });
    } else if (passo.tipo === "atualizar") {
      const r = await tx.financeEntry.updateMany({
        where: { id: passo.contaId, tenantId, ...EM_ABERTO_SEM_BAIXA },
        data: { amount: decimalDeCentavos(passo.centavos) },
      });
      if (r.count !== 1) throw new RecusaDaRetencao(`A conta do ${TRIBUTO[passo.tributo].nome} acabou de mudar (baixa ou cancelamento) — feche e abra de novo.`);
      await tx.financeEntryRetention.update({ where: chave(passo.tributo), data: { amount: decimalDeCentavos(passo.centavos) } });
    } else {
      if (passo.contaId) {
        const r = await tx.financeEntry.updateMany({
          where: { id: passo.contaId, tenantId, ...EM_ABERTO_SEM_BAIXA },
          data: { status: "CANCELADO", closeReason: "CANCELADO" },
        });
        if (r.count !== 1) throw new RecusaDaRetencao(`A conta do ${TRIBUTO[passo.tributo].nome} acabou de mudar (baixa ou cancelamento) — feche e abra de novo.`);
      }
      await tx.financeEntryRetention.delete({ where: chave(passo.tributo) });
    }
  }
}

/**
 * Cancela as contas dos impostos das contas que estão saindo — cancelamento
 * ou estorno da conta de origem. Conta de imposto com baixa barra a saída: o
 * imposto foi recolhido, e cancelar a origem deixaria o recolhimento sem dono.
 * As retenções ficam na conta cancelada, como histórico.
 */
export async function cancelarContasDosImpostos(tx: Tx, tenantId: string, entryIds: string[]): Promise<number> {
  if (entryIds.length === 0) return 0;
  const retencoes = await tx.financeEntryRetention.findMany({
    where: { tenantId, entryId: { in: entryIds }, taxEntryId: { not: null } },
    select: { tax: true, taxEntry: { select: ESTADO_DA_CONTA } },
  });
  const vivas = retencoes.filter((r) => r.taxEntry && r.taxEntry.status !== "CANCELADO");
  const comBaixa = vivas.find((r) => contaDoImposto(r.taxEntry)!.temBaixa);
  if (comBaixa) throw new RecusaDaRetencao(`A conta do ${TRIBUTO[comBaixa.tax].nome} já tem baixa — desfaça a baixa dela antes.`);
  if (vivas.length === 0) return 0;
  const r = await tx.financeEntry.updateMany({
    where: { id: { in: vivas.map((v) => v.taxEntry!.id) }, tenantId, ...EM_ABERTO_SEM_BAIXA },
    data: { status: "CANCELADO", closeReason: "CANCELADO" },
  });
  if (r.count !== vivas.length) throw new RecusaDaRetencao("Uma conta de imposto retido acabou de mudar — atualize a tela.");
  return r.count;
}
