// Anexos de uma chamada estruturada como blocos do Anthropic (22/10/2026).
//
// A triagem de chamados nasceu só na OpenAI, que recebe PDF, imagem, DOCX,
// XLSX, TXT e CSV como `input_file` e extrai o texto do lado de lá. O
// Anthropic aceita, de arquivo, só PDF, imagem e texto puro — então DOCX e
// planilha viram texto aqui, antes de sair. É a mesma ideia do anexo do chat
// (src/lib/ia/chat/anexos.ts), com os tetos que a triagem já declara ao
// modelo: DOCX só texto, planilha até mil linhas por aba.
//
// Arquivo que não dá para converter não derruba a chamada: vai um aviso no
// lugar dele, e o modelo marca o anexo como ilegível em vez de presumir o
// conteúdo.
import type Anthropic from "@anthropic-ai/sdk";
import { strFromU8, unzipSync } from "fflate";
import { planilhaComoTexto } from "@/lib/ia/chat/anexos";

export type AnexoEstruturado = { nome: string; mime: string; base64: string; imagem?: boolean };

/** Linhas por aba que vão ao modelo — o que a triagem declara em `limitacoes`. */
export const MAX_LINHAS_POR_ABA = 1_000;
/** Teto de caracteres de um anexo convertido em texto. */
export const MAX_CARACTERES_DO_TEXTO = 200_000;

const IMAGENS = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

function extensao(nome: string): string {
  return nome.toLowerCase().split(".").pop() ?? "";
}

function cortar(texto: string): string {
  return texto.length > MAX_CARACTERES_DO_TEXTO
    ? `${texto.slice(0, MAX_CARACTERES_DO_TEXTO)}\n[…cortado — o arquivo é maior que isto]`
    : texto;
}

/** O texto de um DOCX: os parágrafos de `word/document.xml`, sem imagens. */
export function textoDoDocx(bytes: Uint8Array): string {
  const arquivos = unzipSync(bytes, { filter: (f) => f.name === "word/document.xml" });
  const xml = arquivos["word/document.xml"];
  if (!xml) throw new Error("DOCX sem word/document.xml");
  return strFromU8(xml)
    .replace(/<w:tab\/>/g, "\t")
    .replace(/<w:br\/>|<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function documentoDeTexto(nome: string, texto: string): Anthropic.ContentBlockParam {
  return { type: "document", title: nome, source: { type: "text", media_type: "text/plain", data: cortar(texto) || "(arquivo sem texto)" } };
}

function aviso(nome: string): Anthropic.ContentBlockParam {
  return { type: "text", text: `[Arquivo "${nome}": o conteúdo não pôde ser extraído. Trate-o como ilegível e não presuma o que ele contém.]` };
}

/** Um anexo como bloco(s) do Anthropic. Imagem vai com o nome logo antes. */
export async function blocosAnthropicDoAnexo(a: AnexoEstruturado): Promise<Anthropic.ContentBlockParam[]> {
  const ext = extensao(a.nome);
  try {
    if (a.imagem || IMAGENS.has(a.mime)) {
      const mime = a.mime === "image/jpg" ? "image/jpeg" : a.mime;
      if (!IMAGENS.has(mime)) return [aviso(a.nome)];
      return [
        { type: "text", text: `Arquivo: ${a.nome}` },
        { type: "image", source: { type: "base64", media_type: mime as "image/png" | "image/jpeg" | "image/gif" | "image/webp", data: a.base64 } },
      ];
    }
    if (a.mime === "application/pdf" || ext === "pdf") {
      return [{ type: "document", title: a.nome, source: { type: "base64", media_type: "application/pdf", data: a.base64 } }];
    }
    const bytes = Buffer.from(a.base64, "base64");
    if (ext === "txt" || ext === "csv" || a.mime.startsWith("text/")) return [documentoDeTexto(a.nome, bytes.toString("utf8"))];
    if (ext === "docx") return [documentoDeTexto(a.nome, textoDoDocx(bytes))];
    if (ext === "xlsx") {
      return [documentoDeTexto(a.nome, await planilhaComoTexto(bytes, { maxLinhas: MAX_LINHAS_POR_ABA, maxCaracteres: MAX_CARACTERES_DO_TEXTO }))];
    }
  } catch {
    // O conteúdo do arquivo e o erro de leitura não vão para o log.
  }
  return [aviso(a.nome)];
}

export async function blocosAnthropicDosAnexos(anexos: AnexoEstruturado[]): Promise<Anthropic.ContentBlockParam[]> {
  return (await Promise.all(anexos.map(blocosAnthropicDoAnexo))).flat();
}
