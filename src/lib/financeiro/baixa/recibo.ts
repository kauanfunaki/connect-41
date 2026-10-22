// O recibo da baixa em PDF (22/10/2026, pedido do BPO): uma baixa — um
// pagamento ou recebimento — num papel que se manda ao fornecedor ou ao
// cliente, ou que fica no arquivo da empresa. Antes, a prova da baixa era um
// print da janela.
//
// Puro: `linhasDoRecibo` monta o que o papel diz (testável sem PDF), e
// `pdfDoRecibo` desenha com o pdf-lib, no mesmo estilo da exportação dos
// Indicadores de RH (A4, Helvetica, margem de 50). Quem lê o banco e confere o
// acesso é a rota `/api/financeiro/baixas/[id]/recibo`.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatarReaisDeCentavos } from "@/lib/format";

export type DadosDoRecibo = {
  /** O id da baixa — o número do recibo sai dele. */
  paymentId: string;
  kind: "PAGAR" | "RECEBER";
  /** O escritório que presta o BPO. */
  escritorioNome: string;
  empresaNome: string;
  /** Já formatado ("12.345.678/0001-90"), ou nulo sem documento. */
  empresaDocumento: string | null;
  contraparteNome: string;
  contraparteDocumento: string | null;
  descricao: string | null;
  documentoNumero: string | null;
  /** "AAAA-MM-DD". */
  vencimentoKey: string;
  pagamentoKey: string;
  /** O valor do título inteiro. */
  valorDoTituloCentavos: number;
  principalCentavos: number;
  jurosCentavos: number;
  multaCentavos: number;
  descontoCentavos: number;
  /** principal + juros + multa − desconto: o que andou na conta. */
  caixaCentavos: number;
  contaBancaria: string | null;
  observacao: string | null;
  registradoPor: string | null;
  /** O instante em que a baixa foi gravada. */
  registradoEm: Date;
  emitidoEm: Date;
};

export type LinhaDoRecibo = { rotulo: string; valor: string; destaque?: boolean };

export type ConteudoDoRecibo = {
  titulo: string;
  numero: string;
  cabecalho: string[];
  declaracao: string;
  partes: LinhaDoRecibo[];
  valores: LinhaDoRecibo[];
  pagamento: LinhaDoRecibo[];
  rodape: string[];
};

const dataBr = (key: string) => key.split("-").reverse().join("/");
const reais = (centavos: number) => formatarReaisDeCentavos(centavos);

