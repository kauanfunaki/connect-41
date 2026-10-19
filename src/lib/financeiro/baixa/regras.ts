// A baixa (19/10, lote C — pedidos 4 e 6 do BPO): pagamento ou recebimento de
// uma conta, total ou parcial, com conta bancária, juros, multa e desconto.
// Funções puras; a gravação é `servidor.ts`.
//
// ─── Os números de uma baixa ─────────────────────────────────────────────────
//
// - **principal**: quanto do título esta baixa quita. Começa no saldo em aberto;
//   menos que isso é baixa parcial, e a conta continua em aberto com o resto;
// - **juros, multa, desconto**: o que muda o dinheiro, não o título;
// - **total** (`cash`): o que andou na conta — principal + juros + multa −
//   desconto. É ele que bate com a linha do extrato.
//
// Ex.: boleto de R$ 1.000 pago com 3 dias de atraso, R$ 20 de multa e R$ 3 de
// juros: principal 1.000, total 1.023, saldo zero. Pago em duas vezes, R$ 400 e
// depois R$ 600: duas baixas, a conta só fica paga na segunda.
//
// ─── Para onde vão juros, multa e desconto ───────────────────────────────────
//
// Para categorias próprias (`categoriaDaParte`), que a DRE soma como qualquer
// outra: juros e multa pagos são despesa; desconto obtido numa conta a pagar
// é receita; numa conta a receber, juros e multa recebidos são receita e o
// desconto concedido é despesa. Decisão do Kauan em 19/10, com o BPO
// confirmando depois — as categorias são do plano do escritório e a linha da
// DRE de cada uma muda lá, sem mexer em baixa nenhuma.

import { centavosDeTexto } from "../manual";
import { dataValida } from "../periodo";
import { chaveDaCategoria } from "@/lib/dre/calculo";

export type TipoDoLancamento = "PAGAR" | "RECEBER";

export type BaixaValidada = {
  dataKey: string;
  principalCentavos: number;
  jurosCentavos: number;
  multaCentavos: number;
  descontoCentavos: number;
  /** O que andou na conta. */
  caixaCentavos: number;
  /** A baixa quita o saldo inteiro: a conta fica paga. */
  quita: boolean;
};

/** Texto de dinheiro opcional: vazio é zero, ilegível é `null`. */
function centavosOpcionais(texto: string | null | undefined): number | null {
  if ((texto ?? "").trim() === "") return 0;
  return centavosDeTexto(texto);
}

/**
 * Os campos da janela de baixa, validados contra o saldo da conta.
 *
 * As recusas, e o que cada uma evita:
 * - **data futura** — é agendamento, não baixa (a mesma regra de sempre);
 * - **principal acima do saldo** — pagaria o título duas vezes; o que passa do
 *   saldo, se o banco cobrou, é juro ou multa;
 * - **principal zero** — baixa que não quita nada não é baixa;
 * - **desconto maior que o total** — o dinheiro andaria ao contrário.
 */
export function validarBaixa(
  campos: { data: string | null | undefined; principal: string | null | undefined; juros?: string | null; multa?: string | null; desconto?: string | null },
  saldoCentavos: number,
  hojeKey: string
): { ok: true; dados: BaixaValidada } | { ok: false; erro: string } {
  const dataKey = dataValida(campos.data);
  if (!dataKey) return { ok: false, erro: "Informe a data do pagamento." };
  if (dataKey > hojeKey) return { ok: false, erro: "A data não pode ser futura — isso é agendamento, não baixa." };

  if (saldoCentavos <= 0) return { ok: false, erro: "Esta conta não tem saldo em aberto." };
  const principal = centavosDeTexto(campos.principal);
  if (principal === null) return { ok: false, erro: "Valor da baixa ilegível. Use, por exemplo, 1.234,56." };
  if (principal === 0) return { ok: false, erro: "O valor da baixa não pode ser zero." };
  if (principal > saldoCentavos) {
    return { ok: false, erro: "O valor da baixa passa do saldo em aberto. O que o banco cobrou a mais vai em juros ou multa." };
  }

  const juros = centavosOpcionais(campos.juros);
  const multa = centavosOpcionais(campos.multa);
  const desconto = centavosOpcionais(campos.desconto);
  if (juros === null || multa === null || desconto === null) return { ok: false, erro: "Juros, multa ou desconto ilegível." };

  const caixa = principal + juros + multa - desconto;
  if (caixa < 0) return { ok: false, erro: "O desconto passa do total — o dinheiro andaria ao contrário." };

  return {
    ok: true,
    dados: {
      dataKey,
      principalCentavos: principal,
      jurosCentavos: juros,
      multaCentavos: multa,
      descontoCentavos: desconto,
      caixaCentavos: caixa,
      quita: principal === saldoCentavos,
    },
  };
}

