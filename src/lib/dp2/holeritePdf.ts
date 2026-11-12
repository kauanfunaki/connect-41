// O holerite (recibo de pagamento de salário) do DP 2 em PDF (12/11/2026,
// fase 2). Uma página por colaborador, no formato que o DP já usa: empresa e
// competência no alto, a tabela de proventos e descontos, os totais, as bases
// e o campo de assinatura.
//
// Desenhado com o pdf-lib, como o recibo da baixa (A4, Helvetica). Puro: quem
// lê o banco e confere o acesso é a rota de download.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export type LinhaDoHolerite = { codigo: string; nome: string; referencia: string; tipo: "PROVENTO" | "DESCONTO" | "INFORMATIVA"; valor: number };

export type DadosDoHolerite = {
  empresaNome: string;
  empresaDocumento: string | null;
  competencia: string;
  tipo: string;
  colaborador: string;
  cpf: string | null;
  admissao: string | null;
  salarioBase: number;
  linhas: LinhaDoHolerite[];
  proventos: number;
  descontos: number;
  liquido: number;
  baseInss: number;
  baseFgts: number;
  fgts: number;
  baseIrrf: number;
};

const REAIS = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r = (v: number) => REAIS.format(v);

/** Helvetica padrão só cobre WinAnsi: troca o que ela não desenha. */
function texto(t: string): string {
  return t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/[^\x20-\x7E -ÿ]/g, "");
}

function desenharPagina(page: PDFPage, d: DadosDoHolerite, normal: PDFFont, negrito: PDFFont) {
  const { width, height } = page.getSize();
  const m = 40;
  let y = height - m;
  const cinza = rgb(0.4, 0.42, 0.46);
  const linha = (y0: number) => page.drawLine({ start: { x: m, y: y0 }, end: { x: width - m, y: y0 }, thickness: 0.6, color: rgb(0.75, 0.77, 0.8) });
  const escrever = (t: string, x: number, y0: number, tamanho = 9, fonte = normal, cor = rgb(0.08, 0.1, 0.16)) =>
    page.drawText(texto(t), { x, y: y0, size: tamanho, font: fonte, color: cor });
  const aDireita = (t: string, xFim: number, y0: number, tamanho = 9, fonte = normal) => escrever(t, xFim - fonte.widthOfTextAtSize(texto(t), tamanho), y0, tamanho, fonte);

  escrever("Recibo de pagamento de salário", m, y, 14, negrito);
  aDireita(`${d.tipo} · ${d.competencia}`, width - m, y, 10, negrito);
  y -= 18;
  escrever(d.empresaNome, m, y, 10, negrito);
  y -= 13;
  if (d.empresaDocumento) escrever(`CNPJ/CPF ${d.empresaDocumento}`, m, y, 9, normal, cinza);
  y -= 10;
  linha(y);
  y -= 16;
  escrever(d.colaborador, m, y, 11, negrito);
  aDireita(`Salário base ${r(d.salarioBase)}`, width - m, y, 9);
  y -= 13;
  escrever([d.cpf ? `CPF ${d.cpf}` : null, d.admissao ? `Admissão ${d.admissao}` : null].filter(Boolean).join("   ·   "), m, y, 9, normal, cinza);
  y -= 12;
  linha(y);

  // Tabela
  const xCod = m;
  const xNome = m + 40;
  const xRef = width - m - 230;
  const xProv = width - m - 110;
  const xDesc = width - m;
  y -= 14;
  escrever("Cód.", xCod, y, 8, negrito, cinza);
  escrever("Descrição", xNome, y, 8, negrito, cinza);
  escrever("Referência", xRef, y, 8, negrito, cinza);
  aDireita("Proventos", xProv, y, 8, negrito);
  aDireita("Descontos", xDesc, y, 8, negrito);
  y -= 6;
  linha(y);
  for (const l of d.linhas.filter((x) => x.tipo !== "INFORMATIVA")) {
    y -= 14;
    if (y < 170) break;
    escrever(l.codigo, xCod, y);
    escrever(l.nome.slice(0, 48), xNome, y);
    escrever(l.referencia.slice(0, 18), xRef, y);
    if (l.tipo === "PROVENTO") aDireita(r(l.valor), xProv, y);
    else aDireita(r(l.valor), xDesc, y);
  }
  // Os totais logo abaixo das linhas: preso ao rodapé, o holerite curto ficava com meia página em branco.
  y -= 12;
  linha(y);
  y -= 15;
  escrever("Totais", xNome, y, 9, negrito);
  aDireita(r(d.proventos), xProv, y, 9, negrito);
  aDireita(r(d.descontos), xDesc, y, 9, negrito);
  y -= 18;
  escrever("Valor líquido", xNome, y, 11, negrito);
  aDireita(`R$ ${r(d.liquido)}`, xDesc, y, 12, negrito);
  y -= 12;
  linha(y);
  y -= 15;
  const bases = [
    ["Base INSS", d.baseInss],
    ["Base FGTS", d.baseFgts],
    ["FGTS do mês", d.fgts],
    ["Base IRRF", d.baseIrrf],
  ] as const;
  const larg = (width - 2 * m) / bases.length;
  bases.forEach(([rot, v], i) => {
    escrever(rot, m + i * larg, y, 8, normal, cinza);
    escrever(r(v), m + i * larg, y - 12, 9, negrito);
  });
  y -= 50;
  page.drawLine({ start: { x: m, y }, end: { x: m + 220, y }, thickness: 0.6, color: rgb(0.3, 0.3, 0.3) });
  escrever("Declaro ter recebido a importância líquida deste recibo.", m, y - 12, 8, normal, cinza);
  escrever("Data: ____/____/______", width - m - 150, y, 9);
}

export async function pdfDosHolerites(holerites: readonly DadosDoHolerite[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(holerites.length === 1 ? `Holerite ${texto(holerites[0].colaborador)}` : "Holerites");
  doc.setCreator("Connect");
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const h of holerites) desenharPagina(doc.addPage([595.28, 841.89]), h, normal, negrito);
  return doc.save();
}
