// Termo de quitação anual de obrigações trabalhistas (25/11/2026,
// funcionalidade-764, entrega 1).
//
// A CLT (art. 507-B) deixa empregado e empregador firmarem, todo ano, perante
// o sindicato da categoria, o termo que quita as obrigações do período. O DP 2
// monta o termo com o que a folha pagou no ano: os totais por rubrica das
// competências fechadas (folha mensal e 13º), o FGTS depositado e os meses
// que entraram, para conferir e assinar com o sindicato.
//
// Puro, sem banco (o PDF sai em memória).

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { r2 } from "@/lib/rescisao/constantes";

export type CompetenciaDoTermo = {
  /** "AAAA-MM". */
  competencia: string;
  tipo: string;
  itens: readonly { codigo: string; nome: string; tipo: string; valor: number }[];
  fgts: number;
};

export type LinhaDoTermo = { codigo: string; nome: string; tipo: string; valor: number };

export type Termo = {
  ano: number;
  meses: string[];
  proventos: LinhaDoTermo[];
  descontos: LinhaDoTermo[];
  totalProventos: number;
  totalDescontos: number;
  liquido: number;
  fgts: number;
};

/** Soma o ano por rubrica, a partir das competências fechadas da pessoa. */
export function montarTermo(ano: number, competencias: readonly CompetenciaDoTermo[]): Termo {
  const por = new Map<string, LinhaDoTermo>();
  const meses = new Set<string>();
  let fgts = 0;
  for (const c of competencias) {
    if (!c.competencia.startsWith(`${ano}-`)) continue;
    meses.add(c.competencia);
    fgts += c.fgts;
    for (const i of c.itens) {
      if (i.tipo !== "PROVENTO" && i.tipo !== "DESCONTO") continue;
      const k = `${i.tipo}|${i.codigo}`;
      const l = por.get(k) ?? { codigo: i.codigo, nome: i.nome, tipo: i.tipo, valor: 0 };
      l.valor = r2(l.valor + i.valor);
      por.set(k, l);
    }
  }
  const ordem = (a: LinhaDoTermo, b: LinhaDoTermo) => a.codigo.localeCompare(b.codigo, "pt-BR", { numeric: true });
  const proventos = [...por.values()].filter((l) => l.tipo === "PROVENTO").sort(ordem);
  const descontos = [...por.values()].filter((l) => l.tipo === "DESCONTO").sort(ordem);
  const totalProventos = r2(proventos.reduce((s, l) => s + l.valor, 0));
  const totalDescontos = r2(descontos.reduce((s, l) => s + l.valor, 0));
  return { ano, meses: [...meses].sort(), proventos, descontos, totalProventos, totalDescontos, liquido: r2(totalProventos - totalDescontos), fgts: r2(fgts) };
}

const REAIS = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const limpo = (t: string) => t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/[^\x20-\x7E -ÿ]/g, "");
const mesBr = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;

/** O termo em PDF (A4): partes, período, os valores pagos e as assinaturas, com o campo do sindicato. */
export async function pdfDoTermo(t: Termo, p: { colaborador: string; cpf: string | null; admissao: string | null; empresa: string; documentoDaEmpresa: string | null; sindicato: string | null }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([595.28, 841.89]);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);
  const negrito = await pdf.embedFont(StandardFonts.HelveticaBold);
  const m = 50;
  const largura = page.getWidth() - 2 * m;
  const cor = rgb(0.08, 0.1, 0.16);
  let y = page.getHeight() - m;
  const novaPaginaSePreciso = (altura: number) => {
    if (y - altura < m) {
      page = pdf.addPage([595.28, 841.89]);
      y = page.getHeight() - m;
    }
  };
  const paragrafo = (texto: string, tamanho = 10, fonte = normal) => {
    let linha = "";
    for (const w of limpo(texto).split(/\s+/)) {
      const tenta = linha ? `${linha} ${w}` : w;
      if (fonte.widthOfTextAtSize(tenta, tamanho) > largura && linha) {
        novaPaginaSePreciso(tamanho + 5);
        page.drawText(linha, { x: m, y, size: tamanho, font: fonte, color: cor });
        y -= tamanho + 5;
        linha = w;
      } else linha = tenta;
    }
    if (linha) {
      novaPaginaSePreciso(tamanho + 5);
      page.drawText(linha, { x: m, y, size: tamanho, font: fonte, color: cor });
      y -= tamanho + 5;
    }
  };
  const linhaDeValor = (rotulo: string, valor: number, fonte = normal) => {
    novaPaginaSePreciso(14);
    page.drawText(limpo(rotulo).slice(0, 80), { x: m + 8, y, size: 9, font: fonte, color: cor });
    const v = REAIS.format(valor);
    page.drawText(v, { x: m + largura - fonte.widthOfTextAtSize(v, 9), y, size: 9, font: fonte, color: cor });
    y -= 13;
  };

  paragrafo(`TERMO DE QUITAÇÃO ANUAL DE OBRIGAÇÕES TRABALHISTAS - ${t.ano}`, 13, negrito);
  y -= 4;
  paragrafo("(art. 507-B da Consolidação das Leis do Trabalho)", 9);
  y -= 8;
  paragrafo(`Empregador: ${p.empresa}${p.documentoDaEmpresa ? `, inscrito sob ${p.documentoDaEmpresa}` : ""}.`);
  paragrafo(`Empregado(a): ${p.colaborador}${p.cpf ? `, CPF ${p.cpf}` : ""}${p.admissao ? `, admitido(a) em ${p.admissao.split("-").reverse().join("/")}` : ""}.`);
  paragrafo(`Período: janeiro a dezembro de ${t.ano}. Competências consideradas: ${t.meses.length ? t.meses.map(mesBr).join(", ") : "nenhuma"}.`);
  y -= 6;
  paragrafo("As partes declaram que, no período acima, foram pagas as seguintes verbas:");
  y -= 2;
  paragrafo("Proventos", 10, negrito);
  for (const l of t.proventos) linhaDeValor(`${l.codigo} ${l.nome}`, l.valor);
  linhaDeValor("Total dos proventos", t.totalProventos, negrito);
  y -= 4;
  paragrafo("Descontos", 10, negrito);
  for (const l of t.descontos) linhaDeValor(`${l.codigo} ${l.nome}`, l.valor);
  linhaDeValor("Total dos descontos", t.totalDescontos, negrito);
  y -= 4;
  linhaDeValor("Líquido pago no período", t.liquido, negrito);
  linhaDeValor("FGTS depositado no período", t.fgts, negrito);
  y -= 8;
  paragrafo(
    "Com a assinatura deste termo perante o sindicato da categoria, o(a) empregado(a) dá quitação das obrigações acima discriminadas, referentes ao período, ressalvadas as parcelas não especificadas e as que vierem a ser apuradas."
  );
  y -= 40;
  novaPaginaSePreciso(110);
  const assinatura = (rotulo: string, x: number) => {
    page.drawLine({ start: { x, y }, end: { x: x + 220, y }, thickness: 0.6, color: cor });
    page.drawText(limpo(rotulo), { x, y: y - 12, size: 8, font: normal, color: cor });
  };
  assinatura("Empregador", m);
  assinatura("Empregado(a)", m + 270);
  y -= 60;
  assinatura(`Sindicato da categoria${p.sindicato ? `: ${p.sindicato}` : ""}`.slice(0, 60), m);
  return pdf.save();
}
