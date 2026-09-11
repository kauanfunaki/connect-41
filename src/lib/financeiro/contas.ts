// As regras da tela de contas a pagar e a receber.
//
// O lançamento já existe e já grava desde a etapa 7 — inclusive pelo valor
// certo, depois que a regra do líquido da NFS-e subiu em 10/09. O que faltava
// era **onde vê-lo**: hoje ele só aparece na ficha do documento que o originou,
// e quem trabalha com contas não entra por documento.
//
// Funções puras, separadas da consulta, porque é aqui que mora o julgamento:
// o que conta como vencido, o que entra no total, e em que ordem a fila lê.

export type SituacaoDaConta = "VENCIDA" | "VENCE_HOJE" | "A_VENCER" | "PAGA" | "CANCELADA";

export type ContaParaSituacao = {
  status: "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO";
  dueDate: Date;
  paidAt: Date | null;
};

/**
 * Em que situação a conta está.
 *
 * Derivada de status + vencimento, e não de uma coluna própria: coluna de
 * "vencida" precisaria de alguém rodando todo dia à meia-noite para continuar
 * verdadeira, e no dia em que esse alguém falhasse a tela mentiria em silêncio.
 *
 * **Pago ganha de vencido** de propósito. Uma conta paga com atraso está paga —
 * mostrá-la como vencida faria a fila de trabalho crescer com o que já foi
 * resolvido, e é justamente a fila que precisa ser confiável.
 */
export function situacaoDaConta(conta: ContaParaSituacao, hojeKey: string, dueKey: string): SituacaoDaConta {
  if (conta.status === "CANCELADO") return "CANCELADA";
  if (conta.status === "PAGO" || conta.paidAt !== null) return "PAGA";
  if (dueKey < hojeKey) return "VENCIDA";
  if (dueKey === hojeKey) return "VENCE_HOJE";
  return "A_VENCER";
}

/** Situações que ainda representam dinheiro a sair ou a entrar. */
export function emAberto(situacao: SituacaoDaConta): boolean {
  return situacao === "VENCIDA" || situacao === "VENCE_HOJE" || situacao === "A_VENCER";
}

export type LinhaDeConta = {
  id: string;
  situacao: SituacaoDaConta;
  /** Em centavos inteiros — nunca float. Ver `centavos` em fiscal/xml.ts. */
  valorCentavos: number;
  vencimentoKey: string;
};

export type Totais = {
  vencido: number;
  venceHoje: number;
  aVencer: number;
  pago: number;
  emAberto: number;
};

/**
 * Os totais da tela, em centavos.
 *
 * Cancelada não entra em nenhum deles — é lançamento que deixou de existir para
 * efeito de caixa, e somá-lo em "pago" inflaria o realizado do mês.
 *
 * `emAberto` é a soma dos três primeiros, e existe como campo próprio porque é
 * o número que a pessoa procura primeiro: quanto ainda falta sair.
 */
export function totalizar(linhas: LinhaDeConta[]): Totais {
  const t: Totais = { vencido: 0, venceHoje: 0, aVencer: 0, pago: 0, emAberto: 0 };
  for (const l of linhas) {
    switch (l.situacao) {
      case "VENCIDA":
        t.vencido += l.valorCentavos;
        break;
      case "VENCE_HOJE":
        t.venceHoje += l.valorCentavos;
        break;
      case "A_VENCER":
        t.aVencer += l.valorCentavos;
        break;
      case "PAGA":
        t.pago += l.valorCentavos;
        break;
      case "CANCELADA":
        break;
    }
  }
  t.emAberto = t.vencido + t.venceHoje + t.aVencer;
  return t;
}

const PESO_DA_SITUACAO: Record<SituacaoDaConta, number> = {
  // Vencido primeiro porque é o que já custa: multa, juros, fornecedor ligando.
  // Depois o que vence hoje, que ainda dá para resolver. Pago e cancelado vão
  // para o fim — são histórico, não trabalho.
  VENCIDA: 0,
  VENCE_HOJE: 1,
  A_VENCER: 2,
  PAGA: 3,
  CANCELADA: 4,
};

/**
 * A ordem da lista.
 *
 * Dentro do mesmo grupo, o vencimento mais antigo primeiro — tanto no vencido
 * (o que está atrasado há mais tempo) quanto no a vencer (o que chega antes).
 * A mesma regra serve os dois porque em ambos a data mais antiga é a mais
 * urgente.
 */
export function ordenarContas<T extends LinhaDeConta>(linhas: T[]): T[] {
  return [...linhas].sort((a, b) => {
    const peso = PESO_DA_SITUACAO[a.situacao] - PESO_DA_SITUACAO[b.situacao];
    if (peso !== 0) return peso;
    if (a.vencimentoKey !== b.vencimentoKey) {
      return a.vencimentoKey < b.vencimentoKey ? -1 : 1;
    }
    // Desempate estável, para a paginação não repetir nem pular linha.
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Dinheiro em centavos inteiros, a partir do `Decimal` do Prisma.
 *
 * O Prisma devolve `Decimal`, e somar isso como número é como se perde centavo.
 * A conversão passa pela string, que é a representação exata que o driver
 * entrega — `Number(decimal)` já teria arredondado antes de chegar aqui.
 */
export function centavosDeDecimal(valor: { toString(): string }): number {
  const texto = valor.toString().trim();
  const negativo = texto.startsWith("-");
  const [inteira, decimal = ""] = texto.replace("-", "").split(".");
  const cents = Number(inteira) * 100 + Number(decimal.padEnd(2, "0").slice(0, 2));
  if (!Number.isSafeInteger(cents)) return 0;
  return negativo ? -cents : cents;
}

/** Centavos de volta para texto com duas casas, para formatar na tela. */
export function reaisDeCentavos(cents: number): number {
  return cents / 100;
}