/** O número do recibo: o começo do id da baixa, que é único — dá para achar a baixa por ele. */
export function numeroDoRecibo(paymentId: string): string {
  return paymentId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function comDocumento(nome: string, documento: string | null): string {
  return documento ? `${nome} — ${documento}` : nome;
}

/** O que o recibo diz, linha a linha. */
export function linhasDoRecibo(d: DadosDoRecibo): ConteudoDoRecibo {
  const aPagar = d.kind === "PAGAR";
  const parcial = d.principalCentavos < d.valorDoTituloCentavos;
  const referente = d.descricao?.trim() || (d.documentoNumero ? `documento ${d.documentoNumero}` : "título sem descrição");
  const declaracao = aPagar
    ? `${d.empresaNome} pagou a ${d.contraparteNome} a importância de ${reais(d.caixaCentavos)}, em ${dataBr(d.pagamentoKey)}, referente a ${referente}${parcial ? " (pagamento parcial)" : ""}.`
    : `${d.empresaNome} recebeu de ${d.contraparteNome} a importância de ${reais(d.caixaCentavos)}, em ${dataBr(d.pagamentoKey)}, referente a ${referente}${parcial ? " (recebimento parcial)" : ""}.`;

  const valores: LinhaDoRecibo[] = [{ rotulo: "Valor do título", valor: reais(d.valorDoTituloCentavos) }];
  valores.push({ rotulo: parcial ? "Valor baixado (parcial)" : "Valor baixado", valor: reais(d.principalCentavos) });
  valores.push({ rotulo: "Juros", valor: reais(d.jurosCentavos) });
  valores.push({ rotulo: "Multa", valor: reais(d.multaCentavos) });
  valores.push({ rotulo: "Desconto", valor: d.descontoCentavos ? `- ${reais(d.descontoCentavos)}` : reais(0) });
  valores.push({ rotulo: aPagar ? "Valor pago" : "Valor recebido", valor: reais(d.caixaCentavos), destaque: true });

  const partes: LinhaDoRecibo[] = [
    { rotulo: "Empresa", valor: comDocumento(d.empresaNome, d.empresaDocumento) },
    { rotulo: aPagar ? "Fornecedor" : "Cliente", valor: comDocumento(d.contraparteNome, d.contraparteDocumento) },
    { rotulo: "Descrição", valor: d.descricao?.trim() || "—" },
  ];
  if (d.documentoNumero) partes.push({ rotulo: "Documento", valor: d.documentoNumero });

  const pagamento: LinhaDoRecibo[] = [
    { rotulo: "Vencimento", valor: dataBr(d.vencimentoKey) },
    { rotulo: aPagar ? "Data do pagamento" : "Data do recebimento", valor: dataBr(d.pagamentoKey) },
    { rotulo: aPagar ? "Saiu da conta" : "Entrou na conta", valor: d.contaBancaria ?? "Não informada" },
    { rotulo: "Registrado por", valor: `${d.registradoPor ?? "—"} em ${dataHoraBr(d.registradoEm)}` },
  ];
  if (d.observacao?.trim()) pagamento.push({ rotulo: "Observação", valor: d.observacao.trim() });

  return {
    titulo: "Recibo",
    numero: numeroDoRecibo(d.paymentId),
    cabecalho: [d.escritorioNome, aPagar ? "Comprovante de pagamento" : "Comprovante de recebimento"],
    declaracao,
    partes,
    valores,
    pagamento,
    rodape: [`Baixa ${d.paymentId}`, `Emitido pelo Connect em ${dataHoraBr(d.emitidoEm)}.`],
  };
}

function dataHoraBr(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// As fontes padrão do PDF só escrevem o WinAnsi: os acentos do português
// passam, mas o espaço fino do `Intl` ("R$ 1,00") e qualquer caractere de fora
// derrubam o `drawText`. O texto passa por aqui antes.
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");

/** O texto como as fontes padrão do PDF conseguem escrever. */
export function textoParaPdf(texto: string): string {
  return [...texto.normalize("NFC").replace(/[    ]/g, " ").replace(/[\r\n\t]+/g, " ")]
    .map((ch) => {
      const cp = ch.codePointAt(0)!;
      if ((cp >= 0x20 && cp <= 0x7e) || (cp >= 0xa0 && cp <= 0xff)) return ch;
      return WIN_ANSI_EXTRA.has(ch) ? ch : "?";
    })
    .join("");
}

/** Quebra o texto em linhas que cabem na largura. */
export function quebrarLinhas(texto: string, largura: number, medir: (t: string) => number): string[] {
  const palavras = texto.split(" ").filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (medir(tentativa) <= largura || !atual) atual = tentativa;
    else {
      linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 50;
const CINZA = rgb(0.4, 0.4, 0.4);
const LINHA = rgb(0.8, 0.8, 0.8);

/** O PDF do recibo — uma página A4. */
export async function pdfDoRecibo(d: DadosDoRecibo): Promise<Uint8Array> {
  const c = linhasDoRecibo(d);
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Recibo ${c.numero}`);
  pdfDoc.setCreator("Connect 41");
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  const largura = A4_WIDTH - 2 * MARGIN;
  let y = A4_HEIGHT - MARGIN;

  const escrever = (p: PDFPage, texto: string, x: number, size: number, f: PDFFont, color = rgb(0, 0, 0)) =>
    p.drawText(textoParaPdf(texto), { x, y, size, font: f, color });
  const separador = () => {
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4_WIDTH - MARGIN, y }, thickness: 0.5, color: LINHA });
  };

  escrever(page, c.cabecalho[0], MARGIN, 10, fontBold, CINZA);
  const numero = `Nº ${c.numero}`;
  page.drawText(textoParaPdf(numero), { x: A4_WIDTH - MARGIN - fontBold.widthOfTextAtSize(textoParaPdf(numero), 12), y, size: 12, font: fontBold });
  y -= 30;
  escrever(page, c.titulo, MARGIN, 22, fontBold);
  y -= 18;
  escrever(page, c.cabecalho[1], MARGIN, 10, font, CINZA);
  y -= 16;
  separador();
  y -= 22;

  for (const linha of quebrarLinhas(textoParaPdf(c.declaracao), largura, (t) => font.widthOfTextAtSize(t, 11))) {
    escrever(page, linha, MARGIN, 11, font);
    y -= 16;
  }
  y -= 10;

  const bloco = (titulo: string, linhas: LinhaDoRecibo[], valoresADireita: boolean) => {
    escrever(page, titulo, MARGIN, 11, fontBold);
    y -= 8;
    separador();
    y -= 16;
    for (const l of linhas) {
      const f = l.destaque ? fontBold : font;
      escrever(page, l.rotulo, MARGIN, 10, l.destaque ? fontBold : font, l.destaque ? rgb(0, 0, 0) : CINZA);
      const valor = textoParaPdf(l.valor);
      if (valoresADireita) {
        page.drawText(valor, { x: A4_WIDTH - MARGIN - f.widthOfTextAtSize(valor, 10), y, size: 10, font: f });
        y -= 18;
      } else {
        const partes = quebrarLinhas(valor, largura - 140, (t) => f.widthOfTextAtSize(t, 10));
        for (const parte of partes) {
          page.drawText(parte, { x: MARGIN + 140, y, size: 10, font: f });
          y -= 15;
        }
        y -= 3;
      }
    }
    y -= 12;
  };

  bloco("Partes", c.partes, false);
  bloco("Valores", c.valores, true);
  bloco(d.kind === "PAGAR" ? "Pagamento" : "Recebimento", c.pagamento, false);

  y = MARGIN + 24;
  separador();
  y -= 14;
  for (const r of c.rodape) {
    escrever(page, r, MARGIN, 8, font, CINZA);
    y -= 11;
  }

  return pdfDoc.save();
}
