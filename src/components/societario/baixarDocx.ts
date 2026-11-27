import { TIPO_DOCX } from "@/lib/societario/modelos/campos";

/** Baixa no navegador o .docx que a Server Action devolveu em base64. */
export function baixarDocx(nome: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: TIPO_DOCX }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
