import { File, FileImage, FileText, FileType } from "lucide-react";

/** O ícone do arquivo pelo formato (pdf, word, imagem ou outro). */
export function IconeDoArquivo({ formato, ext }: { formato?: string; ext?: string }) {
  const f = (formato ?? ext ?? "").toLowerCase().replace(/^\./, "");
  const classe = "mt-0.5 flex-shrink-0 text-fg-muted";
  if (f === "pdf") return <FileText size={14} className={classe} aria-hidden />;
  if (f === "word" || f === "docx" || f === "doc") return <FileType size={14} className={classe} aria-hidden />;
  if (f === "imagem" || ["jpg", "jpeg", "png", "tif", "tiff", "heic", "bmp", "jfif"].includes(f)) return <FileImage size={14} className={classe} aria-hidden />;
  return <File size={14} className={classe} aria-hidden />;
}

// A `ListaDeArquivos` (título + lista em "·") saiu em 26/11/2026
// (melhoria-813): os arquivos de Contratos e Aditivos vão no painel lateral,
// cada lista na sua seção (`SecaoDoPainel`).
