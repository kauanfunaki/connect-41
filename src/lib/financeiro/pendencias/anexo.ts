// Anexos das pendências: o que entra, conferido pelos bytes. Funções puras.
//
// O tipo declarado pelo navegador é o que quem mandou **disse** que o arquivo
// é — o mesmo raciocínio de `ehPdf` em src/lib/curriculo.ts. O que decide aqui
// é a assinatura no começo do arquivo, e a extensão gravada sai dela, não do
// nome: um `.pdf` que é HTML por dentro não entra.

export const TAMANHO_MAXIMO_DO_ANEXO = 10 * 1024 * 1024;
/** Por mensagem. O corpo da action aceita 10 MB no total, então o teto real costuma ser o tamanho. */
export const MAXIMO_DE_ANEXOS = 5;
/** Para o `accept` do campo — só conveniência de tela; quem decide é `tipoPelosBytes`. */
export const ACCEPT_DOS_ANEXOS = ".pdf,.png,.jpg,.jpeg,.xml";

export type TipoDoAnexo = { mime: string; ext: "pdf" | "png" | "jpg" | "xml" };

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function comecaCom(bytes: Uint8Array, assinatura: number[], deslocamento = 0): boolean {
  if (bytes.length < deslocamento + assinatura.length) return false;
  return assinatura.every((b, i) => bytes[deslocamento + i] === b);
}

function ehEspaco(b: number | undefined): boolean {
  return b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d;
}

function ehLetra(b: number | undefined): boolean {
  return b !== undefined && ((b >= 0x41 && b <= 0x5a) || (b >= 0x61 && b <= 0x7a));
}

/**
 * XML: declaração `<?xml`, ou direto o elemento raiz (há emissor de NF-e que
 * omite a declaração), depois de um BOM UTF-8 e espaços opcionais.
 *
 * HTML fica de fora de propósito, mesmo sendo "quase XML": o anexo é servido
 * como download, mas um HTML aceito como XML é o tipo de arquivo que alguém
 * acaba abrindo no navegador.
 */
function ehXml(bytes: Uint8Array): boolean {
  let i = comecaCom(bytes, [0xef, 0xbb, 0xbf]) ? 3 : 0;
  while (i < bytes.length && i < 1024 && ehEspaco(bytes[i])) i++;
  if (bytes[i] !== 0x3c) return false; // "<"
  const resto = String.fromCharCode(...bytes.subarray(i + 1, i + 6)).toLowerCase();
  if (resto.startsWith("?xml")) return true;
  if (resto.startsWith("html") || resto.startsWith("!")) return false;
  return ehLetra(bytes[i + 1]);
}

/** O tipo real do arquivo, ou `null` quando não é nenhum dos aceitos. */
export function tipoPelosBytes(bytes: Uint8Array): TipoDoAnexo | null {
  if (bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-") {
    return { mime: "application/pdf", ext: "pdf" };
  }
  if (comecaCom(bytes, PNG)) return { mime: "image/png", ext: "png" };
  if (comecaCom(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (ehXml(bytes)) return { mime: "application/xml", ext: "xml" };
  return null;
}

/** Caractere de controle C0, DEL ou C1 — nada disso tem lugar num nome de arquivo. */
function ehControle(codigo: number): boolean {
  return codigo < 0x20 || (codigo >= 0x7f && codigo <= 0x9f);
}

const LIMITE_DO_NOME = 120;

/** O nome como veio, sem caminho, sem controle e sem os caracteres que o Windows recusa. */
function nomeSemCaminhoNemControle(nome: string): string {
  const semCaminho = nome.split(/[\\/]/).pop() ?? "";
  let limpo = "";
  for (const ch of semCaminho) {
    limpo += ehControle(ch.codePointAt(0) ?? 0) ? " " : ch;
  }
  return limpo.replace(/["<>|*?:]/g, " ").replace(/\s+/g, " ").trim().replace(/^\.+/, "").trim();
}

/**
 * O nome que fica gravado e aparece no download.
 *
 * Sem caminho (o Windows manda `C:\...\arquivo.pdf` em navegador antigo, e um
 * nome com `../` não pode sugerir lugar nenhum), sem caracteres de controle, sem
 * ponto no começo. A extensão é a do tipo **conferido**: nome e conteúdo
 * precisam contar a mesma história para quem baixa.
 *
 * Os caracteres de controle são filtrados por código, e não por regex com
 * escapes: é o jeito de este arquivo nunca carregar um byte de controle.
 */
export function sanearNomeDoArquivo(nome: string, ext: TipoDoAnexo["ext"]): string {
  const limpo = nomeSemCaminhoNemControle(nome);

  // Tira a extensão que veio e põe a do conteúdo.
  const base = limpo.replace(/\.[A-Za-z0-9]{1,5}$/, "").trim() || "anexo";
  const sufixo = `.${ext}`;
  const cortado = [...base].slice(0, LIMITE_DO_NOME - sufixo.length).join("").trim();
  return `${cortado || "anexo"}${sufixo}`;
}

export type AnexoValidado = { ok: true; nome: string; tipo: TipoDoAnexo; tamanho: number } | { ok: false; erro: string };

/** Confere um arquivo recebido: tamanho, assinatura e nome. */
export function validarAnexo(nome: string, bytes: Uint8Array): AnexoValidado {
  const rotulo = nomeSemCaminhoNemControle(nome).slice(0, LIMITE_DO_NOME) || "arquivo";
  if (bytes.length === 0) return { ok: false, erro: `${rotulo}: arquivo vazio.` };
  if (bytes.length > TAMANHO_MAXIMO_DO_ANEXO) return { ok: false, erro: `${rotulo}: acima do limite de 10 MB.` };
  const tipo = tipoPelosBytes(bytes);
  if (!tipo) return { ok: false, erro: `${rotulo}: formato não aceito. Envie PDF, PNG, JPG ou XML.` };
  return { ok: true, nome: sanearNomeDoArquivo(nome, tipo.ext), tipo, tamanho: bytes.length };
}
