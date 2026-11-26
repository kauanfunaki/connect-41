// Recibo de pagamento a autônomo (RPA) em PDF (26/11/2026, funcionalidade-759,
// entrega 1). O cálculo do contribuinte individual (categoria 701) já sai na
// competência (semVinculo.ts): o serviço, o INSS de 11% e o IRRF. O recibo
// mostra isso, o líquido, a contribuição da empresa (20%) e o campo do ISS,
// que o município cobra à parte (o cálculo não faz).
//
// Puro, sem banco (o PDF sai em memória).

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { r2 } from "@/lib/rescisao/constantes";
import type { LinhaDoHolerite } from "./holeritePdf";

export type DadosDoRpa = {
  empresa: string;
  documentoDaEmpresa: string | null;
  competencia: string;
  autonomo: string;
  cpf: string | null;
  linhas: readonly LinhaDoHolerite[];
  proventos: number;
  descontos: number;
  liquido: number;
  inssEmpresa: number;
};

export type ResumoDoRpa = { servico: number; inss: number; irrf: number; outros: number; liquido: number; inssEmpresa: number };

/** O que vai no recibo: o serviço (proventos), o INSS, o IRRF e os outros descontos. */
export function resumoDoRpa(d: Pick<DadosDoRpa, "linhas" | "proventos" | "liquido" | "inssEmpresa">): ResumoDoRpa {
  const desconto = (re: RegExp) => r2(d.linhas.filter((l) => l.tipo === "DESCONTO" && re.test(l.nome)).reduce((s, l) => s + l.valor, 0));
  const inss = desconto(/inss/i);
  const irrf = desconto(/irrf|imposto de renda/i);
  const todos = r2(d.linhas.filter((l) => l.tipo === "DESCONTO").reduce((s, l) => s + l.valor, 0));
  return { servico: r2(d.proventos), inss, irrf, outros: r2(todos - inss - irrf), liquido: r2(d.liquido), inssEmpresa: r2(d.inssEmpresa) };
}

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const limpo = (t: string) => t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/[^\x20-\x7E -ÿ]/g, "");

export async function pdfDoRpa(d: DadosDoRpa): Promise<Uint8Array> {
  const r = resumoDoRpa(d);
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 420.95]); // meia folha A4, como o RPA de bloco
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const m = 40;
  const w = page.getWidth();
  const cor = rgb(0.08, 0.1, 0.16);
  let y = page.getHeight() - m;
  const texto = (t: string, x: number, tamanho = 10, fonte = normal) => page.drawText(limpo(t), { x, y, size: tamanho, font: fonte, color: cor });
  const valor = (rotulo: string, v: number | null, fonte = normal) => {
    texto(rotulo, m + 8, 10, fonte);
    const s = v === null ? "______________" : REAIS.format(v);
    page.drawText(s, { x: w - m - fonte.widthOfTextAtSize(s, 10), y, size: 10, font: fonte, color: cor });
    y -= 16;
  };
  texto("RECIBO DE PAGAMENTO A AUTÔNOMO (RPA)", m, 14, negrito);
  const comp = `Competência ${d.competencia}`;
  page.drawText(limpo(comp), { x: w - m - normal.widthOfTextAtSize(limpo(comp), 9), y, size: 9, font: normal, color: cor });
  y -= 22;
  texto(`Contratante: ${d.empresa}${d.documentoDaEmpresa ? ` · ${d.documentoDaEmpresa}` : ""}`, m);
  y -= 15;
  texto(`Autônomo(a): ${d.autonomo}${d.cpf ? ` · CPF ${d.cpf}` : ""}`, m);
  y -= 22;
  valor("Valor do serviço prestado", r.servico, negrito);
  valor("(-) INSS do contribuinte individual (11%)", r.inss);
  valor("(-) IRRF", r.irrf);
  if (r.outros > 0) valor("(-) Outros descontos", r.outros);
  valor("(-) ISS (quando o município cobrar)", null);
  page.drawLine({ start: { x: m, y: y + 10 }, end: { x: w - m, y: y + 10 }, thickness: 0.6, color: cor });
  valor("Líquido recebido", r.liquido, negrito);
  y -= 4;
  texto(`Contribuição da empresa (20%, Lei 8.212/1991 art. 22, III): ${REAIS.format(r.inssEmpresa)}`, m, 8);
  y -= 22;
  texto(`Recebi da contratante a importância líquida de ${REAIS.format(r.liquido)} pelos serviços prestados, sem vínculo de emprego.`, m, 9);
  y -= 44;
  page.drawLine({ start: { x: m, y }, end: { x: m + 230, y }, thickness: 0.6, color: cor });
  page.drawText("Local e data", { x: m, y: y - 12, size: 8, font: normal, color: cor });
  page.drawLine({ start: { x: w - m - 230, y }, end: { x: w - m, y }, thickness: 0.6, color: cor });
  page.drawText(limpo("Assinatura do(a) autônomo(a)"), { x: w - m - 230, y: y - 12, size: 8, font: normal, color: cor });
  return pdf.save();
}
