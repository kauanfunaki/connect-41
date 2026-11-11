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

/** Uma lista de arquivos com título; vazia diz "Nenhum.". */
export function ListaDeArquivos({ titulo, children, vazia, esmaecida = false }: { titulo: string; children: React.ReactNode; vazia: boolean; esmaecida?: boolean }) {
  return (
    <div className={esmaecida ? "opacity-70" : undefined}>
      <p className="font-semibold text-fg">{titulo}</p>
      {vazia ? <p className="text-fg-muted">Nenhum.</p> : <ul className="mt-1 space-y-1">{children}</ul>}
    </div>
  );
}
