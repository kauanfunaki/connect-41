// A baixa em lote (fila do BPO, 19/10 — o Omie baixa várias de uma vez): as
// contas marcadas na tela de contas, cada uma pelo saldo, no mesmo dia, saindo
// (ou entrando) pela conta bancária escolhida para a empresa de cada uma.
//
// Parcial fica na janela de uma conta só: no lote, cada conta quita o saldo.
// Juros, multa e desconto entram no lote só pela regra (22/10/2026): com
// "Calcular juros e multa pelo atraso" ligado, cada conta leva os da regra
// dela (a do fornecedor ou cliente, senão a da empresa), pelo vencimento dela
// e pelo dia do lote — `encargosDoLote`. Funções puras; a gravação é
// `registrarPagamentosEmLote` (`acoes.ts`), uma transação por conta — a conta
// recusada (aprovação, alguém pagou antes) não derruba as outras.

import { dataValida } from "../periodo";
import { encargosDaBaixa, type EncargosCalculados, type RegraDeEncargos } from "./encargos";

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

/** A conta do lote como os encargos a veem: o saldo (o principal da baixa), o vencimento e a regra que vale. */
export type ContaComRegra = { id: string; saldoCentavos: number; vencimentoKey: string; regra: RegraDeEncargos | null };

export type EncargosDoLote = {
  /** Os encargos de cada conta, pelo id — só as que têm alguma coisa. */
  porConta: Map<string, EncargosCalculados>;
  jurosCentavos: number;
  multaCentavos: number;
  descontoCentavos: number;
  /** Quantas contas levam juros, multa ou desconto. */
  contasComEncargos: number;
};

/**
 * Juros, multa e desconto do lote (22/10/2026): cada conta pela regra dela,
 * pelo vencimento dela e pelo dia do lote, sobre o saldo — a mesma conta da
 * janela de uma conta só. A janela mostra o resumo; o servidor refaz conta a
 * conta pela regra lida no banco (e pelo saldo lido com a conta travada), sem
 * confiar no total da tela.
 */
export function encargosDoLote(contas: ContaComRegra[], pagamentoKey: string): EncargosDoLote {
  const porConta = new Map<string, EncargosCalculados>();
  let jurosCentavos = 0;
  let multaCentavos = 0;
  let descontoCentavos = 0;
  for (const c of contas) {
    const e = encargosDaBaixa({ principalCentavos: c.saldoCentavos, vencimentoKey: c.vencimentoKey, pagamentoKey }, c.regra);
    if (e.jurosCentavos + e.multaCentavos + e.descontoCentavos === 0) continue;
    porConta.set(c.id, e);
    jurosCentavos += e.jurosCentavos;
    multaCentavos += e.multaCentavos;
    descontoCentavos += e.descontoCentavos;
  }
  return { porConta, jurosCentavos, multaCentavos, descontoCentavos, contasComEncargos: porConta.size };
}

/** A opção "Calcular juros e multa" nasce ligada quando alguma conta do lote tem regra. */
export function algumaTemRegra(contas: { regra: RegraDeEncargos | null }[]): boolean {
  return contas.some((c) => c.regra !== null);
}
