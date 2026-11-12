// O modelo .docx do termo aditivo (funcionalidade-643, 12/11/2026): conferir o
// que o escritório enviou e preencher. Usa o docxtemplater, como o Aditiva
// Pronto: o Word quebra um "{CAMPO}" em vários pedaços de texto quando alguém
// edita o modelo, e trocar o texto direto no XML deixaria o campo para trás.

import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { CAMPOS_DO_MODELO } from "./contratante";

/** Teto do modelo: um termo de duas páginas com o logo tem poucas centenas de KB. */
export const TAMANHO_MAXIMO_DO_MODELO = 5 * 1024 * 1024;

export type ConferenciaDoModelo =
  | { ok: true; avisos: string[] }
  | { ok: false; erro: string };

class ModeloInvalido extends Error {}

function abrir(bytes: Uint8Array): Docxtemplater {
  const zip = new PizZip(bytes);
  if (!zip.files["word/document.xml"]) throw new ModeloInvalido("O arquivo não é um documento do Word (.docx).");
  try {
    return new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, errorLogging: false, nullGetter: () => "" });
  } catch (err) {
    throw new ModeloInvalido(mensagemDoErroDoModelo(err));
  }
}

/** O erro do docxtemplater em português: o campo mal escrito, quando ele diz qual é. */
function mensagemDoErroDoModelo(err: unknown): string {
  const erros = (err as { properties?: { errors?: { properties?: { xtag?: string; explanation?: string } }[] } })?.properties?.errors ?? [];
  const campos = erros.map((e) => e.properties?.xtag).filter((x): x is string => !!x);
  return campos.length > 0
    ? `O modelo tem campo mal escrito: ${[...new Set(campos)].slice(0, 3).join(", ")}. Cada campo vai entre chaves, como {CONTRATANTE_TEXTO}.`
    : "O modelo tem um campo mal escrito (chave aberta sem fechar?). Cada campo vai entre chaves, como {CONTRATANTE_TEXTO}.";
}

/** Os campos que o modelo usa, pelo texto inteiro (o Word pode ter partido o campo em pedaços). */
function camposDoTexto(texto: string): string[] {
  return [...new Set([...texto.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]!.trim()))];
}

/**
 * Confere o modelo antes de guardar. Sem {CONTRATANTE_TEXTO} ele não serve: é
 * o parágrafo que muda de empresa para empresa. Os outros dois campos e
 * qualquer campo desconhecido viram aviso — o desconhecido sai em branco.
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
  if (!campos.includes("CONTRATANTE_TEXTO")) {
    return { ok: false, erro: "O modelo não tem o campo {CONTRATANTE_TEXTO}, onde entra o parágrafo da empresa." };
  }
  const avisos: string[] = [];
  for (const c of CAMPOS_DO_MODELO) if (!campos.includes(c)) avisos.push(`O modelo não tem {${c}}.`);
  const desconhecidos = campos.filter((c) => !(CAMPOS_DO_MODELO as readonly string[]).includes(c));
  if (desconhecidos.length > 0) avisos.push(`Estes campos não são do Connect e saem em branco: ${desconhecidos.map((c) => `{${c}}`).join(", ")}.`);
  return { ok: true, avisos };
}

/** O termo preenchido, pronto para baixar e guardar. */
export function preencherModelo(bytes: Uint8Array, dados: Record<string, string>): Buffer {
  const doc = abrir(bytes);
  doc.render(dados);
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}
