// Os arquivos do Atendimento (11/11/2026): o que o cliente manda e o que a
// equipe envia, guardados fora de `public/` e servidos só pela rota autenticada.
//
// O tipo é conferido pelos bytes, como no Drive e nos Chamados. Além do que o
// Drive aceita (PDF, imagem, Word, Excel…), entram o áudio do WhatsApp (OGG),
// MP3, MP4 e WebP — o que o cliente costuma mandar por lá.

import { criarArmazenamento, type ValidadorDeArquivo } from "@/lib/financeiro/pendencias/armazenamento";
import { validarArquivoDoDrive } from "@/lib/drive/tipoDoArquivo";

/** O limite de mídia da Meta (16 MB), que vale também para o que a equipe envia. */
export const TAMANHO_MAXIMO_DA_MIDIA = 16 * 1024 * 1024;

const ROTULOS: Record<string, string> = {
  image: "imagem",
  imageMessage: "imagem",
  audio: "áudio",
  audioMessage: "áudio",
  video: "vídeo",
  videoMessage: "vídeo",
  document: "documento",
  documentMessage: "documento",
  documentWithCaptionMessage: "documento",
  sticker: "figurinha",
  stickerMessage: "figurinha",
};

export function rotuloDaMidia(tipo: string): string {
  return ROTULOS[tipo] ?? "arquivo";
}

function ascii(bytes: Uint8Array, de: number, ate: number): string {
  return String.fromCharCode(...bytes.subarray(de, ate));
}

function nomeLimpo(nome: string, ext: string): string {
  const base = (nome.split(/[\\/]/).pop() ?? "").replace(/[\x00-\x1f"<>|*?:]/g, " ").trim().slice(0, 110);
  if (!base) return `arquivo.${ext}`;
  return base.toLowerCase().endsWith(`.${ext}`) ? base : `${base.replace(/\.[^.]{1,5}$/, "")}.${ext}`;
}

/** Mídia de WhatsApp que o Drive não conhece, pelos bytes. */
export function tipoDeMidiaPelosBytes(bytes: Uint8Array): { mime: string; ext: string } | null {
  if (bytes.length < 12) return null;
  if (ascii(bytes, 0, 4) === "OggS") return { mime: "audio/ogg", ext: "ogg" };
  if (ascii(bytes, 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)) return { mime: "audio/mpeg", ext: "mp3" };
  if (ascii(bytes, 4, 8) === "ftyp") {
    const marca = ascii(bytes, 8, 12);
    return marca.startsWith("M4A") ? { mime: "audio/mp4", ext: "m4a" } : { mime: "video/mp4", ext: "mp4" };
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

export const validarMidia: ValidadorDeArquivo = (nome, bytes) => {
  const rotulo = nome.split(/[\\/]/).pop()?.trim().slice(0, 120) || "arquivo";
  if (bytes.length === 0) return { ok: false, erro: `${rotulo}: arquivo vazio.` };
  if (bytes.length > TAMANHO_MAXIMO_DA_MIDIA) return { ok: false, erro: `${rotulo}: acima do limite de 16 MB do WhatsApp.` };
  const midia = tipoDeMidiaPelosBytes(bytes);
  if (midia) return { ok: true, nome: nomeLimpo(nome, midia.ext), tipo: midia };
  // O Drive tem o próprio teto de 10 MB; aqui vale o do WhatsApp.
  const r = validarArquivoDoDrive(nome, bytes.length > 10 * 1024 * 1024 ? bytes.subarray(0, 10 * 1024 * 1024) : bytes);
  if (!r.ok) return { ok: false, erro: `${rotulo}: formato não aceito. Envie PDF, imagem, áudio, vídeo, Word, Excel ou texto.` };
  return { ok: true, nome: r.nome, tipo: r.tipo };
};

export const arquivosDoAtendimento = criarArmazenamento("atendimento", { validar: validarMidia, maximoPorEnvio: 1 });

/** A imagem pode abrir na própria conversa; o resto sai como download. */
export function abreNaTela(mime: string | null): boolean {
  return mime === "image/png" || mime === "image/jpeg" || mime === "image/webp";
}
