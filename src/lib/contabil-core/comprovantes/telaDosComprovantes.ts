// Comprovantes de pagamento na tela (Bloco C, Fase C2, 19/11/2026): os tipos que a API devolve e o que a
// aba "Comprovantes" calcula sem servidor. Puro: serve ao servidor e ao navegador.

/** O resumo da transação ligada, como a lista do original trazia (`transacao_descricao`, `_valor`, `_dc`). */
export type TransacaoDoComprovante = { historico: string; valor: string; dc: string; data: string; desfeita: boolean };

/** Um comprovante como a tela o mostra (`ComprovanteResponse`). Dinheiro em texto, com as 2 casas. */
export type ComprovanteDaTela = {
  id: string;
  agenciaId: string | null;
  transacaoId: string | null;
  transacao: TransacaoDoComprovante | null;
  favorecido: string | null;
  cpfCnpj: string | null;
  dataPagamento: string | null;
  dataVencimento: string | null;
  valorDocumento: string | null;
  valorPago: string;
  juros: string;
  multa: string;
  desconto: string;
  observacao: string | null;
  arquivoNome: string | null;
  temArquivo: boolean;
};

export type ListaDeComprovantes = { itens: ComprovanteDaTela[]; total: number; pagina: number; porPagina: number };

/** O que a leitura do arquivo devolve para pré-preencher o formulário (`ComprovanteExtracaoResponse`). */
export type ExtracaoDoComprovante = {
  favorecido: string | null;
  cpfCnpj: string | null;
  dataPagamento: string | null;
  dataVencimento: string | null;
  valorDocumento: string | null;
  valorPago: string | null;
  juros: string | null;
  multa: string | null;
  desconto: string | null;
  confianca: "regex" | "ia";
};

export const COMPROVANTES_POR_PAGINA = 20;

export const ACEITA = ".pdf,.PDF,.png,.PNG,.jpg,.JPG,.jpeg,.JPEG";
const EXTENSAO = /\.(pdf|png|jpe?g)$/i;

/** Os arquivos soltos de uma vez: os que o comprovante aceita e quantos ficaram de fora. */
export function separarArquivos<T extends { name: string }>(arquivos: readonly T[]): { validos: T[]; ignorados: number } {
  const validos = arquivos.filter((a) => EXTENSAO.test(a.name));
  return { validos, ignorados: arquivos.length - validos.length };
}

/** As recusas em que o ARQUIVO é o problema: preencher à mão não resolve (e, na nota fiscal, é o erro). */
export const ERROS_QUE_PULAM_O_ARQUIVO = new Set(["DOCUMENTO_NAO_E_COMPROVANTE", "COMPROVANTE_JA_IMPORTADO"]);

/** Os filtros da tela (o original só tinha o status). */
export type FiltrosDaTela = { status: "" | "associado" | "nao_associado" };

export function consultaDaLista(empresaId: string, f: FiltrosDaTela, pagina: number): URLSearchParams {
  const q = new URLSearchParams({ empresa: empresaId, pagina: String(pagina), porPagina: String(COMPROVANTES_POR_PAGINA) });
  if (f.status) q.set("status", f.status);
  return q;
}

/** "1.234,56" ou "1234.56" digitado → "1234.56"; o resto vai como veio (o servidor recusa com frase). */
export function valorDigitado(texto: string): string {
  const t = texto.trim().replace(/^R\$\s*/, "");
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t) || /^-?\d+,\d+$/.test(t)) return t.replace(/\./g, "").replace(",", ".");
  return t;
}

/** O dia digitado ("AAAA-MM-DD") → a meia-noite UTC, como o leitor grava a data do comprovante. */
export const diaDigitado = (dia: string) => `${dia}T00:00:00.000Z`;

/** O dia de um instante gravado, como o formulário o mostra (a data do comprovante é a meia-noite UTC). */
export const diaDoInstante = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/** O valor do Python ("1500.00", "1E+3") para o campo do formulário ("1500,00"); não finito fica vazio. */
export function valorParaCampo(v: string | null): string {
  if (v === null) return "";
  if (!/^-?\d+(\.\d+)?$/.test(v)) {
    const n = Number(v);
    return Number.isFinite(n) ? String(n).replace(".", ",") : "";
  }
  return v.replace(".", ",");
}

/** O que o diálogo de exclusão diz quando o comprovante está ligado a uma transação. */
export const textoDaExclusao = (c: Pick<ComprovanteDaTela, "transacaoId">) =>
  c.transacaoId
    ? "Ele está associado a um lançamento do extrato; a associação deixa de valer junto com o comprovante."
    : "O comprovante sai da lista. O arquivo pode ser importado de novo depois.";
