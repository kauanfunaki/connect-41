// Os pagamentos do lançamento manual (lote 7, 28/10/2026). Pedido do BPO em
// 15/10 e de novo em 28/10: no lançamento manual que já nasce pago, poder dar
// juros, multa e desconto, e a baixa parcial — mais de um pagamento, cada um
// com a sua data. O banco já vinha da conta corrente prevista.
//
// A tela manda as linhas em JSON (`pagamentos`); cada uma passa pela mesma
// regra da janela de baixa (`validarBaixa`), contra o saldo que sobra depois
// das anteriores. A primeira linha sem valor paga o saldo inteiro — é o "Já
// pago em" de antes, agora com encargos.

import { validarBaixa, type BaixaValidada } from "./regras";

export type LinhaDoPagamento = { data: string; valor: string; juros: string; multa: string; desconto: string };

export type Validacao<T> = { ok: true; dados: T } | { ok: false; erro: string };

/** Quantos pagamentos um lançamento manual aceita de uma vez. */
export const MAXIMO_DE_PAGAMENTOS = 12;

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");

/** O JSON da tela, lido. Vazio = sem pagamentos detalhados (vale o "Já pago em" sozinho). */
export function lerPagamentosDoManual(bruto: string | null | undefined): Validacao<LinhaDoPagamento[]> {
  if (!bruto || !bruto.trim()) return { ok: true, dados: [] };
  let lido: unknown;
  try {
    lido = JSON.parse(bruto);
  } catch {
    return { ok: false, erro: "Pagamentos ilegíveis — recarregue a tela." };
  }
  if (!Array.isArray(lido)) return { ok: false, erro: "Pagamentos ilegíveis — recarregue a tela." };
  if (lido.length > MAXIMO_DE_PAGAMENTOS) return { ok: false, erro: `No máximo ${MAXIMO_DE_PAGAMENTOS} pagamentos por lançamento.` };
  return {
    ok: true,
    dados: lido.map((l) => {
      const o = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
      return { data: texto(o.data), valor: texto(o.valor), juros: texto(o.juros), multa: texto(o.multa), desconto: texto(o.desconto) };
    }),
  };
}

const paraTexto = (centavos: number) => `${Math.floor(centavos / 100)},${String(centavos % 100).padStart(2, "0")}`;

/**
 * As baixas, na ordem, contra o valor da conta. A primeira sem valor paga o
 * saldo; as seguintes precisam de valor. Nenhuma passa do que sobra.
 */
export function planejarPagamentosDoManual(linhas: LinhaDoPagamento[], valorCentavos: number, hojeKey: string): Validacao<BaixaValidada[]> {
  const baixas: BaixaValidada[] = [];
  let saldo = valorCentavos;
  for (const [i, l] of linhas.entries()) {
    const n = i + 1;
    if (saldo <= 0) return { ok: false, erro: `O pagamento ${n} sobra: os anteriores já quitam a conta.` };
    if (!l.valor && i > 0) return { ok: false, erro: `Informe o valor do pagamento ${n}.` };
    const v = validarBaixa({ data: l.data, principal: l.valor || paraTexto(saldo), juros: l.juros, multa: l.multa, desconto: l.desconto }, saldo, hojeKey);
    if (!v.ok) return { ok: false, erro: linhas.length > 1 ? `Pagamento ${n}: ${v.erro}` : v.erro };
    baixas.push(v.dados);
    saldo -= v.dados.principalCentavos;
  }
  return { ok: true, dados: baixas };
}
