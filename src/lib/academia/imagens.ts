// As imagens das questões de lógica (10/11/2026, pedido do Kauan). Puro.
//
// Moram em `storage/academia/<tenantId>/<uuid>.<ext>` — dentro de `/app/storage`,
// a pasta que tem volume no EasyPanel desde 25/09/2026 (uma pasta nova em
// `public/uploads` precisaria de volume próprio, e sem ele some a cada deploy).
// São servidas por `/api/academia/imagens/<arquivo>`, só para a equipe do
// próprio escritório.
//
// O tipo é conferido pelos bytes (o que o navegador declara é o que quem
// mandou disse), e a extensão gravada sai deles. Mesmos formatos e teto das
// capas do Repositório de manuais: JPG, PNG e WEBP, até 4 MB.

export const TAMANHO_MAXIMO_DA_IMAGEM = 4 * 1024 * 1024;
export const ACCEPT_DAS_IMAGENS = "image/png,image/jpeg,image/webp";

export type TipoDaImagem = { mime: "image/png" | "image/jpeg" | "image/webp"; ext: "png" | "jpg" | "webp" };

const comecaCom = (b: Uint8Array, assinatura: number[], desde = 0) =>
  b.length >= desde + assinatura.length && assinatura.every((x, i) => b[desde + i] === x);

/** O tipo real da imagem, ou `null` quando não é PNG, JPG nem WEBP. */
export function tipoDaImagem(bytes: Uint8Array): TipoDaImagem | null {
  if (comecaCom(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png" };
  if (comecaCom(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  // RIFF....WEBP
  if (comecaCom(bytes, [0x52, 0x49, 0x46, 0x46]) && comecaCom(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return { mime: "image/webp", ext: "webp" };
  return null;
}

const ARQUIVO = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(png|jpg|webp)$/;

/** O nome do arquivo gravado é um uuid com a extensão: nada que venha de fora vira caminho. */
export const ehArquivoDeImagem = (nome: string) => ARQUIVO.test(nome);

export const PREFIXO_DA_URL = "/api/academia/imagens/";
export const urlDaImagem = (arquivo: string) => `${PREFIXO_DA_URL}${arquivo}`;

/** Só aceita no cadastro o endereço que a própria Academia devolveu no envio. */
export function ehUrlDeImagemDaAcademia(url: string): boolean {
  return url.startsWith(PREFIXO_DA_URL) && ehArquivoDeImagem(url.slice(PREFIXO_DA_URL.length));
}

export const MIME_DA_EXTENSAO: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };
