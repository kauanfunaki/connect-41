// Anexo no chat de IA — só para a pergunta (02/10/2026, decisão do Kauan).
//
// O arquivo vai junto desta pergunta ao provedor e NÃO fica guardado: nada vai
// para o disco (sem volume novo no EasyPanel), e a conversa registra só o nome
// ("📎 extrato.pdf"). Nas perguntas seguintes ele não vai mais — a tela avisa.
//
// PDF e imagem viajam como estão (bloco de documento/imagem do provedor, como
// o currículo da triagem). Planilha vira tabela em texto aqui.

import ExcelJS from "exceljs";
import { MAX_ANEXOS, MAX_BYTES_DOS_ANEXOS, MAX_PAGINAS_DO_PDF, tipoDoArquivo } from "./anexos-regras";

export type AnexoDaPergunta =
  | { nome: string; tipo: "pdf"; base64: string }
  | { nome: string; tipo: "imagem"; mime: "image/png" | "image/jpeg"; base64: string }
  | { nome: string; tipo: "texto"; texto: string };

export { ACEITA_NO_CAMPO, MAX_ANEXOS, MAX_BYTES_DOS_ANEXOS, MAX_PAGINAS_DO_PDF, linhaDosAnexos, tipoDoArquivo } from "./anexos-regras";

/** Linhas e caracteres de planilha que vão ao modelo. */
const MAX_LINHAS_DA_PLANILHA = 300;
const MAX_CARACTERES_DA_PLANILHA = 20_000;

type Bruto = { nome: string; mime: string; bytes: Uint8Array };

/** Páginas de um PDF, contadas pelo objeto /Page — basta para o teto. */
export function paginasDoPdf(bytes: Uint8Array): number {
  const texto = Buffer.from(bytes).toString("latin1");
  return (texto.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

/** Os anexos aceitos, ou o motivo da recusa (a pergunta não sai). */
export async function lerAnexos(brutos: Bruto[]): Promise<{ anexos: AnexoDaPergunta[] } | { erro: string }> {
  if (brutos.length > MAX_ANEXOS) return { erro: `Até ${MAX_ANEXOS} arquivos por pergunta.` };
  const total = brutos.reduce((s, b) => s + b.bytes.length, 0);
  if (total > MAX_BYTES_DOS_ANEXOS) return { erro: "Os arquivos passam de 10 MB juntos." };

  const anexos: AnexoDaPergunta[] = [];
  for (const b of brutos) {
    const nome = b.nome.replace(/[\r\n]/g, " ").slice(0, 120) || "arquivo";
    const tipo = tipoDoArquivo(nome, b.mime);
    if (!tipo) return { erro: `"${nome}" não é PDF, imagem (PNG/JPG) ou planilha (XLSX/CSV).` };
    if (tipo === "pdf") {
      const paginas = paginasDoPdf(b.bytes);
      if (paginas > MAX_PAGINAS_DO_PDF) return { erro: `"${nome}" tem ${paginas} páginas — o limite é ${MAX_PAGINAS_DO_PDF}.` };
      anexos.push({ nome, tipo: "pdf", base64: Buffer.from(b.bytes).toString("base64") });
    } else if (tipo === "png" || tipo === "jpeg") {
      anexos.push({ nome, tipo: "imagem", mime: tipo === "png" ? "image/png" : "image/jpeg", base64: Buffer.from(b.bytes).toString("base64") });
    } else if (tipo === "csv") {
      anexos.push({ nome, tipo: "texto", texto: limitar(Buffer.from(b.bytes).toString("utf8")) });
    } else {
      const texto = await planilhaComoTexto(b.bytes).catch(() => null);
      if (texto === null) return { erro: `Não consegui ler a planilha "${nome}".` };
      anexos.push({ nome, tipo: "texto", texto });
    }
  }
  return { anexos };
}

/** Corta no teto de linhas e caracteres — e avisa o modelo que cortou. */
function limitar(texto: string): string {
  const todas = texto.split(/\r?\n/);
  let saida = todas.slice(0, MAX_LINHAS_DA_PLANILHA).join("\n");
  let cortou = todas.length > MAX_LINHAS_DA_PLANILHA;
  if (saida.length > MAX_CARACTERES_DA_PLANILHA) {
    saida = saida.slice(0, MAX_CARACTERES_DA_PLANILHA);
    cortou = true;
  }
  return cortou ? `${saida}\n[…cortado — o arquivo é maior que isto]` : saida;
}

/** Cada aba como linhas separadas por ";", com o nome da aba em cima. */
export async function planilhaComoTexto(bytes: Uint8Array): Promise<string> {
  const livro = new ExcelJS.Workbook();
  await livro.xlsx.load(Buffer.from(bytes) as unknown as ArrayBuffer);
  const partes: string[] = [];
  livro.eachSheet((aba) => {
    const linhas: string[] = [];
    aba.eachRow({ includeEmpty: false }, (linha) => {
      if (linhas.length >= MAX_LINHAS_DA_PLANILHA) return;
      const valores = (linha.values as unknown[]).slice(1).map(valorDaCelula);
      linhas.push(valores.join(";"));
    });
    partes.push(`# ${aba.name}\n${linhas.join("\n")}`);
  });
  return limitar(partes.join("\n\n"));
}

function valorDaCelula(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] };
    if (o.result !== undefined) return valorDaCelula(o.result);
    if (typeof o.text === "string") return o.text;
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("");
    return "";
  }
  return String(v).replace(/[;\r\n]+/g, " ");
}
