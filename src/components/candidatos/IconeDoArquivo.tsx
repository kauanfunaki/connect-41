// O tipo do arquivo numa etiqueta pequena — "PDF" em vermelho, imagem em azul —,
// para reconhecer o arquivo de relance nas listas da ficha do candidato. Mesma
// convenção de cor do `DocumentsSection` (PDF vermelho é o que todo mundo lê).

const IMAGEM = new Set(["JPG", "JPEG", "PNG", "WEBP", "GIF"]);

export function extensaoDoArquivo(nome: string): string {
  const partes = nome.split(".");
  return partes.length > 1 ? (partes.pop() ?? "").toUpperCase().slice(0, 4) : "";
}

export function IconeDoArquivo({ nome }: { nome: string }) {
  const ext = extensaoDoArquivo(nome);
  const cor =
    ext === "PDF"
      ? "bg-danger/10 text-danger border-danger/20"
      : IMAGEM.has(ext)
        ? "bg-info/10 text-info border-info/20"
        : "bg-surface-2 text-fg-muted border-border";
  return (
    <span
      aria-hidden
      className={`inline-flex h-8 w-9 flex-shrink-0 items-center justify-center rounded-md border text-micro font-bold tracking-wide ${cor}`}
    >
      {ext || "ARQ"}
    </span>
  );
}
