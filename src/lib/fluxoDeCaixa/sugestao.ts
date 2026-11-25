// A linha do fluxo sugerida para uma categoria, pelo nome (25/11/2026).
//
// Serve para dois casos: a categoria do Omie que ainda não tem categoria do
// cliente (a tela mostra "sugerida: …" e o fluxo a põe ali), e a categoria do
// cliente que a importação cria sem a coluna da linha. É sugestão: a equipe
// confere e troca na tela. Por isso a regra é curta e por palavra, sem tentar
// acertar tudo — o que não reconhece cai em "outras".
//
// Puro.

import { chaveDeTexto } from "./estrutura";

type Regra = { termos: string[]; linha: string | { pagar: string; receber: string } };

/**
 * Na ordem: a primeira que casa vence. As de financiamento e as de "fora"
 * vêm antes das operacionais porque o nome delas é mais específico
 * ("juros de empréstimo" é juros; "transferência de salário" é fora).
 */
const REGRAS: Regra[] = [
  { termos: ["transferencia", "entre contas", "movimentacoes entre contas"], linha: "fora" },
  { termos: ["dividendo", "lucros distribuidos", "distribuicao de lucro"], linha: "dividendos" },
  { termos: ["capital social", "integralizacao", "integracao de capital", "aporte", "retirada de capital", "retirada de socio"], linha: "socios" },
  { termos: ["juros"], linha: "juros" },
  {
    termos: ["emprestimo", "financiamento", "captac", "antecipac", "duplicata descontada", "capital de giro"],
    linha: { pagar: "amortizacoes", receber: "captacoes" },
  },
  { termos: ["amortiza"], linha: "amortizacoes" },
  {
    termos: ["maquina", "equipamento", "imobilizado", "veiculo", "obra", "reforma", "construc", "moldes", "aplicacao", "investimento", "resgate"],
    linha: "investimentos",
  },
  {
    termos: ["imposto", "tributo", "simples nacional", "das ", "icms", "iss", "pis ", "cofins", "irpj", "csll", "ipi ", "darf", "contribuic"],
    linha: "impostos",
  },
  {
    termos: ["salario", "folha", "ferias", "13o", "decimo terceiro", "fgts", "inss", "rescis", "pro-labore", "pro labore", "vale ", "beneficio", "pessoal", "encargos"],
    linha: "pessoal",
  },
  { termos: ["comiss"], linha: "comissoes" },
  { termos: ["frete", "transporte", "cte ", "logistica"], linha: "fretes" },
  { termos: ["materia", "insumo", "mercadoria", "estoque", "compra de produtos", "compras", "fornecedor"], linha: "materia_prima" },
  { termos: ["uso e consumo", "material de consumo", "limpeza", "copa"], linha: "uso_consumo" },
  { termos: ["terceiro", "consultoria", "honorario", "assessoria", "prestacao de servico"], linha: "terceiros" },
  {
    termos: ["aluguel", "energia", "agua", "telefone", "internet", "software", "sistema", "contabil", "administrativ", "tarifa", "seguro", "escritorio"],
    linha: "administrativas",
  },
];

const LETRA = /[a-z0-9]/;

/**
 * O termo começa uma palavra ("iss" casa "ISS" e "ISSQN", não "comissões").
 * Termo terminado em espaço tem de ser a palavra inteira ("das ", "pis ").
 */
function temTermo(texto: string, termo: string): boolean {
  const inteiro = termo.endsWith(" ");
  const t = termo.trim();
  for (let i = texto.indexOf(t); i !== -1; i = texto.indexOf(t, i + 1)) {
    if (i > 0 && LETRA.test(texto[i - 1]!)) continue;
    if (inteiro && LETRA.test(texto[i + t.length] ?? " ")) continue;
    return true;
  }
  return false;
}

/** A linha sugerida. Sempre devolve uma: sem palavra conhecida, "outras". */
export function sugerirLinha(nome: string, kind: "PAGAR" | "RECEBER"): string {
  const k = chaveDeTexto(nome);
  for (const r of REGRAS) {
    if (r.termos.some((t) => temTermo(k, t))) {
      if (typeof r.linha === "string") return r.linha;
      return kind === "RECEBER" ? r.linha.receber : r.linha.pagar;
    }
  }
  if (kind === "RECEBER") {
    return ["venda", "receita", "servico", "cliente", "faturamento"].some((t) => temTermo(k, t)) ? "recebimentos" : "outras_entradas";
  }
  return "outras_saidas";
}
