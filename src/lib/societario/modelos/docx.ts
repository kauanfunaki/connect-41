// O .docx dos modelos do Societário (27/11/2026, funcionalidade-891): conferir o
// que o escritório enviou, saber quais campos ele usa e preencher. O mesmo
// docxtemplater do termo aditivo (src/lib/honorarios/termo/docx.ts): o Word
// parte um "{CAMPO}" em vários pedaços de texto quando alguém edita o modelo, e
// trocar direto no XML deixaria o campo para trás.
//
// A diferença do termo é a lista de sócios: {#SOCIOS}…{/SOCIOS} repete o trecho
// para cada sócio (com `paragraphLoop`, um parágrafo inteiro por sócio).

import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { CAMPOS, NOMES_DOS_CAMPOS, TIPO_DOCX, type DadosDoModelo } from "./campos";

export { TIPO_DOCX };

/** Teto do modelo: um contrato de dez páginas tem poucas centenas de KB. */
export const TAMANHO_MAXIMO_DO_MODELO = 5 * 1024 * 1024;

export type ConferenciaDoModelo = { ok: true; campos: string[]; avisos: string[] } | { ok: false; erro: string };

class ModeloInvalido extends Error {}

function abrir(bytes: Uint8Array): Docxtemplater {
  let zip: PizZip;
  try {
    zip = new PizZip(bytes);
  } catch {
    throw new ModeloInvalido("O arquivo não é um documento do Word (.docx).");
  }
  if (!zip.files["word/document.xml"]) throw new ModeloInvalido("O arquivo não é um documento do Word (.docx).");
  try {
    return new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, errorLogging: false, nullGetter: () => "" });
  } catch (err) {
    throw new ModeloInvalido(mensagemDoErro(err));
  }
}

/** O erro do docxtemplater em português: o campo mal escrito ou a lista sem fechar. */
function mensagemDoErro(err: unknown): string {
  const erros = (err as { properties?: { errors?: { properties?: { xtag?: string; id?: string } }[] } })?.properties?.errors ?? [];
  const lista = erros.find((e) => e.properties?.id === "unclosed_loop" || e.properties?.id === "unopened_loop" || e.properties?.id === "closing_tag_does_not_match_opening_tag");
  if (lista) {
    return `A lista {#${lista.properties?.xtag ?? "SOCIOS"}} não fecha certo. Cada lista abre com {#NOME} e fecha com {/NOME}, no mesmo documento.`;
  }
  const campos = erros.map((e) => e.properties?.xtag).filter((x): x is string => !!x);
  return campos.length > 0
    ? `O modelo tem campo mal escrito: ${[...new Set(campos)].slice(0, 3).join(", ")}. Cada campo vai entre chaves, como {EMPRESA_RAZAO_SOCIAL}.`
    : "O modelo tem um campo mal escrito (chave aberta sem fechar?). Cada campo vai entre chaves, como {EMPRESA_RAZAO_SOCIAL}.";
}

