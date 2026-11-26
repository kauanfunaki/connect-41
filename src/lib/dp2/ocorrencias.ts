// Ocorrências do contrato: advertência e suspensão (25/11/2026,
// funcionalidade-763, entrega 1).
//
// O DP registra a advertência ou a suspensão disciplinar na ficha do
// colaborador, imprime o documento para assinatura e, na suspensão, os dias
// saem do salário do mês (CLT art. 474: no máximo 30 dias seguidos).
//
// Puro, sem banco (o PDF sai em memória).

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export type TipoDeOcorrencia = "ADVERTENCIA" | "SUSPENSAO";
export const NOME_DA_OCORRENCIA: Record<TipoDeOcorrencia, string> = { ADVERTENCIA: "Advertência", SUSPENSAO: "Suspensão" };

export type Ocorrencia = { tipo: TipoDeOcorrencia; data: string; dias: number; motivo: string };

const ehData = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const br = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export function lerOcorrencia(e: { tipo: string; data: string; dias: string; motivo: string }): { ok: true; ocorrencia: Ocorrencia } | { ok: false; erro: string } {
  const tipo = e.tipo === "SUSPENSAO" ? "SUSPENSAO" : e.tipo === "ADVERTENCIA" ? "ADVERTENCIA" : null;
  if (!tipo) return { ok: false, erro: "Escolha advertência ou suspensão." };
  if (!ehData(e.data)) return { ok: false, erro: tipo === "SUSPENSAO" ? "Informe o primeiro dia da suspensão." : "Informe a data da advertência." };
  const motivo = e.motivo.trim();
  if (motivo.length < 10) return { ok: false, erro: "Descreva o motivo (o fato e quando aconteceu): ele vai no documento." };
  let dias = 0;
  if (tipo === "SUSPENSAO") {
    dias = Number(e.dias);
    if (!Number.isInteger(dias) || dias < 1) return { ok: false, erro: "Informe os dias de suspensão." };
    if (dias > 30) return { ok: false, erro: "A suspensão passa de 30 dias seguidos: é rescisão por justa causa (CLT art. 474)." };
  }
  return { ok: true, ocorrencia: { tipo, data: e.data, dias, motivo: motivo.slice(0, 2000) } };
}

/** O último dia da suspensão ("AAAA-MM-DD"). */
export function fimDaSuspensao(o: Pick<Ocorrencia, "data" | "dias">): string {
  const d = new Date(`${o.data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.max(1, o.dias) - 1);
  return d.toISOString().slice(0, 10);
}

/** Os dias de suspensão que caem no mês (corridos), somados; no mês comercial, no máximo 30. */
export function diasDeSuspensaoNoMes(ocorrencias: readonly Pick<Ocorrencia, "tipo" | "data" | "dias">[], ano: number, mes: number): number {
  const inicioDoMes = Date.UTC(ano, mes - 1, 1);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const fimDoMes = Date.UTC(ano, mes - 1, ultimo);
  let dias = 0;
  for (const o of ocorrencias) {
    if (o.tipo !== "SUSPENSAO" || o.dias <= 0) continue;
    const ini = Date.UTC(Number(o.data.slice(0, 4)), Number(o.data.slice(5, 7)) - 1, Number(o.data.slice(8, 10)));
    const fim = ini + (o.dias - 1) * 86_400_000;
    const de = Math.max(ini, inicioDoMes);
    const ate = Math.min(fim, fimDoMes);
    if (ate >= de) dias += Math.round((ate - de) / 86_400_000) + 1;
  }
  return Math.min(30, dias);
}

/** O texto do documento, para a tela e para o PDF. */
export function textoDoDocumento(o: Ocorrencia, p: { colaborador: string; empresa: string; cidade?: string | null }): string[] {
  const abertura =
    o.tipo === "ADVERTENCIA"
      ? `Pela presente, fica ${p.colaborador} advertido(a) formalmente pelo motivo descrito abaixo, ocorrido no exercício de suas funções.`
      : `Pela presente, fica ${p.colaborador} suspenso(a) de suas funções por ${o.dias} dia(s), de ${br(o.data)} a ${br(fimDaSuspensao(o))}, devendo retornar ao trabalho no dia seguinte, pelo motivo descrito abaixo. Os dias da suspensão não serão remunerados.`;
  return [
    abertura,
    `Motivo: ${o.motivo}`,
    "Esclarecemos que a repetição de faltas desta natureza poderá levar à aplicação de penalidades mais severas, inclusive à rescisão do contrato de trabalho por justa causa, nos termos do art. 482 da CLT.",
    `${p.cidade ? `${p.cidade}, ` : ""}${br(o.data)}.`,
  ];
}

/** Helvetica padrão só cobre WinAnsi: troca o que ela não desenha. */
const limpo = (t: string) => t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/[^\x20-\x7E -ÿ]/g, "");

/** O documento em PDF (A4), com os campos de assinatura do empregador, do colaborador e de duas testemunhas. */
export async function pdfDaOcorrencia(o: Ocorrencia, p: { colaborador: string; cpf: string | null; empresa: string; documentoDaEmpresa: string | null; cidade?: string | null }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const m = 56;
  const largura = page.getWidth() - 2 * m;
  let y = page.getHeight() - m;
  const cor = rgb(0.08, 0.1, 0.16);
  const escrever = (t: string, tamanho = 11, fonte = normal) => {
    // Quebra em linhas que cabem na largura.
    const palavras = limpo(t).split(/\s+/);
    let linha = "";
    for (const w of palavras) {
      const tenta = linha ? `${linha} ${w}` : w;
      if (fonte.widthOfTextAtSize(tenta, tamanho) > largura && linha) {
        page.drawText(linha, { x: m, y, size: tamanho, font: fonte, color: cor });
        y -= tamanho + 5;
        linha = w;
      } else linha = tenta;
    }
    if (linha) {
      page.drawText(linha, { x: m, y, size: tamanho, font: fonte, color: cor });
      y -= tamanho + 5;
    }
  };
  escrever(o.tipo === "ADVERTENCIA" ? "ADVERTÊNCIA DISCIPLINAR" : "SUSPENSÃO DISCIPLINAR", 15, negrito);
  y -= 6;
  escrever(`${p.empresa}${p.documentoDaEmpresa ? ` · CNPJ/CPF ${p.documentoDaEmpresa}` : ""}`, 10);
  escrever(`Colaborador(a): ${p.colaborador}${p.cpf ? ` · CPF ${p.cpf}` : ""}`, 10);
  y -= 14;
  for (const par of textoDoDocumento(o, p)) {
    escrever(par);
    y -= 8;
  }
  y -= 40;
  const assinatura = (rotulo: string, x: number) => {
    page.drawLine({ start: { x, y }, end: { x: x + 210, y }, thickness: 0.6, color: cor });
    page.drawText(limpo(rotulo), { x, y: y - 13, size: 9, font: normal, color: cor });
  };
  assinatura("Empregador", m);
  assinatura("Colaborador(a) - ciente", m + 260);
  y -= 70;
  assinatura("Testemunha 1 (nome e CPF)", m);
  assinatura("Testemunha 2 (nome e CPF)", m + 260);
  return pdf.save();
}
