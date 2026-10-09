import { File, FileArchive, FileCode, FileImage, FileSpreadsheet, FileText } from "lucide-react";

const PLANILHA = new Set(["xls", "xlsx", "ods", "csv"]);
const IMAGEM = new Set(["png", "jpg", "jpeg", "gif", "webp"]);
const TEXTO = new Set(["pdf", "doc", "docx", "odt", "txt", "ofx", "ret", "rem"]);

/** O ícone de um arquivo pela extensão, com a cor que o FileDropzone já usa para PDF e planilha. */
export function IconeDoArquivo({ nome, size = 18 }: { nome: string; size?: number }) {
  const ext = nome.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return <FileText size={size} className="text-danger shrink-0" aria-hidden />;
  if (PLANILHA.has(ext)) return <FileSpreadsheet size={size} className="text-success shrink-0" aria-hidden />;
  if (IMAGEM.has(ext)) return <FileImage size={size} className="text-brand shrink-0" aria-hidden />;
  if (ext === "xml") return <FileCode size={size} className="text-warning shrink-0" aria-hidden />;
  if (ext === "zip") return <FileArchive size={size} className="text-fg-muted shrink-0" aria-hidden />;
  if (TEXTO.has(ext)) return <FileText size={size} className="text-fg-secondary shrink-0" aria-hidden />;
  return <File size={size} className="text-fg-muted shrink-0" aria-hidden />;
}
