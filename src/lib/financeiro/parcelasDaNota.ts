// A conta que nasce das duplicatas da nota (status "parado #22", 23/10/2026):
// a conta a pagar da nota de compra e, desde a decisão do mesmo dia, a conta a
// receber da nota de venda — a mesma regra nas duas.
//
// Até aqui a conta de uma NF-e nascia com um valor só e vencimento presumido
// de 30 dias (`vencimentoPresumido`), quando a própria nota diz em quantas
// parcelas o fornecedor cobra, em que dia e quanto — o `<cobr><dup>` do XML,
// que agora chega pelo upload e pelo índice do SPED (`FiscalDocument.installments`,
// ver src/lib/fiscal/duplicatas.ts). Quem fazia a conta bater era o BPO, à mão.
//
// Com duas duplicatas ou mais, a conta nasce parcelada: uma parcela por
// duplicata, cada uma com o seu vencimento e o seu valor, ligadas como a
// série do parcelamento manual (`recurrenceId`, "2/3" — ver `parcelamento.ts`),
// e com a competência da compra em todas. Com uma duplicata só, nasce uma
// conta, vencendo no dia da duplicata em vez do presumido.
//
// **A nota manda, mas só se fechar.** As duplicatas têm de somar exatamente o
// valor da conta (`netAmount ?? amount`); um centavo de diferença e a conta
// nasce como sempre nasceu, inteira, e o motivo vai para a auditoria e para a
// tela — parcelar por números que não fecham criaria um valor que ninguém
// lançou, ou deixaria de lançar um que existe.
//
// Função pura; a gravação é `lancarDocumento`.

import { formatarReaisDeCentavos } from "@/lib/format";
import { lerDuplicatas } from "@/lib/fiscal/duplicatas";
import { MAXIMO_DE_PARCELAS, somaDasParcelas, type Parcela } from "./parcelamento";

export type PlanoDaNota =
  /** A nota não diz nada: a conta nasce como sempre. */
  | { tipo: "SEM_DUPLICATAS" }
  /** Uma duplicata que fecha com a conta: uma conta só, vencendo nela. */
  | { tipo: "VENCIMENTO"; vencimentoKey: string; numero: string | null }
  /** Duas ou mais que fecham: uma parcela por duplicata, em ordem de vencimento. */
  | { tipo: "PARCELAS"; parcelas: (Parcela & { numero: string | null })[] }
  /** Há duplicatas, mas não dá para usá-las: a conta nasce como sempre, e o motivo fica registrado. */
  | { tipo: "RECUSADO"; motivo: string };

export function planoDaNota(p: {
  /** `FiscalDocument.installments`, como está gravado. */
  duplicatas: unknown;
  /** O valor da conta: `netAmount ?? amount`, em centavos. */
  totalCentavos: number | null;
  /** A pagar (nota de compra) ou a receber (nota de venda): a regra é a mesma. */
  kind: "PAGAR" | "RECEBER";
  /**
   * A nota declara retenção — não combina com parcelar ainda. Na compra, a
   * conta vai gerar as contas dos impostos retidos; na venda, quem retém é o
   * cliente, e o líquido por parcela ainda não foi combinado.
   */
  comRetencoes?: boolean;
}): PlanoDaNota {
  // Compra e venda (23/10): a duplicata da nota de venda é o que a empresa
  // cobra do cliente, em quantas vezes e quando — a conta a receber nasce
  // parcelada por ela com a mesma regra da conta a pagar.
  if (p.duplicatas === null || p.duplicatas === undefined) return { tipo: "SEM_DUPLICATAS" };

  const lidas = lerDuplicatas(p.duplicatas);
  if (!lidas) return { tipo: "RECUSADO", motivo: "As duplicatas gravadas da nota não se leem — a conta nasce inteira." };
  if (lidas.length === 0) return { tipo: "SEM_DUPLICATAS" };
  if (lidas.length > MAXIMO_DE_PARCELAS) {
    return { tipo: "RECUSADO", motivo: `A nota tem ${lidas.length} duplicatas, e o parcelamento vai até ${MAXIMO_DE_PARCELAS}.` };
  }
  if (p.comRetencoes) {
    return { tipo: "RECUSADO", motivo: "Retenção ainda não vai junto com o parcelamento — a conta nasce inteira." };
  }
  if (p.totalCentavos === null) return { tipo: "RECUSADO", motivo: "A nota não tem valor apurado para conferir as duplicatas." };

  const soma = somaDasParcelas(lidas);
  if (soma !== p.totalCentavos) {
    return {
      tipo: "RECUSADO",
      motivo: `As duplicatas somam ${formatarReaisDeCentavos(soma)} e a conta é de ${formatarReaisDeCentavos(p.totalCentavos)} — a conta nasce inteira.`,
    };
  }

  if (lidas.length === 1) return { tipo: "VENCIMENTO", vencimentoKey: lidas[0]!.vencimentoKey, numero: lidas[0]!.numero };

  // Em ordem de vencimento, estável: o XML costuma vir em ordem, mas o leiaute
  // não obriga, e a série é numerada pela ordem em que vence.
  const ordenadas = lidas
    .map((d, i) => ({ d, i }))
    .sort((a, b) => (a.d.vencimentoKey < b.d.vencimentoKey ? -1 : a.d.vencimentoKey > b.d.vencimentoKey ? 1 : a.i - b.i))
    .map(({ d }, i) => ({ indice: i + 1, vencimentoKey: d.vencimentoKey, centavos: d.centavos, numero: d.numero }));
  return { tipo: "PARCELAS", parcelas: ordenadas };
}
