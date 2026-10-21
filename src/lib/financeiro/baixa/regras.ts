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

// ─── O espelho do Omie ──────────────────────────────────────────────────────

export type OrigemDaBaixa = "MANUAL" | "LANCAMENTO" | "CONCILIACAO" | "TRANSFERENCIA" | "OMIE" | "MIGRACAO";

/** A baixa como o espelho do Omie a enxerga. */
export type BaixaNoEspelho = {
  id: string;
  origem: OrigemDaBaixa;
  principalCentavos: number;
  paidAtMs: number;
  /** O código da baixa no Omie (`nCodBaixa`), na que veio de lá uma a uma. */
  chave: string | null;
  /**
   * A linha do extrato ligada a ela: `peloOmie` quando foi a conciliação pelo
   * Omie que ligou, e só a ela — o Omie pode desfazer o que ele mesmo fez.
   */
  vinculo: { peloOmie: boolean } | null;
};

/** Uma baixa que o Omie diz que o título tem. */
export type BaixaDoOmieNoEspelho = { chave: string | null; principalCentavos: number; paidAtMs: number };

/** A situação do título no Omie, do jeito que o espelho precisa. */
export type TituloNoEspelho = {
  /** O principal pago lá: o valor do título pago, o `nValPago` da parcial, zero em aberto. */
  pagoCentavos: number;
  /** O dia do último pagamento lá. */
  paidAtMs: number | null;
  /**
   * As baixas de lá uma a uma, quando lidas e conferidas contra `pagoCentavos`
   * (fila do BPO, 19/10 — só a parcial é lida assim). Sem elas, o que o Omie
   * pagou vira uma baixa só, no dia do último pagamento.
   */
  baixas?: { chave: string; principalCentavos: number; paidAtMs: number }[] | null;
};

export type PlanoDoEspelho = {
  criar: BaixaDoOmieNoEspelho[];
  atualizar: (BaixaDoOmieNoEspelho & { id: string; desvincular: boolean })[];
  apagar: { id: string; desvincular: boolean }[];
  /** O Omie e uma baixa conciliada aqui discordam: fica como está, para gente olhar. */
  conflito: boolean;
  /** Quanto do título fica baixado depois do plano. */
  baixadoCentavos: number;
};

/**
 * O que fazer nas baixas de uma conta que veio do Omie para ela dizer o que o
 * Omie diz. As baixas **do Omie** (origem OMIE, e as MIGRACAO, que eram a
 * situação do Omie em 19/10) cobrem o que as baixas daqui não cobrem:
 *
 * - paga lá: a baixa do Omie é o resto do título, no dia de lá — o título
 *   inteiro sem baixa daqui; só o que falta depois de uma parcial feita aqui;
 *   nada, se as daqui já quitam;
 * - paga em parte lá: o mesmo com o que foi pago — e, sem baixa daqui, uma
 *   baixa por pagamento de lá, cada uma no seu dia (`baixas`), casadas pelo
 *   código para a leitura seguinte não duplicar;
 * - em aberto lá (baixa estornada): a baixa do Omie sai.
 *
 * Duas baixas o Omie não toca: a feita no Connect (botão Pagar, conciliação) —
 * quem a fez sabia de um pagamento que o Omie ainda não registrou —, e a baixa
 * do Omie que alguém conciliou **aqui** com o extrato: o extrato mostra o
 * dinheiro, e desfazer aquela conciliação é decisão de gente (`conflito`). A
 * que a conciliação pelo Omie ligou sai do extrato junto (`desvincular`).
 */
export function planoDoEspelho(baixas: BaixaNoEspelho[], omie: TituloNoEspelho): PlanoDoEspelho {
  const doOmie = (b: BaixaNoEspelho) => b.origem === "OMIE" || b.origem === "MIGRACAO";
  const presa = (b: BaixaNoEspelho) => b.vinculo !== null && !b.vinculo.peloOmie;
  const soma = (l: { principalCentavos: number }[]) => l.reduce((s, b) => s + b.principalCentavos, 0);
  const fixas = baixas.filter((b) => !doOmie(b) || presa(b));
  const livres = baixas.filter((b) => doOmie(b) && !presa(b));
  const pagoLa = omie.pagoCentavos > 0 && omie.paidAtMs !== null;

  // As baixas que o Omie deve ter aqui. Uma a uma só sem baixa daqui: com uma
  // parcial feita no Connect não dá para saber qual pagamento de lá é o mesmo.
  let alvos: BaixaDoOmieNoEspelho[] = [];
  if (pagoLa && omie.baixas && omie.baixas.length > 0 && fixas.length === 0) {
    alvos = omie.baixas.map((b) => ({ chave: b.chave, principalCentavos: b.principalCentavos, paidAtMs: b.paidAtMs }));
  } else if (pagoLa) {
    // Sem as baixas de lá uma a uma, as que já vieram com código ficam — são
    // pagamentos de lá, cada um no seu dia —, e o resto vai numa baixa só, no
    // dia do último pagamento: o título que fechou depois de parciais não
    // perde o dia das primeiras.
    const comCodigo = fixas.length === 0 ? livres.filter((b) => b.chave !== null) : [];
    const ficam = soma(comCodigo) <= omie.pagoCentavos ? comCodigo : [];
    const devido = Math.max(0, omie.pagoCentavos - soma(fixas) - soma(ficam));
    alvos = ficam.map((b) => ({ chave: b.chave, principalCentavos: b.principalCentavos, paidAtMs: b.paidAtMs }));
    if (devido > 0) alvos.push({ chave: null, principalCentavos: devido, paidAtMs: omie.paidAtMs! });
  }

  // Cada alvo fica com uma baixa livre: a do mesmo código, senão uma sem
  // código, senão qualquer uma — e a que sobra sai.
  const sobra = [...livres];
  const tirar = (achar: (b: BaixaNoEspelho) => boolean) => {
    const i = sobra.findIndex(achar);
    return i < 0 ? null : sobra.splice(i, 1)[0]!;
  };
  const pares: { alvo: BaixaDoOmieNoEspelho; baixa: BaixaNoEspelho | null }[] = alvos.map((alvo) => ({
    alvo,
    baixa: alvo.chave ? tirar((b) => b.chave === alvo.chave) : null,
  }));
  for (const p of pares) if (!p.baixa) p.baixa = tirar((b) => b.chave === null) ?? tirar(() => true);

  const criar = pares.filter((p) => !p.baixa).map((p) => p.alvo);
  const atualizar = pares.flatMap(({ alvo, baixa }) =>
    baixa && (baixa.principalCentavos !== alvo.principalCentavos || baixa.paidAtMs !== alvo.paidAtMs || baixa.chave !== alvo.chave)
      ? [{ ...alvo, id: baixa.id, desvincular: baixa.vinculo !== null }]
      : []
  );
  const apagar = sobra.map((b) => ({ id: b.id, desvincular: b.vinculo !== null }));

  const presas = baixas.filter((b) => doOmie(b) && presa(b));
  const conflito = presas.length > 0 && (!pagoLa || soma(fixas) > omie.pagoCentavos);
  return { criar, atualizar, apagar, conflito, baixadoCentavos: soma(fixas) + soma(alvos) };
}

/** O plano muda alguma baixa? */
export function planoMexe(p: PlanoDoEspelho): boolean {
  return p.criar.length > 0 || p.atualizar.length > 0 || p.apagar.length > 0;
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
