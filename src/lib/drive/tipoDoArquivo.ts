// O que entra no Drive, conferido pelos bytes. Funções puras.
//
// Mesma regra dos anexos das pendências (src/lib/financeiro/pendencias/anexo.ts):
// o tipo é o que o começo do arquivo diz, não o que o nome ou o navegador
// dizem, e a extensão gravada sai do tipo conferido. A diferença é a lista: o
// Drive guarda o arquivo do dia a dia do escritório — contrato em Word, planilha,
// extrato OFX, arquivo de retorno do banco —, e os anexos só PDF, imagem e XML.
//
// Ficam de fora de propósito: HTML, SVG e tudo que o navegador executaria se
// alguém abrisse direto, além de executável e instalador. O download sai sempre
// como anexo e com `nosniff`; a prévia (inline) só vale para PDF e imagem.

import { sanearNomeDoArquivo, tipoPelosBytes } from "@/lib/financeiro/pendencias/anexo";

/**
 * Por arquivo. O Drive manda um arquivo por requisição; o proxy guarda até
 * 11 MB de corpo (`proxyClientMaxBodySize` em next.config.ts), e o 1 MB a mais
 * é o envelope multipart.
 */
export const TAMANHO_MAXIMO_NO_DRIVE = 10 * 1024 * 1024;

export type TipoNoDrive = { mime: string; ext: string; previa: boolean };

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** Formatos que são um ZIP por dentro; a extensão do nome decide qual deles é. */
const DENTRO_DE_ZIP: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  zip: "application/zip",
};

/** Office antigo (contêiner OLE). Sem extensão conhecida, não entra: OLE pode ser qualquer coisa. */
const DENTRO_DE_OLE: Record<string, string> = {
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  ppt: "application/vnd.ms-powerpoint",
  msg: "application/vnd.ms-outlook",
};

/** Texto puro que o escritório troca com banco, Receita e cliente. */
const TEXTO: Record<string, string> = {
  txt: "text/plain",
  csv: "text/csv",
  ofx: "application/x-ofx",
  ret: "text/plain",
  rem: "text/plain",
};

function comecaCom(bytes: Uint8Array, assinatura: number[]): boolean {
  if (bytes.length < assinatura.length) return false;
  return assinatura.every((b, i) => bytes[i] === b);
}

function extensaoDoNome(nome: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(nome.trim());
  return m ? m[1].toLowerCase() : "";
}

/** Controle que aparece em texto de verdade: tab, quebras de linha, form feed e o EOF do DOS. */
const CONTROLE_DE_TEXTO = new Set([0x09, 0x0a, 0x0c, 0x0d, 0x1a]);

/**
 * Texto: nenhum byte nulo no começo, quase nenhum caractere de controle, e não
 * começa com "<". Começar com "<" é marcação — XML já foi reconhecido antes,
 * então o que sobra aqui é HTML ou SVG, que não entram.
 */
function ehTexto(bytes: Uint8Array): boolean {
  const amostra = bytes.subarray(0, 4096);
  if (amostra.includes(0)) return false;
  let controles = 0;
  for (const b of amostra) if (b < 0x20 && !CONTROLE_DE_TEXTO.has(b)) controles++;
  if (controles > amostra.length / 100) return false;
  let i = comecaCom(amostra, [0xef, 0xbb, 0xbf]) ? 3 : 0;
  while (i < amostra.length && (amostra[i] === 0x20 || amostra[i] === 0x09 || amostra[i] === 0x0a || amostra[i] === 0x0d)) i++;
  return amostra[i] !== 0x3c;
}

/** O tipo real do arquivo, ou `null` quando não é nenhum dos aceitos. */
export function tipoNoDrive(nome: string, bytes: Uint8Array): TipoNoDrive | null {
  const basico = tipoPelosBytes(bytes);
  if (basico) return { mime: basico.mime, ext: basico.ext, previa: basico.ext !== "xml" };

  if (comecaCom(bytes, [0x47, 0x49, 0x46, 0x38])) return { mime: "image/gif", ext: "gif", previa: true };
  if (
    comecaCom(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    return { mime: "image/webp", ext: "webp", previa: true };
  }

  const ext = extensaoDoNome(nome);
  if (comecaCom(bytes, ZIP)) {
    const e = ext in DENTRO_DE_ZIP ? ext : "zip";
    return { mime: DENTRO_DE_ZIP[e], ext: e, previa: false };
  }
  if (comecaCom(bytes, OLE)) {
    return ext in DENTRO_DE_OLE ? { mime: DENTRO_DE_OLE[ext], ext, previa: false } : null;
  }
  if (ehTexto(bytes)) {
    const e = ext in TEXTO ? ext : "txt";
    return { mime: TEXTO[e], ext: e, previa: false };
  }
  return null;
}

/** Para o `accept` do campo — conveniência de tela; quem decide é `tipoNoDrive`. */
export const ACCEPT_DO_DRIVE = [
  ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".xml",
  ...Object.keys(DENTRO_DE_ZIP).map((e) => `.${e}`),
  ...Object.keys(DENTRO_DE_OLE).map((e) => `.${e}`),
  ...Object.keys(TEXTO).map((e) => `.${e}`),
].join(",");

export type ArquivoValidado =
  | { ok: true; nome: string; tipo: TipoNoDrive; tamanho: number }
  | { ok: false; erro: string };

/** Confere um arquivo recebido: tamanho, assinatura e nome. */
export function validarArquivoDoDrive(nome: string, bytes: Uint8Array): ArquivoValidado {
  const rotulo = nome.split(/[\\/]/).pop()?.trim().slice(0, 120) || "arquivo";
  if (bytes.length === 0) return { ok: false, erro: `${rotulo}: arquivo vazio.` };
  if (bytes.length > TAMANHO_MAXIMO_NO_DRIVE) return { ok: false, erro: `${rotulo}: acima do limite de 10 MB.` };
  const tipo = tipoNoDrive(nome, bytes);
  if (!tipo) {
    return {
      ok: false,
      erro: `${rotulo}: formato não aceito. Envie PDF, imagem, XML, Word, Excel, ZIP ou texto (TXT, CSV, OFX).`,
    };
  }
  return { ok: true, nome: sanearNomeDoArquivo(nome, tipo.ext), tipo, tamanho: bytes.length };
}
