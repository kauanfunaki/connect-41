// "O que quer dizer…" — os termos da contabilidade que aparecem no portal,
// explicados para quem não é contador (polimento do portal, 11/11/2026, P31).
//
// Cada termo tem uma âncora fixa na Ajuda (`/portal/ajuda#termo-<chave>`):
// outras telas podem levar direto à explicação ao lado da palavra (ver
// `linkDoTermo`). Mudar a chave quebra esses links — acrescente, não renomeie.

import { normalizar } from "@/lib/buscaDeTelas";

export type TermoDoGlossario = {
  chave: string;
  termo: string;
  /** A explicação, em frases curtas. */
  explicacao: string[];
  /** Outras palavras que a busca também acha ("nota", "lucro"…). */
  sinonimos?: string[];
};

export const GLOSSARIO_DO_PORTAL: readonly TermoDoGlossario[] = [
  {
    chave: "competencia",
    termo: "Competência",
    explicacao: [
      "O mês a que uma nota, uma conta ou um imposto pertence — não o dia em que foi pago.",
      "Uma venda feita em 28 de março e recebida em abril é da competência de março.",
    ],
    sinonimos: ["mês de referência", "período"],
  },
  {
    chave: "baixa",
    termo: "Baixa",
    explicacao: [
      "Numa conta a pagar ou a receber, dar baixa é registrar que ela foi paga. Conta baixada é conta quitada.",
      "Numa empresa, a baixa é o encerramento dela na Junta Comercial, na Receita e na prefeitura. No portal, aparece como “Encerramento da empresa”.",
    ],
    sinonimos: ["quitada", "paga", "encerramento", "fechar empresa"],
  },
  {
    chave: "titulo",
    termo: "Título",
    explicacao: [
      "Cada conta a pagar ou a receber, com valor e vencimento: um boleto, uma parcela, uma fatura.",
      "Título vencido é uma conta que passou do vencimento sem ser paga.",
    ],
    sinonimos: ["boleto", "parcela", "fatura", "conta"],
  },
  {
    chave: "dre",
    termo: "DRE (Resultado do mês)",
    explicacao: [
      "Demonstração do Resultado do Exercício: a conta de quanto a empresa vendeu, quanto gastou e quanto sobrou (lucro) ou faltou (prejuízo) no período.",
      "No portal, fica em “Resultado do mês (DRE)”.",
    ],
    sinonimos: ["lucro", "prejuízo", "resultado", "demonstrativo"],
  },
  {
    chave: "caixa-x-competencia",
    termo: "Regime de caixa x competência",
    explicacao: [
      "Duas formas de olhar o mesmo mês.",
      "Pelo caixa, conta o dia em que o dinheiro entrou ou saiu da conta do banco.",
      "Pela competência, conta o mês a que a venda ou a despesa pertence, mesmo que o pagamento venha depois.",
      "Por isso o resultado de um mês pode ser diferente em cada forma — os dois estão certos.",
    ],
    sinonimos: ["regime de caixa", "regime de competência", "fluxo de caixa"],
  },
  {
    chave: "limite-de-aprovacao",
    termo: "Limite de aprovação",
    explicacao: [
      "O valor até onde você pode aprovar um pagamento, combinado com o escritório para cada empresa.",
      "Conta acima do seu limite aparece para você acompanhar, mas precisa da aprovação de quem tem um limite maior.",
    ],
    sinonimos: ["alçada", "teto", "aprovar pagamento"],
  },
  {
    chave: "exigencia",
    termo: "Exigência",
    explicacao: [
      "Um pedido de um órgão (Junta Comercial, Receita, prefeitura) num processo da sua empresa: um documento que faltou, um dado a corrigir.",
      "Enquanto ela não é respondida, o processo fica parado. No portal, fica em “O que os órgãos pediram”.",
    ],
    sinonimos: ["órgão", "junta", "pendência do processo"],
  },
  {
    chave: "cmv",
    termo: "CMV",
    explicacao: [
      "Custo da Mercadoria Vendida: quanto custou para a empresa o que ela vendeu no período — a compra ou a produção dos produtos.",
      "Aparece na DRE logo depois das vendas: venda menos CMV é o quanto sobra antes das outras despesas.",
    ],
    sinonimos: ["custo", "mercadoria", "estoque"],
  },
  {
    chave: "notas-fiscais",
    termo: "NF-e, NFS-e e CT-e",
    explicacao: [
      "Os tipos de nota fiscal eletrônica.",
      "NF-e: venda ou compra de produtos.",
      "NFS-e: prestação de serviços, emitida na prefeitura.",
      "CT-e: transporte de carga, o frete.",
    ],
    sinonimos: ["nota fiscal", "nota", "nfe", "nfse", "cte", "documento fiscal"],
  },
];

/** A âncora do termo na Ajuda — o `id` do bloco dele. */
export function ancoraDoTermo(chave: string): string {
  return `termo-${chave}`;
}

/** O link que leva direto à explicação do termo: `/portal/ajuda#termo-dre`. */
export function linkDoTermo(chave: string): string {
  return `/portal/ajuda#${ancoraDoTermo(chave)}`;
}

/** Os termos que casam com a busca — pelo nome, pela explicação ou pelos sinônimos, sem acento. */
export function buscarNoGlossario(busca: string, termos: readonly TermoDoGlossario[] = GLOSSARIO_DO_PORTAL): TermoDoGlossario[] {
  const alvo = normalizar(busca).trim();
  if (!alvo) return [...termos];
  return termos.filter((t) => normalizar([t.termo, ...t.explicacao, ...(t.sinonimos ?? [])].join(" ")).includes(alvo));
}
