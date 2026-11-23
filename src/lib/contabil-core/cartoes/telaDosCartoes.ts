// O que a aba "Cartões" recebe das rotas (Bloco C, Fase C3, 23/11/2026). Só tipos e formatos: a tela
// (`components/contabil-core/Cartoes.tsx`) importa daqui sem puxar o servidor. O dinheiro vem como o texto
// do `Decimal` do original ("1500.00"); as datas, em ISO.

export type CartaoDaTela = {
  id: string;
  nome: string;
  bandeira: string;
  ultimosDigitos: string | null;
  diaFechamento: number;
  diaVencimento: number;
  limite: string | null;
  ativo: boolean;
  totalFaturas: number;
  /** O total da fatura aberta mais recente (`fatura_aberta_valor`), ou nulo sem fatura aberta. */
  faturaAbertaValor: string | null;
};

export type TransacaoDaFatura = { historico: string; valor: string; data: string; status: string; desfeita: boolean };

export type FaturaDaTela = {
  id: string;
  cartaoId: string;
  cartaoNome: string;
  cartaoBandeira: string;
  cartaoDigitos: string | null;
  competencia: string;
  dataFechamento: string | null;
  dataVencimento: string | null;
  /** A soma dos lançamentos vivos (o original derivava sempre o total). */
  valorTotal: string;
  status: "aberta" | "fechada" | "paga";
  transacaoId: string | null;
  transacao: TransacaoDaFatura | null;
  observacao: string | null;
  totalLancamentos: number;
};

export type LancamentoDaTela = {
  id: string;
  dataCompra: string;
  descricao: string;
  valor: string;
  contaId: string | null;
  parcelaAtual: number | null;
  parcelaTotal: number | null;
};

export type ListaDeLancamentos = { itens: LancamentoDaTela[]; total: number; valorTotal: string };

export type ResultadoDaImportacaoNaTela = { importados: number; duplicados: number; erros: string[] };

/** Um pagamento possível da fatura: débito vivo do extrato com o valor do total. */
export type PagamentoPossivel = { id: string; data: string; historico: string; valor: string; status: string; agencia: string };

export const NOMES_DAS_BANDEIRAS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  elo: "Elo",
  amex: "American Express",
  hipercard: "Hipercard",
  outros: "Outra",
};

export const NOMES_DOS_STATUS: Record<string, string> = { aberta: "Aberta", fechada: "Fechada", paga: "Paga" };

export const NOMES_DOS_DOCUMENTOS: Record<string, string> = {
  processando: "Lendo…",
  revisar: "Aguardando revisão",
  falhou: "Leitura falhou",
  principal: "Fonte principal",
  complementar: "Complementar",
};

/** "2026-04" → "abril de 2026". */
export function nomeDaCompetencia(competencia: string): string {
  const [a, m] = competencia.split("-").map(Number);
  if (!a || !m || m < 1 || m > 12) return competencia;
  return `${MESES[m - 1]} de ${a}`;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// ─── Contas da tela (dinheiro em centavos, sem ponto flutuante) ───────────────

/**
 * O valor digitado ("1.234,56", "1234,56", "1234.56", "R$ 10") em centavos, ou `null` quando não é um
 * valor com até duas casas. Negativo também é `null`: nenhum valor da tela dos cartões é negativo.
 */
export function centavosDigitados(texto: string): bigint | null {
  let t = texto.trim().replace(/^R\$\s*/, "");
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t) || /^\d+,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  return BigInt(m[1]) * BigInt(100) + BigInt((m[2] ?? "").padEnd(2, "0") || "0");
}

/** Centavos → o texto do `Decimal` com duas casas ("1234.56"), que o servidor e `moeda` leem. */
export function textoDeCentavos(c: bigint): string {
  const negativo = c < BigInt(0);
  const a = negativo ? -c : c;
  const cem = BigInt(100);
  return `${negativo ? "-" : ""}${(a / cem).toString()}.${(a % cem).toString().padStart(2, "0")}`;
}

/** O valor do servidor ("1500.00", "20.5", "1E+2") para o campo ("1500,00"); o que não é decimal simples fica como veio. */
export function valorParaCampo(v: string | null | undefined): string {
  if (!v) return "";
  return /^\d+(\.\d+)?$/.test(v) ? v.replace(".", ",") : v;
}

/** A soma dos valores (texto do servidor ou digitado), em centavos; o que não é valor conta como `null`. */
export function somaEmCentavos(valores: readonly string[]): bigint | null {
  let total = BigInt(0);
  for (const v of valores) {
    const c = centavosDigitados(v);
    if (c === null) return null;
    total += c;
  }
  return total;
}

/** Um componente da distribuição como a tela o edita e como o servidor o guarda. */
export type ParteDaTela = { conta_id: string; historico: string; valor: string };

/** O que falta para a divisão de um gasto valer: conta, histórico (2 a 500), valor e o total sem passar do gasto. */
export function problemaDaDivisao(partes: readonly ParteDaTela[], valorDoGasto: string): string | null {
  if (!partes.length) return "Inclua ao menos uma parte.";
  for (const [n, p] of partes.entries()) {
    if (!p.conta_id) return `Escolha a conta da parte ${n + 1}.`;
    const h = p.historico.trim();
    if (h.length < 2 || h.length > 500) return `O histórico da parte ${n + 1} precisa ter de 2 a 500 caracteres.`;
    const c = centavosDigitados(p.valor);
    if (c === null || c <= BigInt(0)) return `Informe um valor positivo, com até duas casas, na parte ${n + 1}.`;
  }
  const soma = somaEmCentavos(partes.map((p) => p.valor))!;
  const limite = centavosDigitados(valorDoGasto);
  if (limite !== null && soma > limite) return "As partes passam do valor do gasto.";
  return null;
}

/** As partes com o valor no formato do servidor ("1234.56"). */
export const partesParaEnviar = (partes: readonly ParteDaTela[]): ParteDaTela[] =>
  partes.map((p) => ({ conta_id: p.conta_id, historico: p.historico.trim(), valor: textoDeCentavos(centavosDigitados(p.valor) ?? BigInt(0)) }));

/** Um item do rascunho da leitura (a revisão do documento). */
export type ItemDoRascunho = { data: string; descricao: string; valor: string; referencia?: string };

/** O rascunho lido (`resultado` do documento), com as chaves do original. */
export type RascunhoDaLeitura = {
  itens?: ItemDoRascunho[];
  total?: string | null;
  pendencias?: string[];
  pagamentos_anteriores?: string[];
  metodo?: string;
};

/** O `resultado` do documento como rascunho (o que não for objeto vira vazio). */
export function rascunhoDe(resultado: unknown): RascunhoDaLeitura {
  return resultado && typeof resultado === "object" && !Array.isArray(resultado) ? (resultado as RascunhoDaLeitura) : {};
}

/** Os itens revisados batem com o total declarado? (a conferência que o servidor refaz ao confirmar) */
export function itensFecham(itens: readonly ItemDoRascunho[], total: string): boolean {
  const soma = somaEmCentavos(itens.map((i) => i.valor));
  const t = centavosDigitados(total);
  return soma !== null && t !== null && itens.length > 0 && soma === t;
}

/** Os itens no formato do servidor: valor com duas casas, sem espaços na descrição nas pontas. */
export const itensParaEnviar = (itens: readonly ItemDoRascunho[]) =>
  itens.map((i, n) => {
    const c = centavosDigitados(i.valor);
    return { data: i.data, descricao: i.descricao.trim(), valor: c === null ? i.valor : textoDeCentavos(c), referencia: (i.referencia ?? String(n + 1)).slice(0, 100) };
  });
