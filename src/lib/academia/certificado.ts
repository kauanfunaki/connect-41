// O certificado de destaque (10/11/2026, pedido do Kauan): o pódio (1º a 3º)
// de um mês que acabou baixa o seu em PDF. O desenho é o do 41 Hub
// (client/src/lib/certificate.ts — moldura na cor da colocação, cantos, a
// medalha, "concedido a", o nome e duas caixas com os números) no visual do
// Connect: papel claro, o azul da marca e a tipografia sóbria.
//
// No Hub a imagem era desenhada num canvas e o PDF saía da impressão do
// navegador. Aqui sai pronto do servidor, com o pdf-lib que o Connect já usa no
// recibo da baixa e na exportação dos Indicadores de RH — sem dependência nova.
//
// Puro: `linhasDoCertificado` diz o que o papel escreve (testável sem PDF), e
// `pdfDoCertificado` desenha. Quem confere a colocação é a rota
// `/api/academia/certificado`.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { textoParaPdf } from "@/lib/financeiro/baixa/recibo";
import { ROTULO_DO_TESTE, mesPorExtensoLongo, type Teste } from "./regras";
import { formatarPrecisao } from "./ranking";

export type DadosDoCertificado = {
  nome: string;
  escritorio: string;
  posicao: 1 | 2 | 3;
  teste: Teste;
  mes: string;
  ppm: number | null;
  acertos: number | null;
  total: number | null;
  precisao: number;
  emitidoEm: Date;
};

export type ConteudoDoCertificado = {
  titulo: string;
  subtitulo: string;
  colocacao: string;
  concedidoA: string;
  nome: string;
  caixas: { valor: string; rotulo: string }[];
  rodape: string;
  arquivo: string;
};

const dataLonga = (d: Date) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long", year: "numeric" }).format(d);

/** O que o certificado escreve, linha a linha. */
export function linhasDoCertificado(d: DadosDoCertificado): ConteudoDoCertificado {
  const caixas =
    d.teste === "logica" || d.teste === "atalhos"
      ? [
          // Atalhos (Fase 2): os acertos no minuto, sem o total.
          { valor: d.teste === "atalhos" ? String(d.acertos ?? 0) : `${d.acertos ?? 0} de ${d.total ?? 0}`, rotulo: d.teste === "atalhos" ? "ACERTOS EM 60 SEGUNDOS" : "ACERTOS" },
          { valor: `${formatarPrecisao(d.precisao)}%`, rotulo: "PRECISÃO" },
        ]
      : [
          { valor: `${d.ppm ?? 0} PPM`, rotulo: "PALAVRAS POR MINUTO" },
          { valor: `${formatarPrecisao(d.precisao)}%`, rotulo: "PRECISÃO" },
        ];
  return {
    titulo: "CERTIFICADO DE DESTAQUE",
    subtitulo: `Ranking de ${ROTULO_DO_TESTE[d.teste]} — ${mesPorExtensoLongo(d.mes)}`,
    colocacao: `${d.posicao}º LUGAR`,
    concedidoA: "ESTE CERTIFICADO É CONCEDIDO A",
    nome: d.nome.trim(),
    caixas,
    rodape: `${d.escritorio} · Academia do Connect · emitido em ${dataLonga(d.emitidoEm)}`,
    arquivo: `certificado-${d.teste}-${d.mes}-${d.posicao}lugar.pdf`,
  };
}

// As cores da colocação (as do Hub: ouro, prata e bronze) e as da marca do Connect.
const COR_DA_POSICAO: Record<1 | 2 | 3, RGB> = { 1: rgb(0.96, 0.62, 0.04), 2: rgb(0.58, 0.64, 0.72), 3: rgb(0.8, 0.5, 0.2) };
const MARCA = rgb(0.122, 0.369, 0.918); // #1F5EEA
const MARCA_CLARA = rgb(0.745, 0.816, 0.976); // #BED0F9
const MARCA_FUNDO = rgb(0.945, 0.961, 0.996); // #F1F5FE
const TINTA = rgb(0.059, 0.102, 0.2); // #0F1A33
const TINTA_SUAVE = rgb(0.337, 0.384, 0.486); // #56627C
const BRANCO = rgb(1, 1, 1);

const L = 842; // A4 deitado, em pontos
const A = 595;

function centralizar(pagina: PDFPage, texto: string, y: number, fonte: PDFFont, tamanho: number, cor: RGB) {
  const t = textoParaPdf(texto);
  pagina.drawText(t, { x: (L - fonte.widthOfTextAtSize(t, tamanho)) / 2, y, size: tamanho, font: fonte, color: cor });
}

