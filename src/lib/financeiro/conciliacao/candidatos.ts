// Os lançamentos da empresa que podem casar com linhas do extrato — a tela da
// conciliação e as regras (fila do BPO, 21/10) usam a mesma lista. A regra de
// quem casa com quem está em `casamento.ts`; aqui é a leitura.

import { getPrisma } from "@/lib/prisma";
import { saoPauloParts } from "@/lib/agenda";
import { centavosDeDecimal } from "../contas";
import { decimalDeCentavos } from "../manual";
import { motivoDoBloqueioDeBaixa } from "../aprovacao/regras";
import { saldoEmAberto } from "../baixa/regras";
import { TIPOS_COM_EXTRATO } from "../tiposDeConta";
import { tipoCompativel, type LancamentoCandidato } from "./casamento";

/**
 * Lançamentos da empresa que podem casar com as pendentes da tela: tipo
 * compatível, não cancelados, sem vínculo e de valor igual ao de alguma delas.
 */
export async function candidatosDaEmpresa(
  tenantId: string,
  companyId: string,
  pendentes: { amount: { toString(): string } }[]
): Promise<(LancamentoCandidato & { descricao: string | null })[]> {
  const valores = [...new Set(pendentes.map((p) => centavosDeDecimal(p.amount)))];
  const tipos = [...new Set(valores.map(tipoCompativel).filter((k): k is "PAGAR" | "RECEBER" => k !== null))];
  const absolutos = [...new Set(valores.map((v) => Math.abs(v)).filter((v) => v > 0))];
  if (absolutos.length === 0) return [];

  const prisma = getPrisma();
  const valoresExatos = absolutos.map(decimalDeCentavos);
  // Duas fontes (lote C, 19/10): a conta em aberto, pelo saldo — conciliar
  // quita —, e a baixa já feita sem extrato, pelo total que andou. A conta com
  // baixa parcial entra pelo saldo, que pode não ser o valor dela: por isso o
  // `paidPrincipal > 0`, e o saldo é conferido aqui embaixo.
  const [contas, baixas] = await Promise.all([
    prisma.financeEntry.findMany({
      where: {
        tenantId,
        companyId,
        kind: { in: tipos },
        paidAt: null,
        status: { notIn: ["CANCELADO", "PAGO"] },
        OR: [{ amount: { in: valoresExatos } }, { paidPrincipal: { gt: 0 } }],
      },
      select: {
        id: true,
        kind: true,
        status: true,
        amount: true,
        paidPrincipal: true,
        dueDate: true,
        description: true,
        approvalStatus: true,
        counterparty: { select: { name: true, document: true } },
      },
      take: 2_000,
    }),
    prisma.financeEntryPayment.findMany({
      where: {
        tenantId,
        companyId,
        bankMatch: { is: null },
        cash: { in: valoresExatos },
        entry: { kind: { in: tipos }, status: { not: "CANCELADO" } },
        // A baixa por conta sem extrato (caixinha, adiantamento, cartão, empréstimo…) não passou pelo banco: não casa com o extrato.
        OR: [{ bankAccountId: null }, { bankAccount: { type: { in: [...TIPOS_COM_EXTRATO] } } }],
      },
      select: {
        id: true,
        cash: true,
        paidAt: true,
        entry: { select: { kind: true, status: true, dueDate: true, description: true, counterparty: { select: { name: true, document: true } } } },
      },
      take: 2_000,
    }),
  ]);
  return [
    ...contas.map((l) => ({
      id: l.id,
      descricao: l.description,
      kind: l.kind,
      status: l.status,
      centavos: saldoEmAberto(centavosDeDecimal(l.amount), centavosDeDecimal(l.paidPrincipal)),
      vencimentoKey: saoPauloParts(l.dueDate).dateKey,
      pagoEmKey: null,
      contraparteNome: l.counterparty.name,
      contraparteDocumento: l.counterparty.document,
      conciliado: false,
      // A mesma frase que a action devolve ao confirmar — só que antes do clique.
      bloqueioDeBaixa: motivoDoBloqueioDeBaixa(l),
    })),
    ...baixas.map((b) => ({
      // O prefixo diz à action que é uma baixa, e não a conta (`PREFIXO_DA_BAIXA`).
      id: `baixa:${b.id}`,
      descricao: b.entry.description,
      kind: b.entry.kind,
      status: b.entry.status,
      centavos: centavosDeDecimal(b.cash),
      vencimentoKey: saoPauloParts(b.entry.dueDate).dateKey,
      // Baixa já registrada: a data dela é o sinal mais forte para o extrato.
      pagoEmKey: saoPauloParts(b.paidAt).dateKey,
      contraparteNome: b.entry.counterparty.name,
      contraparteDocumento: b.entry.counterparty.document,
      conciliado: false,
      bloqueioDeBaixa: null,
    })),
  ];
}