/** Os campos do texto inteiro, sem o "#", o "/" e o "^" das listas. */
function camposDoTexto(texto: string): string[] {
  return [...new Set([...texto.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]!.trim().replace(/^[#/^]/, "").trim()))].filter(Boolean);
}

/**
 * Confere o modelo antes de guardar. Precisa ser um .docx que o docxtemplater
 * abre e ter ao menos um campo do Connect — sem nenhum, ele não preenche nada
 * e o mais provável é que o escritório enviou o arquivo errado. Campo
 * desconhecido vira aviso: sai em branco.
 */
export function conferirModelo(bytes: Uint8Array): ConferenciaDoModelo {
  if (bytes.byteLength === 0) return { ok: false, erro: "O arquivo está vazio." };
  if (bytes.byteLength > TAMANHO_MAXIMO_DO_MODELO) return { ok: false, erro: "O modelo passa de 5 MB." };
  let doc: Docxtemplater;
  try {
    doc = abrir(bytes);
  } catch (err) {
    if (err instanceof ModeloInvalido) return { ok: false, erro: err.message };
    return { ok: false, erro: "O arquivo não é um documento do Word (.docx)." };
  }
  const campos = camposDoTexto(doc.getFullText());
  const conhecidos = campos.filter((c) => NOMES_DOS_CAMPOS.has(c));
  if (conhecidos.length === 0) {
    return { ok: false, erro: "O modelo não tem nenhum campo do Connect. Escreva os campos entre chaves, como {EMPRESA_RAZAO_SOCIAL}; a lista está em “Campos do modelo”." };
  }
  const desconhecidos = campos.filter((c) => !NOMES_DOS_CAMPOS.has(c));
  const avisos = desconhecidos.length > 0 ? [`Estes campos não são do Connect e saem em branco: ${desconhecidos.map((c) => `{${c}}`).join(", ")}.`] : [];
  return { ok: true, campos: conhecidos, avisos };
}

/** Os campos que o modelo guardado usa (para dizer o que vai sair em branco). */
export function camposDoModelo(bytes: Uint8Array): string[] {
  try {
    return camposDoTexto(abrir(bytes).getFullText()).filter((c) => NOMES_DOS_CAMPOS.has(c));
  } catch {
    return [];
  }
}

/** O documento preenchido, pronto para baixar e guardar. */
export function preencherModelo(bytes: Uint8Array, dados: DadosDoModelo): Buffer {
  const doc = abrir(bytes);
  try {
    doc.render(dados);
  } catch (err) {
    throw new ModeloInvalido(mensagemDoErro(err));
  }
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}

export { ModeloInvalido };

// ─── Um .docx feito aqui ────────────────────────────────────────────────────

const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function paragrafo(texto: string, negrito = false): string {
  const rPr = negrito ? "<w:rPr><w:b/></w:rPr>" : "";
  return `<w:p><w:r>${rPr}<w:t xml:space="preserve">${escapar(texto)}</w:t></w:r></w:p>`;
}

/** Um .docx mínimo com um parágrafo por linha ("**" no começo = negrito). Usado no modelo de exemplo e nos testes. */
export function montarDocx(linhas: string[]): Buffer {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  );
  const corpo = linhas.map((l) => (l.startsWith("**") ? paragrafo(l.slice(2), true) : paragrafo(l))).join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo}<w:sectPr/></w:body></w:document>`
  );
  return zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
}

/**
 * O modelo de exemplo para baixar: todos os campos, por grupo, já entre chaves
 * — o escritório copia para o contrato dele os que usa. Ele mesmo é um modelo
 * válido: gerado num processo, mostra o que cada campo traz daquela empresa.
 */
export function modeloDeExemplo(): Buffer {
  const DE_SOCIO = (n: string) => CAMPOS.some((c) => c.nome === n && c.descricao.startsWith("Dentro da lista"));
  const linhas: string[] = [
    "**Campos dos modelos do Societário no Connect",
    "Copie para o seu documento os campos que ele usa, com as chaves. Campo sem dado no cadastro sai em branco.",
  ];
  let grupo = "";
  for (const c of CAMPOS) {
    if (c.nome.startsWith("#") || DE_SOCIO(c.nome)) continue;
    if (c.grupo !== grupo) {
      grupo = c.grupo;
      linhas.push("", `**${grupo}`);
    }
    linhas.push(`${c.descricao}: {${c.nome}}`);
  }
  const deDentro = CAMPOS.filter((c) => DE_SOCIO(c.nome));
  linhas.push(
    "",
    "**Lista dos sócios",
    "O trecho abaixo se repete para cada sócio que está na sociedade: a lista abre com #SOCIOS e fecha com /SOCIOS, entre chaves. Para os que saíram, #SOCIOS_QUE_SAIRAM e /SOCIOS_QUE_SAIRAM.",
    "{#SOCIOS}",
    ...deDentro.map((c) => `${c.descricao.replace(/^Dentro da lista: /, "")}: {${c.nome}}`),
    "",
    "{/SOCIOS}"
  );
  return montarDocx(linhas);
}
