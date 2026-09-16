// O lançamento manual — a conta que não nasce de nota fiscal.
//
// Até aqui todo `FinanceEntry` vinha de `lancarDocumento`. Aluguel, folha,
// pró-labore, tarifa bancária e o recebimento de um contrato sem nota nunca
// existiram no financeiro, e sem eles nem a DRE econômica nem o fluxo de caixa
// fecham. Esta é a outra porta de entrada.
//
// Funções puras: a validação é a mesma no formulário e na importação de CSV, e
// é a parte que precisa de teste sem banco.

import { categoriaObrigatoria } from "./lancamento";
import { competenciaValida, dataValida } from "./periodo";

export type TipoDoLancamento = "PAGAR" | "RECEBER";

/**
 * Texto de dinheiro para centavos inteiros. `null` quando não dá para ler.
 *
 * Aceita o que se digita no Brasil e o que planilha exporta: `1.234,56`,
 * `1234,56`, `1234.56`, `R$ 10`. O caso ambíguo é o ponto sozinho — `1.234` é
 * mil duzentos e trinta e quatro (milhar pt-BR), `12.5` é doze e cinquenta.
 * A regra: ponto seguido de exatamente três dígitos, em grupos, é milhar.
 *
 * **Três casas decimais é recusa**, não arredondamento: `10,555` é erro de
 * digitação, e arredondar em silêncio lança um valor que ninguém escreveu.
 */
export function centavosDeTexto(texto: string | null | undefined): number | null {
  let t = (texto ?? "").replace(/R\$/gi, "").replace(/\s/g, "");
  if (t === "" || t.startsWith("-")) return null;

  const temVirgula = t.includes(",");
  const temPonto = t.includes(".");
  if (temVirgula && temPonto) {
    // O último separador é o decimal; o outro é milhar.
    const decimal = t.lastIndexOf(",") > t.lastIndexOf(".") ? "," : ".";
    const milhar = decimal === "," ? "." : ",";
    t = t.split(milhar).join("").replace(decimal, ".");
  } else if (temVirgula) {
    t = t.replace(",", ".");
  } else if (temPonto && /^\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.split(".").join("");
  }

  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const centavos = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(centavos) ? centavos : null;
}

/** Centavos para o texto que o `Decimal(12,2)` do Prisma aceita sem passar por float. */
export function decimalDeCentavos(centavos: number): string {
  const inteiro = Math.trunc(Math.abs(centavos) / 100);
  const resto = Math.abs(centavos) % 100;
  return `${centavos < 0 ? "-" : ""}${inteiro}.${String(resto).padStart(2, "0")}`;
}

/** Só os dígitos de um CNPJ/CPF, ou `null` quando vazio. */
export function digitosDoDocumento(texto: string | null | undefined): string | null {
  const d = (texto ?? "").replace(/\D/g, "");
  return d === "" ? null : d;
}

export type CamposDoLancamento = {
  kind: string | null | undefined;
  competencia: string | null | undefined;
  vencimento: string | null | undefined;
  valor: string | null | undefined;
  descricao?: string | null;
  pagoEm?: string | null;
  /** Já resolvida — id no formulário, nome casado no CSV. */
  categoryId: string | null;
};

export type LancamentoValidado = {
  kind: TipoDoLancamento;
  competencia: string;
  vencimentoKey: string;
  centavos: number;
  descricao: string | null;
  pagoEmKey: string | null;
  categoryId: string | null;
};

export type Validacao<T> = { ok: true; dados: T } | { ok: false; erro: string };

/** Teto do `Decimal(12,2)`: dez dígitos inteiros. Acima disso o banco recusa com erro genérico. */
const MAIOR_VALOR_EM_CENTAVOS = 9_999_999_999_99;

/**
 * Os campos de dinheiro e de data de um lançamento, validados.
 *
 * As recusas, e o que cada uma evita:
 *
 * - **categoria em PAGAR** — a mesma regra do lançamento por nota
 *   (`categoriaObrigatoria`): despesa sem classificação não fecha o DRE;
 * - **valor zero** — somaria no fluxo de caixa uma linha que não move nada;
 * - **pago no futuro** — é agendamento, não baixa. A mesma recusa de
 *   `podeMarcarPago`, porque um lançamento que já nasce pago é uma baixa;
 * - **competência inválida** — a DRE econômica filtra por ela; texto fora do
 *   formato faria o lançamento existir e não aparecer em mês nenhum.
 */
