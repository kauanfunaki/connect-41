// Adiantamento a fornecedor e de cliente (lote D da fila do BPO, 20/10 — a
// "conta corrente do tipo adiantamento" do Omie). Funções puras; a conta, os
// saldos e a gravação moram em `adiantamentoServidor.ts`.
//
// ─── O desenho ───────────────────────────────────────────────────────────────
//
// O adiantamento é uma conta que não é banco — "Adiantamento a fornecedores",
// "Adiantamento de clientes" —, uma de cada por empresa:
//
// - **adiantar** é transferir do banco para ela: o par de lançamentos com o
//   mesmo `transferId`, na categoria de transferência, que a DRE deixa fora do
//   resultado. A contraparte das duas pontas é o fornecedor (ou o cliente) —
//   é por ela que se sabe quanto cada um tem disponível;
// - **usar** é dar a baixa da conta dele saindo (ou entrando) por essa conta:
//   a DRE reconhece a despesa (ou a receita) ali, e o banco não se mexe.
//
// No fluxo de caixa o dinheiro sai quando se adianta (a ponta do banco), e a
// baixa pelo adiantamento não conta — não andou dinheiro. O saldo da conta de
// adiantamento sai das baixas dela, porque ela não tem extrato.

import { formatarReaisDeCentavos } from "@/lib/format";
import { dataValida } from "./periodo";

export const TIPOS_DE_ADIANTAMENTO = ["ADIANTAMENTO_FORNECEDOR", "ADIANTAMENTO_CLIENTE"] as const;

export type TipoDeAdiantamento = (typeof TIPOS_DE_ADIANTAMENTO)[number];

export function ehContaDeAdiantamento(tipo: string | null | undefined): tipo is TipoDeAdiantamento {
  return typeof tipo === "string" && (TIPOS_DE_ADIANTAMENTO as readonly string[]).includes(tipo);
}

/** A conta a pagar usa o adiantamento a fornecedores; a a receber, o de clientes. */
export function tipoDoAdiantamento(kind: "PAGAR" | "RECEBER"): TipoDeAdiantamento {
  return kind === "PAGAR" ? "ADIANTAMENTO_FORNECEDOR" : "ADIANTAMENTO_CLIENTE";
}

/**
 * Como a conta de adiantamento existe no cadastro: sem banco de verdade, com
 * o código 000 e um número que a distingue da outra. O unique de banco e
 * número garante uma de cada por empresa.
 */
export const CONTA_DE_ADIANTAMENTO: Record<TipoDeAdiantamento, { apelido: string; numero: string; digitos: string }> = {
  ADIANTAMENTO_FORNECEDOR: { apelido: "Adiantamento a fornecedores", numero: "ADIANTAMENTO-1", digitos: "1" },
  ADIANTAMENTO_CLIENTE: { apelido: "Adiantamento de clientes", numero: "ADIANTAMENTO-2", digitos: "2" },
};
export const BANCO_DO_ADIANTAMENTO = "000";

/**
 * O sinal de uma baixa na conta de adiantamento: entra o que se adianta (a
 * ponta da transferência), sai o que se usa (a conta paga por ela). No de
 * fornecedores, a ponta é RECEBER e o uso é PAGAR; no de clientes, o contrário.
 */
export function sinalNoAdiantamento(tipo: TipoDeAdiantamento, kind: "PAGAR" | "RECEBER"): 1 | -1 {
  const entra = tipo === "ADIANTAMENTO_FORNECEDOR" ? "RECEBER" : "PAGAR";
  return kind === entra ? 1 : -1;
}

export type MovimentoDoAdiantamento = { contraparteId: string; contraparteNome: string; kind: "PAGAR" | "RECEBER"; centavos: number };

export type SaldoDoAdiantamento = { contraparteId: string; contraparteNome: string; saldoCentavos: number };

/** O disponível de cada fornecedor (ou cliente), do maior para o menor — só quem tem saldo. */
export function saldosDoAdiantamento(tipo: TipoDeAdiantamento, movimentos: MovimentoDoAdiantamento[]): SaldoDoAdiantamento[] {
  const por = new Map<string, SaldoDoAdiantamento>();
  for (const m of movimentos) {
    const s = por.get(m.contraparteId) ?? { contraparteId: m.contraparteId, contraparteNome: m.contraparteNome, saldoCentavos: 0 };
    s.saldoCentavos += sinalNoAdiantamento(tipo, m.kind) * m.centavos;
    por.set(m.contraparteId, s);
  }
  return [...por.values()].filter((s) => s.saldoCentavos !== 0).sort((a, b) => b.saldoCentavos - a.saldoCentavos);
}

/** Teto do `Decimal(12,2)`, o mesmo do lançamento manual. */
const MAIOR_VALOR_EM_CENTAVOS = 9_999_999_999_99;

/** O adiantamento novo: valor positivo, e o dia em que o dinheiro andou — nunca no futuro, como toda baixa. */
export function validarNovoAdiantamento(p: { valorCentavos: number | null; data: string; hojeKey: string }): { ok: true; dataKey: string } | { ok: false; erro: string } {
  if (p.valorCentavos === null) return { ok: false, erro: "Valor ilegível. Use, por exemplo, 1.234,56." };
  if (p.valorCentavos <= 0) return { ok: false, erro: "O adiantamento precisa de um valor." };
  if (p.valorCentavos > MAIOR_VALOR_EM_CENTAVOS) return { ok: false, erro: "Valor acima do limite do financeiro." };
  const dataKey = dataValida(p.data);
  if (!dataKey) return { ok: false, erro: "Informe o dia do adiantamento." };
  if (dataKey > p.hojeKey) return { ok: false, erro: "O adiantamento é do dinheiro que já andou — a data não pode ser futura." };
  return { ok: true, dataKey };
}

/**
 * Usar o adiantamento numa baixa: até o disponível daquele fornecedor (ou
 * cliente). O de um não paga a conta do outro — é o que mantém o saldo de cada
 * um verdadeiro.
 */
export function validarUsoDoAdiantamento(p: { usoCentavos: number; disponivelCentavos: number; contraparteNome: string }): { ok: true } | { ok: false; erro: string } {
  if (p.disponivelCentavos <= 0) return { ok: false, erro: `${p.contraparteNome} não tem adiantamento disponível.` };
  if (p.usoCentavos > p.disponivelCentavos) {
    return {
      ok: false,
      erro: `O adiantamento de ${p.contraparteNome} tem ${formatarReaisDeCentavos(p.disponivelCentavos)} disponível — a baixa pede ${formatarReaisDeCentavos(p.usoCentavos)}. Pague o resto pelo banco, numa baixa à parte.`,
    };
  }
  return { ok: true };
}

/** "Adiantamento a Fornecedor X" / "Adiantamento de Cliente Y" — a descrição das duas pontas. */
export function descricaoDoAdiantamento(tipo: TipoDeAdiantamento, contraparteNome: string, observacao?: string | null): string {
  const base = `${tipo === "ADIANTAMENTO_FORNECEDOR" ? "Adiantamento a" : "Adiantamento de"} ${contraparteNome}`;
  return (observacao ? `${base} — ${observacao}` : base).slice(0, 255);
}