/** Saldo em aberto de uma conta: o valor menos o que as baixas já quitaram, nunca negativo. */
export function saldoEmAberto(valorCentavos: number, baixadoCentavos: number): number {
  return Math.max(0, valorCentavos - baixadoCentavos);
}

/**
 * O estado da conta depois que as baixas mudaram. Paga só com o saldo zerado —
 * a parcial continua em aberto, com o vencimento de sempre, em todos os
 * filtros de "em aberto" que já existem. A data da conta paga é a da última
 * baixa: é quando ela deixou de dever.
 */
export function estadoDaConta(
  conta: { valorCentavos: number; status: "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO" },
  baixas: { principalCentavos: number; dataKey: string }[]
): { baixadoCentavos: number; quitada: boolean; ultimaDataKey: string | null; status: "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO" } {
  const baixado = baixas.reduce((s, b) => s + b.principalCentavos, 0);
  const quitada = baixas.length > 0 && baixado >= conta.valorCentavos;
  const ultima = baixas.reduce<string | null>((m, b) => (m === null || b.dataKey > m ? b.dataKey : m), null);
  // Cancelada continua cancelada; paga que perdeu baixa volta a conferida —
  // alguém já olhou esta conta (a mesma regra de `desfazerPagamento`).
  const status =
    conta.status === "CANCELADO" ? "CANCELADO" : quitada ? "PAGO" : conta.status === "PAGO" ? "CONFERIDO" : conta.status;
  return { baixadoCentavos: baixado, quitada, ultimaDataKey: quitada ? ultima : null, status };
}

// ─── As categorias da baixa ─────────────────────────────────────────────────

export type ParteDaBaixa = "encargos" | "desconto";

export type CategoriaDaParte = { nome: string; kind: TipoDoLancamento; dreGroup: string };

/**
 * A categoria de juros e multa ("encargos") ou de desconto, conforme o tipo da
 * conta. O nome da primeira já existe no plano padrão da 41; as outras três
 * nascem no plano do escritório na primeira baixa que precisar delas.
 */
export function categoriaDaParte(kind: TipoDoLancamento, parte: ParteDaBaixa): CategoriaDaParte {
  if (kind === "PAGAR") {
    return parte === "encargos"
      ? { nome: "Juros pagos para Fornecedores", kind: "PAGAR", dreGroup: "outras_despesas" }
      : { nome: "Descontos obtidos", kind: "RECEBER", dreGroup: "outras_receitas" };
  }
  return parte === "encargos"
    ? { nome: "Juros e multas recebidos", kind: "RECEBER", dreGroup: "outras_receitas" }
    : { nome: "Descontos concedidos", kind: "PAGAR", dreGroup: "outras_despesas" };
}

/** Esta categoria é a da parte? Pelo nome, sem acento nem caixa. */
export function ehCategoriaDaParte(nome: string, alvo: CategoriaDaParte): boolean {
  return chaveDaCategoria(nome) === chaveDaCategoria(alvo.nome);
}

export type MovimentoDaBaixa = {
  kind: TipoDoLancamento;
  centavos: number;
  categoryId: string | null;
  parte: "principal" | ParteDaBaixa;
};

/**
 * Uma baixa como os relatórios de caixa a leem: o principal na categoria da
 * conta; juros e multa no mesmo sentido, na categoria de encargos; o desconto
 * no sentido contrário, na categoria de desconto. A soma com sinal é o total
 * que andou na conta.
 */
export function movimentosDaBaixa(b: {
  kind: TipoDoLancamento;
  categoryId: string | null;
  principalCentavos: number;
  jurosCentavos: number;
  multaCentavos: number;
  descontoCentavos: number;
  interestCategoryId: string | null;
  discountCategoryId: string | null;
}): MovimentoDaBaixa[] {
  const saida: MovimentoDaBaixa[] = [{ kind: b.kind, centavos: b.principalCentavos, categoryId: b.categoryId, parte: "principal" }];
  const encargos = b.jurosCentavos + b.multaCentavos;
  if (encargos > 0) saida.push({ kind: b.kind, centavos: encargos, categoryId: b.interestCategoryId, parte: "encargos" });
  if (b.descontoCentavos > 0) {
    saida.push({ kind: b.kind === "PAGAR" ? "RECEBER" : "PAGAR", centavos: b.descontoCentavos, categoryId: b.discountCategoryId, parte: "desconto" });
  }
  return saida;
}
