import { criarArmazenamento } from "@/lib/financeiro/pendencias/armazenamento";
import { validarArquivoDoDrive } from "@/lib/drive/tipoDoArquivo";

export { FORMATOS } from "./formatos";
export const anexosDoChamado = criarArmazenamento("helpdesk", {
  maximoPorEnvio: 1,
  validar(nome, bytes) {
    // Vídeo é guardado como evidência, mas não vai para a IA.
    const ext = nome.toLowerCase().split(".").pop();
    const mp4 = ext === "mp4" && bytes.length >= 12 && Buffer.from(bytes.subarray(4, 8)).toString() === "ftyp";
    const webm = ext === "webm" && Buffer.from(bytes.subarray(0, 4)).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    if ((mp4 || webm) && bytes.length <= 10 * 1024 * 1024) return { ok: true as const, nome: nome.split(/[\\/]/).pop()!.slice(0, 120), tipo: { mime: mp4 ? "video/mp4" : "video/webm", ext: ext! } };
    const resultado = validarArquivoDoDrive(nome, bytes);
    if (!resultado.ok) return resultado;
    if (!["pdf", "png", "jpg", "jpeg", "docx", "xlsx", "txt", "csv", "zip"].includes(resultado.tipo.ext)) return { ok: false as const, erro: "Formato não aceito nos chamados." };
    return resultado;
  },
});
