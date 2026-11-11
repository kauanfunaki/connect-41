// Os arquivos anexados a um fluxo (10/11/2026, pedido do Kauan): o PDF que o
// setor exportou de outra ferramenta, uma imagem do desenho antigo, o .drawio.
// Puro — a rota de envio e a de leitura (src/app/api/fluxos/anexos) usam isto.
//
// Moram em `storage/fluxos/<tenantId>/<uuid>.<ext>`, dentro de `/app/storage`,
// a pasta que tem volume no EasyPanel desde 25/09/2026 (uma pasta nova em
// `public/uploads` precisaria de volume próprio, e sem ele some a cada deploy —
// como a Academia faz).
//
// O tipo é conferido pelos bytes (o que o navegador declara é o que quem
// mandou disse): PDF, PNG, JPG e WEBP pela assinatura; o .drawio é XML em
// texto, e só passa se a raiz for `<mxfile>`.

import { tipoDaImagem } from "@/lib/academia/imagens";

export const TAMANHO_MAXIMO_DO_ANEXO = 10 * 1024 * 1024;
/** Teto por fluxo: anexo é apoio do desenho, e não um repositório de arquivos. */
export const ANEXOS_POR_FLUXO = 30;
export const ACCEPT_DOS_ANEXOS = ".pdf,.png,.jpg,.jpeg,.webp,.drawio,application/pdf,image/png,image/jpeg,image/webp";

export type TipoDoAnexo = {
  mime: "application/pdf" | "image/png" | "image/jpeg" | "image/webp" | "application/vnd.jgraph.mxfile";
  ext: "pdf" | "png" | "jpg" | "webp" | "drawio";
  /** Imagem e PDF abrem no navegador; o .drawio só baixa. */
  previa: boolean;
};

const comecaCom = (b: Uint8Array, assinatura: number[]) => b.length >= assinatura.length && assinatura.every((x, i) => b[i] === x);

/** A raiz do XML é `<mxfile`? Pula o BOM, a declaração `<?xml ?>` e comentários. */
export function ehDesenhoDoDrawio(bytes: Uint8Array): boolean {
  // Texto de verdade: um NUL no começo é binário com extensão trocada.
  const inicio = bytes.subarray(0, 4096);
  if (inicio.includes(0)) return false;
  let texto = new TextDecoder("utf-8", { fatal: false }).decode(inicio);
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);
  texto = texto.trimStart();
  if (texto.startsWith("<?xml")) {
    const fim = texto.indexOf("?>");
    if (fim < 0) return false;
    texto = texto.slice(fim + 2).trimStart();
  }
  while (texto.startsWith("<!--")) {
    const fim = texto.indexOf("-->");
    if (fim < 0) return false;
    texto = texto.slice(fim + 3).trimStart();
  }
  return /^<mxfile[\s>/]/.test(texto);
}

/** O tipo real do anexo, ou `null` quando não é um dos aceitos. O nome só decide o .drawio. */
export function tipoDoAnexo(bytes: Uint8Array, nomeOriginal: string): TipoDoAnexo | null {
  if (comecaCom(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: "application/pdf", ext: "pdf", previa: true }; // %PDF-
  const imagem = tipoDaImagem(bytes);
  if (imagem) return { mime: imagem.mime, ext: imagem.ext, previa: true };
  if (/\.drawio$/i.test(nomeOriginal.trim()) && ehDesenhoDoDrawio(bytes)) return { mime: "application/vnd.jgraph.mxfile", ext: "drawio", previa: false };
  return null;
}

/** O nome que aparece na lista: sem pasta, sem caractere de controle, até 200 letras (a extensão fica). */
export function nomeDoAnexo(nomeOriginal: string, ext: TipoDoAnexo["ext"]): string {
  const semPasta = nomeOriginal.split(/[\\/]/).pop() ?? "";
  const limpo = semPasta.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  const base = limpo.replace(/\.[^.]*$/, "") || "arquivo";
  const sufixo = `.${ext === "jpg" && /\.jpeg$/i.test(limpo) ? "jpeg" : ext}`;
  return `${base.slice(0, 200 - sufixo.length)}${sufixo}`;
}

const GUARDADO = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(pdf|png|jpg|webp|drawio)$/;

/** O nome gravado no disco é um uuid com a extensão: nada que venha de fora vira caminho. */
export const ehArquivoGuardado = (nome: string) => GUARDADO.test(nome);

/**
 * `Content-Disposition` com acento: `filename` em ASCII para quem não entende o
 * resto e `filename*` (RFC 5987/6266) em UTF-8. Abrir no navegador (`inline`)
 * só para imagem e PDF; o .drawio sempre baixa.
 */
export function disposicaoDoAnexo(nome: string, inline: boolean): string {
  const ascii = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\%]/g, "_");
  const utf8 = encodeURIComponent(nome).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

/** "340 KB", "1,2 MB". */
export function tamanhoLegivel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
