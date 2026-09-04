// Quando um documento fiscal pode virar lançamento, e com que dados.
//
// O terceiro verbo do módulo — espelhar, completar, **lançar**. É aqui que o
// acervo encosta no financeiro, e é onde um "dar um jeito" custa dinheiro de
// verdade: lançamento duplicado é pagamento duplicado.
//
// Função pura, separada da escrita, porque as recusas são a parte que precisa
// de teste e não deveriam depender de banco para serem verificadas.

import type { DirecaoDoLancamento } from "@/lib/fiscal/documentos";

/**
 * Vencimento presumido quando o documento não diz.
 *
 * **A NF-e não carrega vencimento.** Ele vive na duplicata ou na cobrança, que
 * não vêm no XML. Trinta dias é a presunção do protótipo do BPO, e existe para
 * o lançamento nascer com uma data em vez de nascer sem — lançamento sem
 * vencimento não entra em fluxo de caixa e some do relatório de quem paga.
 *
 * É presunção, não verdade: a tela deixa sobrescrever, e deve.
 */
export const DIAS_ATE_O_VENCIMENTO_PRESUMIDO = 30;

export function vencimentoPresumido(emitidoEm: Date): Date {
  const d = new Date(emitidoEm);
  d.setDate(d.getDate() + DIAS_ATE_O_VENCIMENTO_PRESUMIDO);
  return d;
}

export type MotivoDeRecusa =
  | "ja_lancado"
  | "cancelada"
  | "removido_na_origem"
  | "direcao_indefinida"
  | "sem_valor"
  | "sem_categoria";

export type DocumentoParaLancar = {
  situacao: "AUTORIZADA" | "CANCELADA";
  destino: "PENDENTE" | "LANCADO" | "IGNORADO";
  removidoNaOrigem: boolean;
  jaTemLancamento: boolean;
  valor: string | null;
  direcao: DirecaoDoLancamento;
};

export type Veredito =
  | { pode: true; kind: "PAGAR" | "RECEBER" }
  | { pode: false; motivo: MotivoDeRecusa; explicacao: string };

/**
 * Pode virar lançamento?
 *
 * Recusa em vez de contornar, e cada recusa tem um custo concreto atrás:
 *
 * - **já lançado** — o vínculo é 1:1; relançar duplicaria valor no financeiro;
 * - **cancelada** — nota cancelada na SEFAZ não é obrigação de ninguém;
 * - **removida na origem** — o índice do SPED deixou de ter o documento, em
 *   geral porque o Portal Nacional passou a mostrá-lo cancelado. Lançar uma
 *   nota que saiu do acervo é criar crédito indevido;
 * - **direção indefinida** — a empresa não é parte, ou é as duas pontas
 *   (transferência entre estabelecimentos). Chutar o lado lançaria dinheiro que
 *   não existe;
 * - **sem valor** — linha `PARCIAL` do índice não tem valor apurado, e zero
 *   somaria no fluxo de caixa um número que ninguém conferiu;
 *
 * A categoria **não** entra aqui: ela é escolha da tela, e recusar antes de a
 * pessoa escolher esconderia o próprio formulário. Fica em
 * `categoriaObrigatoria`, que a action confere na hora de gravar.
 *
 * O documento `IGNORADO` **não** é recusado: quem o ignorou pode mudar de
 * ideia, e a mudança de destino é a própria decisão de lançar.
 */
export function podeLancar(doc: DocumentoParaLancar): Veredito {
  if (doc.jaTemLancamento || doc.destino === "LANCADO") {
    return {
      pode: false,
      motivo: "ja_lancado",
      explicacao: "Este documento já virou lançamento. Relançar duplicaria o valor no financeiro.",
    };
  }
  if (doc.situacao === "CANCELADA") {
    return {
      pode: false,
      motivo: "cancelada",
      explicacao: "Nota cancelada não vira obrigação. Marque como ignorada, com o motivo.",
    };
  }
  if (doc.removidoNaOrigem) {
    return {
      pode: false,
      motivo: "removido_na_origem",
      explicacao:
        "O índice do SPED deixou de ter este documento — em geral porque foi cancelado ou substituído. Lançar criaria crédito indevido.",
    };
  }
  if (doc.direcao === "INDEFINIDA") {
    return {
      pode: false,
      motivo: "direcao_indefinida",
      explicacao:
        "Não dá para dizer se é a pagar ou a receber: a empresa não é emitente nem destinatária, ou é as duas pontas.",
    };
  }
  if (doc.valor === null || doc.valor.trim() === "") {
    return {
      pode: false,
      motivo: "sem_valor",
      explicacao: "O documento veio sem valor apurado (linha parcial do índice). Lançar zero somaria um número que ninguém conferiu.",
    };
  }

  return { pode: true, kind: doc.direcao === "PAGAR" ? "PAGAR" : "RECEBER" };
}

/**
 * Contas a pagar exigem categoria; a receber, não.
 *
 * Despesa sem classificação não fecha o DRE. No recebimento a categoria é
 * opcional — é a mesma assimetria do protótipo, onde `Payable.categoryId` é
 * obrigatório e `Receivable.categoryId` não.
 */
export function categoriaObrigatoria(kind: "PAGAR" | "RECEBER"): boolean {
  return kind === "PAGAR";
}

/**
 * Categoria que o lançamento usa.
 *
 * A escolhida na tela vence. Sem escolha, herda a padrão do fornecedor — é a
 * regra "categoria herdada do fornecedor da 2ª nota em diante": a primeira nota
 * de um fornecedor exige alguém classificar, e da segunda em diante o
 * lançamento já nasce classificado.
 */
export function categoriaDoLancamento(
  escolhida: string | null | undefined,
  padraoDoFornecedor: string | null | undefined
): string | null {
  return escolhida || padraoDoFornecedor || null;
}