/** O canto em L da moldura, como os do Hub. */
function canto(pagina: PDFPage, x: number, y: number, dx: 1 | -1, dy: 1 | -1, cor: RGB) {
  const t = 34;
  pagina.drawLine({ start: { x, y }, end: { x: x + dx * t, y }, thickness: 2, color: cor });
  pagina.drawLine({ start: { x, y }, end: { x, y: y + dy * t }, thickness: 2, color: cor });
  pagina.drawCircle({ x, y, size: 3, color: cor });
}

/** O PDF do certificado (A4 deitado). */
export async function pdfDoCertificado(d: DadosDoCertificado): Promise<Uint8Array> {
  const c = linhasDoCertificado(d);
  const doc = await PDFDocument.create();
  doc.setTitle(textoParaPdf(`${c.titulo} — ${c.nome}`));
  doc.setCreator("Connect");
  const pagina = doc.addPage([L, A]);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const negrito = await doc.embedFont(StandardFonts.HelveticaBold);
  const cor = COR_DA_POSICAO[d.posicao];

  // Moldura dupla e os cantos.
  pagina.drawRectangle({ x: 18, y: 18, width: L - 36, height: A - 36, borderColor: cor, borderWidth: 1.5 });
  pagina.drawRectangle({ x: 28, y: 28, width: L - 56, height: A - 56, borderColor: MARCA_CLARA, borderWidth: 0.75 });
  canto(pagina, 18, 18, 1, 1, cor);
  canto(pagina, L - 18, 18, -1, 1, cor);
  canto(pagina, 18, A - 18, 1, -1, cor);
  canto(pagina, L - 18, A - 18, -1, -1, cor);

  centralizar(pagina, "ACADEMIA DO CONNECT", A - 72, negrito, 10, MARCA);
  pagina.drawLine({ start: { x: 220, y: A - 86 }, end: { x: L - 220, y: A - 86 }, thickness: 0.75, color: MARCA_CLARA });
  centralizar(pagina, c.titulo, A - 122, negrito, 24, TINTA);
  centralizar(pagina, c.subtitulo, A - 146, normal, 12, TINTA_SUAVE);

  // A medalha: o número da colocação no círculo da cor dela.
  const yMedalha = A - 214;
  pagina.drawCircle({ x: L / 2, y: yMedalha, size: 38, color: cor });
  pagina.drawCircle({ x: L / 2, y: yMedalha, size: 31, borderColor: BRANCO, borderWidth: 1.5 });
  const numero = textoParaPdf(`${d.posicao}º`);
  pagina.drawText(numero, { x: L / 2 - negrito.widthOfTextAtSize(numero, 26) / 2, y: yMedalha - 9, size: 26, font: negrito, color: BRANCO });
  centralizar(pagina, c.colocacao, yMedalha - 62, negrito, 12, cor);

  centralizar(pagina, c.concedidoA, A - 318, normal, 9, TINTA_SUAVE);
  // O nome cabe na largura: a fonte desce até caber, como no Hub.
  let tamanho = 32;
  const nome = textoParaPdf(c.nome);
  while (negrito.widthOfTextAtSize(nome, tamanho) > L - 160 && tamanho > 18) tamanho -= 1;
  centralizar(pagina, nome, A - 360, negrito, tamanho, TINTA);

  // As duas caixas com os números.
  const lb = 190, ab = 64, vao = 24, yb = A - 456;
  c.caixas.forEach((caixa, i) => {
    const x = L / 2 + (i === 0 ? -lb - vao / 2 : vao / 2);
    pagina.drawRectangle({ x, y: yb, width: lb, height: ab, color: MARCA_FUNDO, borderColor: MARCA_CLARA, borderWidth: 0.75 });
    pagina.drawRectangle({ x: x + 12, y: yb + ab - 2, width: lb - 24, height: 2, color: cor });
    const valor = textoParaPdf(caixa.valor);
    pagina.drawText(valor, { x: x + (lb - negrito.widthOfTextAtSize(valor, 20)) / 2, y: yb + 30, size: 20, font: negrito, color: TINTA });
    const rotulo = textoParaPdf(caixa.rotulo);
    pagina.drawText(rotulo, { x: x + (lb - normal.widthOfTextAtSize(rotulo, 8)) / 2, y: yb + 14, size: 8, font: normal, color: TINTA_SUAVE });
  });

  pagina.drawLine({ start: { x: 120, y: 82 }, end: { x: L - 120, y: 82 }, thickness: 0.75, color: MARCA_CLARA });
  centralizar(pagina, c.rodape, 62, normal, 9, TINTA_SUAVE);

  return doc.save();
}
