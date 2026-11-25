// A estrutura do fluxo de caixa projetado (25/11/2026, funcionalidade-837).
//
// As linhas do fluxo direto: operacional, investimento e financiamento, mais
// "fora do fluxo" para o que não é caixa da empresa (transferência entre as
// contas dela). É a mesma para todos os clientes; o que muda por empresa é a
// nomenclatura do cliente (`ClientCategory`), que cai numa destas linhas.
//
// O código da linha vai para o banco como texto (`ClientCategory.line`), como
// o `grupo` da DRE: mudar o rótulo aqui não pede migration, mudar o código
// pede uma, que regrave as linhas gravadas.
//
// Puro: a tela do BPO (componente cliente) importa daqui.

export type GrupoDoFluxo = "operacional" | "investimento" | "financiamento" | "fora";

export type LinhaDoFluxo = { code: string; label: string; grupo: GrupoDoFluxo };

export const GRUPOS_DO_FLUXO: { code: GrupoDoFluxo; label: string }[] = [
  { code: "operacional", label: "Operacional" },
  { code: "investimento", label: "Investimento" },
  { code: "financiamento", label: "Financiamento" },
  { code: "fora", label: "Fora do fluxo" },
];

export const LINHAS_DO_FLUXO: LinhaDoFluxo[] = [
  { code: "recebimentos", label: "Recebimentos de clientes", grupo: "operacional" },
  { code: "outras_entradas", label: "Outras entradas operacionais", grupo: "operacional" },
  { code: "impostos", label: "Impostos e contribuições", grupo: "operacional" },
  { code: "materia_prima", label: "Fornecedores e matéria-prima", grupo: "operacional" },
  { code: "pessoal", label: "Despesas com pessoal", grupo: "operacional" },
  { code: "terceiros", label: "Serviços de terceiros", grupo: "operacional" },
  { code: "administrativas", label: "Despesas administrativas", grupo: "operacional" },
  { code: "uso_consumo", label: "Material de uso e consumo", grupo: "operacional" },
  { code: "comissoes", label: "Comissões", grupo: "operacional" },
  { code: "fretes", label: "Fretes", grupo: "operacional" },
  { code: "outras_saidas", label: "Outras despesas operacionais", grupo: "operacional" },
  { code: "investimentos", label: "Investimentos (máquinas, obras e aplicações)", grupo: "investimento" },
  { code: "captacoes", label: "Captações (empréstimos)", grupo: "financiamento" },
  { code: "amortizacoes", label: "Amortizações", grupo: "financiamento" },
  { code: "juros", label: "Juros", grupo: "financiamento" },
  { code: "socios", label: "Aportes e retiradas de sócios", grupo: "financiamento" },
  { code: "dividendos", label: "Dividendos", grupo: "financiamento" },
  { code: "fora", label: "Fora do fluxo (transferências entre contas)", grupo: "fora" },
];

const POR_CODIGO = new Map(LINHAS_DO_FLUXO.map((l) => [l.code, l]));

export function linhaDoCodigo(code: string): LinhaDoFluxo | null {
  return POR_CODIGO.get(code) ?? null;
}

export function rotuloDaLinha(code: string): string {
  return POR_CODIGO.get(code)?.label ?? code;
}

/** Normaliza para comparar: sem acento, sem caixa, espaço colapsado. */
export function chaveDeTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Sem o que vem entre parênteses: "Matéria-Prima (MP)" casa com "Matéria-prima". */
function semParenteses(texto: string): string {
  return chaveDeTexto(texto.replace(/\([^)]*\)/g, " "));
}

/**
 * Como os de-para dos clientes costumam escrever as linhas (os subgrupos de
 * DFC das planilhas deles), para a importação aceitar sem a equipe reescrever.
 */
const OUTROS_NOMES: Record<string, string> = {
  "recebimentos de clientes faturado": "recebimentos",
  "recebimento de clientes": "recebimentos",
  "receitas operacionais": "recebimentos",
  "vendas": "recebimentos",
  "materia-prima": "materia_prima",
  "materia prima": "materia_prima",
  "fornecedores": "materia_prima",
  "pessoal": "pessoal",
  "folha de pagamento": "pessoal",
  "impostos": "impostos",
  "uso e consumo": "uso_consumo",
  "outras despesas": "outras_saidas",
  "investimentos": "investimentos",
  "emprestimos": "captacoes",
  "captacoes": "captacoes",
  "aportes/retiradas de capital": "socios",
  "aportes e retiradas de capital": "socios",
  "excluir": "fora",
  "excluir transferencia interna": "fora",
  "transferencia interna": "fora",
  "transferencias entre contas": "fora",
  "fora do fluxo": "fora",
};

/**
 * A linha que um texto da planilha quer dizer: o código, o rótulo, ou um dos
 * nomes que os clientes usam. Nula quando não reconhece — a importação mostra
 * a linha do arquivo como inválida em vez de chutar.
 */
export function linhaDeTexto(texto: string): string | null {
  const k = chaveDeTexto(texto);
  if (!k) return null;
  for (const l of LINHAS_DO_FLUXO) {
    if (k === l.code || k === chaveDeTexto(l.label)) return l.code;
  }
  const curta = semParenteses(texto);
  for (const l of LINHAS_DO_FLUXO) {
    if (curta === semParenteses(l.label)) return l.code;
  }
  return OUTROS_NOMES[k] ?? OUTROS_NOMES[curta] ?? OUTROS_NOMES[k.replace(/[()]/g, "").replace(/\s+/g, " ")] ?? null;
}
