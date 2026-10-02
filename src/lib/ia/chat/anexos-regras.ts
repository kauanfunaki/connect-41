// As regras do anexo do chat que valem também no navegador — separadas de
// `anexos.ts`, que lê planilha com o exceljs e só roda no servidor.

export const MAX_ANEXOS = 3;
export const MAX_BYTES_DOS_ANEXOS = 10 * 1024 * 1024;
/** Páginas de PDF por anexo: o custo da chamada cresce com elas. */
export const MAX_PAGINAS_DO_PDF = 30;

export const ACEITA_NO_CAMPO = ".pdf,.png,.jpg,.jpeg,.xlsx,.csv";

export function tipoDoArquivo(nome: string, mime: string): "pdf" | "png" | "jpeg" | "xlsx" | "csv" | null {
  const ext = nome.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf" || mime === "application/pdf") return "pdf";
  if (ext === "png" || mime === "image/png") return "png";
  if (ext === "jpg" || ext === "jpeg" || mime === "image/jpeg") return "jpeg";
  if (ext === "xlsx") return "xlsx";
  if (ext === "csv" || mime === "text/csv") return "csv";
  return null;
}

/** O que a conversa guarda no lugar do arquivo. */
export function linhaDosAnexos(anexos: { nome: string }[]): string {
  return anexos.map((a) => `📎 ${a.nome}`).join(" · ");
}

/** O caminho de volta: a pergunta gravada separada dos nomes dos arquivos. */
export function separarAnexos(texto: string): { texto: string; anexos: string[] } {
  const m = /\n\n(📎 [^\n]*)$/u.exec(texto);
  if (!m) return { texto, anexos: [] };
  return { texto: texto.slice(0, m.index), anexos: m[1].split(" · ").map((n) => n.replace(/^📎 /u, "")) };
}

/** Confere a escolha no navegador, antes de mandar — o servidor confere de novo. */
export function conferirEscolha(arquivos: { name: string; type: string; size: number }[]): string | null {
  if (arquivos.length > MAX_ANEXOS) return `Até ${MAX_ANEXOS} arquivos por pergunta.`;
  if (arquivos.reduce((s, a) => s + a.size, 0) > MAX_BYTES_DOS_ANEXOS) return "Os arquivos passam de 10 MB juntos.";
  const ruim = arquivos.find((a) => !tipoDoArquivo(a.name, a.type));
  return ruim ? `"${ruim.name}" não é PDF, imagem (PNG/JPG) ou planilha (XLSX/CSV).` : null;
}