export function validarCamposDoLancamento(
  campos: CamposDoLancamento,
  hojeKey: string
): Validacao<LancamentoValidado> {
  const kind = campos.kind === "PAGAR" || campos.kind === "RECEBER" ? campos.kind : null;
  if (!kind) return { ok: false, erro: "Diga se é conta a pagar ou a receber." };

  const competencia = competenciaValida(campos.competencia);
  if (!competencia) return { ok: false, erro: "Competência inválida — use o formato AAAA-MM." };

  const vencimentoKey = dataValida(campos.vencimento);
  if (!vencimentoKey) return { ok: false, erro: "Informe um vencimento válido." };

  const centavos = centavosDeTexto(campos.valor);
  if (centavos === null) return { ok: false, erro: "Valor ilegível. Use, por exemplo, 1.234,56." };
  if (centavos === 0) return { ok: false, erro: "O valor não pode ser zero." };
  if (centavos > MAIOR_VALOR_EM_CENTAVOS) return { ok: false, erro: "Valor acima do limite do financeiro." };

  if (categoriaObrigatoria(kind) && !campos.categoryId) {
    return { ok: false, erro: "Conta a pagar precisa de categoria — despesa sem classificação não fecha o DRE." };
  }

  const descricao = (campos.descricao ?? "").trim();
  if (descricao.length > 255) return { ok: false, erro: "Descrição com mais de 255 caracteres." };

  let pagoEmKey: string | null = null;
  if ((campos.pagoEm ?? "").trim() !== "") {
    pagoEmKey = dataValida(campos.pagoEm);
    if (!pagoEmKey) return { ok: false, erro: "Data de pagamento inválida." };
    if (pagoEmKey > hojeKey) {
      return { ok: false, erro: "A data do pagamento não pode ser futura — isso é agendamento, não baixa." };
    }
  }

  return {
    ok: true,
    dados: {
      kind,
      competencia,
      vencimentoKey,
      centavos,
      descricao: descricao === "" ? null : descricao,
      pagoEmKey,
      categoryId: campos.categoryId,
    },
  };
}

/**
 * Status com que o manual nasce.
 *
 * **Não é `PROVISORIO`.** Provisório marca o que a máquina propôs a partir de
 * uma nota e alguém ainda precisa olhar; o lançamento manual foi digitado por
 * uma pessoa, que é justamente o olhar que o provisório espera. Nasce
 * conferido — ou pago, quando já veio com a data da baixa.
 */
export function statusInicialDoManual(pagoEmKey: string | null): "CONFERIDO" | "PAGO" {
  return pagoEmKey ? "PAGO" : "CONFERIDO";
}

/**
 * O lançamento manual pode ser cancelado?
 *
 * Cancelar, e não apagar: `CANCELADO` já sai de todos os totais e deixa rastro.
 *
 * - **veio de nota** — o caminho é o estorno na ficha do documento, que
 *   devolve a nota para pendente. Cancelar aqui deixaria a nota marcada como
 *   lançada apontando para um lançamento morto;
 * - **pago** — desfaça a baixa antes. Cancelar um pagamento esconderia
 *   dinheiro que saiu da conta;
 * - **parcela de acordo** — o caminho é desfazer o acordo, que cancela as
 *   parcelas juntas e devolve os títulos originais. Cancelar uma parcela solta
 *   deixaria o acordo cobrando menos do que foi combinado, sem ninguém decidir.
 */
export function podeCancelarManual(conta: {
  status: "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO";
  paidAt: Date | null;
  fiscalDocumentId: string | null;
  agreementId?: string | null;
}): { pode: true } | { pode: false; motivo: string } {
  if (conta.agreementId) {
    return { pode: false, motivo: "Parcela de acordo de cobrança — desfaça o acordo na tela de cobrança." };
  }
  if (conta.fiscalDocumentId) {
    return { pode: false, motivo: "Este lançamento veio de um documento fiscal — estorne na ficha da nota." };
  }
  if (conta.status === "CANCELADO") return { pode: false, motivo: "Já está cancelado." };
  if (conta.status === "PAGO" || conta.paidAt !== null) {
    return { pode: false, motivo: "Está pago. Desfaça a baixa antes de cancelar." };
  }
  return { pode: true };
}
