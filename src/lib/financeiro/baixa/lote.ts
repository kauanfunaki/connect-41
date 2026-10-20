// A baixa em lote (fila do BPO, 19/10 — o Omie baixa várias de uma vez): as
// contas marcadas na tela de contas, cada uma pelo saldo, no mesmo dia, saindo
// (ou entrando) pela conta bancária escolhida para a empresa de cada uma.
//
// Juros, multa, desconto e parcial ficam na janela de uma conta só: no lote,
// cada conta quita o que deve. Funções puras; a gravação é
// `registrarPagamentosEmLote` (`acoes.ts`), uma transação por conta — a conta
// recusada (aprovação, alguém pagou antes) não derruba as outras.

import { dataValida } from "../periodo";

/** Teto de um lote — vale também para conferir e alterar as marcadas. */
export const MAXIMO_DO_LOTE = 200;

export type ContaParaOLote = {
  id: string;
  contraparteNome: string;
  empresaId: string;
  status: "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO";
  saldoCentavos: number;
  /** Motivo de a aprovação por alçada travar a baixa, ou nada. */
  bloqueio: string | null;
};

export type ForaDoLote = { id: string; contraparteNome: string; motivo: string };

/** O que entra no lote e o que fica de fora, com o porquê de cada uma. */
export function separarLote<C extends ContaParaOLote>(contas: C[]): { entram: C[]; ficam: ForaDoLote[] } {
  const entram: C[] = [];
  const ficam: ForaDoLote[] = [];
  for (const c of contas) {
    const motivo =
      c.status === "CANCELADO" ? "cancelada" : c.saldoCentavos <= 0 ? "já está paga" : c.bloqueio ? c.bloqueio : null;
    if (motivo) ficam.push({ id: c.id, contraparteNome: c.contraparteNome, motivo });
    else entram.push(c);
  }
  return { entram, ficam };
}

/** O dia da baixa do lote: obrigatório e nunca futuro — a mesma regra da baixa de uma conta. */
export function validarDiaDoLote(texto: string | null | undefined, hojeKey: string): { ok: true; dataKey: string } | { ok: false; erro: string } {
  const dataKey = dataValida(texto);
  if (!dataKey) return { ok: false, erro: "Informe a data do pagamento." };
  if (dataKey > hojeKey) return { ok: false, erro: "A data não pode ser futura — isso é agendamento, não baixa." };
  return { ok: true, dataKey };
}
