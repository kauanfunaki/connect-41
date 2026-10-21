// Os fatos da tabela dinâmica (20/10/2026): as contas e as baixas como linhas
// de dimensões e medidas. Funções puras — a leitura no banco é de
// `tabelaDinamicaServidor.ts`.

import { situacaoDaConta } from "@/lib/financeiro/contas";
import { partesDoRateio } from "@/lib/financeiro/rateio";
import type { Fato } from "./tabelaDinamica";

type Nomeado = { nome: string | null };
type Categoria = { nome: string | null; grupo: string | null };

/** Uma conta como a tabela dinâmica precisa: os nomes já resolvidos e as partes do rateio. */
export type ContaParaFato = {
  id: string;
  kind: "PAGAR" | "RECEBER";
  status: "PROVISORIO" | "CONFERIDO" | "PAGO" | "CANCELADO";
  paidAt: Date | null;
  approvalStatus: "NAO_REQUER" | "AGUARDANDO" | "APROVADO" | "REPROVADO";
  valorCentavos: number;
  baixadoCentavos: number;
  competencia: string;
  vencimentoKey: string;
  previsaoKey: string | null;
  quitacaoKey: string | null;
  empresa: string;
  contraparte: string;
  categoria: Categoria;
  centro: Nomeado;
  projeto: Nomeado;
  /** O rateio (duas linhas ou mais). Vazio: a conta inteira na categoria, no centro e no projeto dela. */
  partes: { categoria: Categoria; centro: Nomeado; projeto: Nomeado; centavos: number }[];
};

const APROVACAO: Record<ContaParaFato["approvalStatus"], string | null> = {
  NAO_REQUER: null,
  AGUARDANDO: "Aguardando aprovação",
  APROVADO: "Aprovada",
  REPROVADO: "Reprovada",
};

function situacao(c: ContaParaFato, hojeKey: string): string {
  const s = situacaoDaConta({ status: c.status, paidAt: c.paidAt, dueDate: new Date(`${c.vencimentoKey}T12:00:00-03:00`) }, hojeKey, c.vencimentoKey);
  if (s === "PAGA") return c.kind === "PAGAR" ? "Paga" : "Recebida";
  return { VENCIDA: "Vencida", VENCE_HOJE: "Vence hoje", A_VENCER: "A vencer", CANCELADA: "Cancelada" }[s];
}

/**
 * Uma conta vira um fato — ou um por parte do rateio, com o valor da parte e
 * o pago e o saldo na proporção dela. A chave é a conta: a quantidade conta a
 * rateada uma vez.
 */
export function fatosDasContas(contas: readonly ContaParaFato[], hojeKey: string): Fato[] {
  return contas.flatMap((c) => {
    const comuns = {
      empresa: c.empresa,
      tipo: c.kind === "PAGAR" ? "A pagar" : "A receber",
      contraparte: c.contraparte,
      situacao: situacao(c, hojeKey),
      aprovacao: APROVACAO[c.approvalStatus],
      competencia: c.competencia,
      vencimento: c.vencimentoKey.slice(0, 7),
      previsao: (c.previsaoKey ?? c.vencimentoKey).slice(0, 7),
      quitacao: c.quitacaoKey ? c.quitacaoKey.slice(0, 7) : null,
    };
    const fato = (p: { categoria: Categoria; centro: Nomeado; projeto: Nomeado }, valor: number, baixado: number): Fato => ({
      chave: c.id,
      dims: { ...comuns, categoria: p.categoria.nome, grupo: p.categoria.grupo, centro: p.centro.nome, projeto: p.projeto.nome },
      medidas: { valor, baixado, saldo: Math.max(valor - baixado, 0) },
    });
    if (c.partes.length < 2) return [fato(c, c.valorCentavos, c.baixadoCentavos)];
    const pagos = partesDoRateio(c.baixadoCentavos, c.partes);
    return c.partes.map((p, i) => fato(p, p.centavos, pagos[i]!.centavos));
  });
}

/** Um movimento de caixa (o principal de uma baixa, ou o juro, ou o desconto) com os nomes. */
export type BaixaParaFato = {
  paymentId: string;
  kind: "PAGAR" | "RECEBER";
  parte: "principal" | "encargos" | "desconto";
  centavos: number;
  pagamentoKey: string;
  competencia: string;
  empresa: string;
  contraparte: string;
  categoria: Categoria;
  centro: Nomeado;
  projeto: Nomeado;
};

const PARTE: Record<BaixaParaFato["parte"], string> = { principal: "Principal", encargos: "Juros e multa", desconto: "Desconto" };

/** Cada movimento vira um fato; "entradas menos saídas" leva o sinal. A chave é a baixa. */
export function fatosDasBaixas(baixas: readonly BaixaParaFato[]): Fato[] {
  return baixas.map((b) => ({
    chave: b.paymentId,
    dims: {
      empresa: b.empresa,
      tipo: b.kind === "RECEBER" ? "Entradas" : "Saídas",
      contraparte: b.contraparte,
      categoria: b.categoria.nome,
      grupo: b.categoria.grupo,
      centro: b.centro.nome,
      projeto: b.projeto.nome,
      competencia: b.competencia,
      pagamento: b.pagamentoKey.slice(0, 7),
      parte: PARTE[b.parte],
    },
    medidas: { valor: b.centavos, liquido: b.kind === "RECEBER" ? b.centavos : -b.centavos },
  }));
}
