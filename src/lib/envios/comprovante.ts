// O comprovante de leitura do envio em PDF (22/10/2026): a prova que o módulo
// sempre guardou — cada abertura e download com data, hora e IP, e o aceite
// quando o envio pede — num papel que a equipe guarda ou manda a quem
// questionar ("o cliente nunca recebeu"). Antes, a prova era um print da ficha.
//
// Puro: `linhasDoComprovante` monta o que o papel diz (testável sem PDF), e
// `pdfDoComprovante` desenha com o pdf-lib, no estilo do recibo da baixa
// (A4, Helvetica, margem de 50), com os mesmos `textoParaPdf` e
// `quebrarLinhas` — a fonte padrão só escreve WinAnsi. O log pode ser longo,
// então o papel quebra página. Quem lê o banco, calcula os hashes e confere o
// acesso é a rota `/solicitacoes/envios/[docId]/comprovante`.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { quebrarLinhas, textoParaPdf } from "@/lib/financeiro/baixa/recibo";

export type AcaoDoLog = "VIEWED" | "DOWNLOADED" | "SIGNED";

export type DadosDoComprovante = {
  envioId: string;
  escritorioNome: string;
  empresaNome: string;
  /** CNPJ/CPF já formatado, ou nulo sem documento. */
  empresaDocumento: string | null;
  titulo: string;
  /** SHA-256 do conteúdo (o HTML gravado), calculado na emissão. */
  conteudoSha256: string;
  /** O anexo, com o SHA-256 do arquivo guardado (nulo se o arquivo sumiu do disco). */
  anexo: { nome: string; sha256: string | null } | null;
  pedeAceite: boolean;
  criadoPor: string;
  criadoEm: Date;
  publicadoEm: Date | null;
  agendadoPara: Date | null;
  lembreteEnviadoEm: Date | null;
  destinatarios: {
    email: string;
    enviadoEm: Date | null;
    primeiraVisualizacao: Date | null;
    aceite: { nome: string | null; em: Date; ip: string | null } | null;
  }[];
  /** Cada linha do log de prova, de qualquer destinatário. */
  eventos: { em: Date; acao: AcaoDoLog; email: string; ip: string }[];
  emitidoPor: string;
  emitidoEm: Date;
};

export type LinhaDoComprovante = { rotulo: string; valor: string };

export type ConteudoDoComprovante = {
  titulo: string;
  numero: string;
  cabecalho: string[];
  resumo: string;
  envio: LinhaDoComprovante[];
  destinatarios: { titulo: string; linhas: string[] }[];
  /** O log, do mais antigo ao mais novo: [data/hora, ação, quem, IP]. */
  log: [string, string, string, string][];
  rodape: string[];
};

const ROTULO_DA_ACAO: Record<AcaoDoLog, string> = {
  VIEWED: "Abriu",
  DOWNLOADED: "Baixou o anexo",
  SIGNED: "Deu o aceite",
};

/** O número do comprovante: o começo do id do envio — dá para achar o envio por ele. */
export function numeroDoComprovante(envioId: string): string {
  return envioId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

/** Data e hora com segundos, em Brasília — a precisão da prova. */
export function dataHoraDaProva(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d);
}

/** O que o comprovante diz, linha a linha. */
export function linhasDoComprovante(d: DadosDoComprovante): ConteudoDoComprovante {
  const abriram = d.destinatarios.filter((r) => r.primeiraVisualizacao);
  const aceite = d.destinatarios.find((r) => r.aceite)?.aceite ?? null;
  const resumo = [
    abriram.length === 0
      ? `Até a emissão, ninguém do cliente abriu o documento "${d.titulo}".`
      : `O documento "${d.titulo}" foi aberto por ${abriram.length} de ${d.destinatarios.length} destinatário(s); a primeira abertura foi em ${dataHoraDaProva(
          new Date(Math.min(...abriram.map((r) => r.primeiraVisualizacao!.getTime())))
        )}.`,
    d.pedeAceite
      ? aceite
        ? `O aceite eletrônico foi dado por ${aceite.nome ?? "—"} em ${dataHoraDaProva(aceite.em)}${aceite.ip ? `, do IP ${aceite.ip}` : ""}.`
        : "O envio pede aceite eletrônico, e o aceite ainda não foi dado."
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  const envio: LinhaDoComprovante[] = [
    { rotulo: "Escritório", valor: d.escritorioNome },
    { rotulo: "Empresa", valor: d.empresaDocumento ? `${d.empresaNome} — ${d.empresaDocumento}` : d.empresaNome },
    { rotulo: "Documento", valor: d.titulo },
    { rotulo: "Hash do conteúdo", valor: `SHA-256 ${d.conteudoSha256}` },
  ];
  if (d.anexo) {
    envio.push({ rotulo: "Anexo", valor: d.anexo.nome });
    envio.push({ rotulo: "Hash do anexo", valor: d.anexo.sha256 ? `SHA-256 ${d.anexo.sha256}` : "arquivo não encontrado no armazenamento" });
  }
  envio.push({ rotulo: "Pede aceite", valor: d.pedeAceite ? "Sim (ler e aceitar)" : "Não" });
  envio.push({ rotulo: "Criado por", valor: `${d.criadoPor} em ${dataHoraDaProva(d.criadoEm)}` });
  envio.push({ rotulo: "Publicado em", valor: d.publicadoEm ? dataHoraDaProva(d.publicadoEm) : "Não publicado" });
  if (d.agendadoPara) envio.push({ rotulo: "Agendado para", valor: dataHoraDaProva(d.agendadoPara) });
  if (d.lembreteEnviadoEm) envio.push({ rotulo: "Lembrete enviado em", valor: dataHoraDaProva(d.lembreteEnviadoEm) });

  const destinatarios = d.destinatarios.map((r) => ({
    titulo: r.email,
    linhas: [
      r.enviadoEm ? `E-mail enviado em ${dataHoraDaProva(r.enviadoEm)}` : "Sem e-mail (recebido pelo portal)",
      r.primeiraVisualizacao ? `Primeira abertura em ${dataHoraDaProva(r.primeiraVisualizacao)}` : "Não abriu",
      ...(d.pedeAceite
        ? [r.aceite ? `Aceite de ${r.aceite.nome ?? "—"} em ${dataHoraDaProva(r.aceite.em)}${r.aceite.ip ? ` (IP ${r.aceite.ip})` : ""}` : "Sem aceite"]
        : []),
    ],
  }));

  const log = [...d.eventos]
    .sort((a, b) => a.em.getTime() - b.em.getTime())
    .map((e) => [dataHoraDaProva(e.em), ROTULO_DA_ACAO[e.acao], e.email, e.ip] as [string, string, string, string]);

  return {
    titulo: "Comprovante de leitura",
    numero: numeroDoComprovante(d.envioId),
    cabecalho: [d.escritorioNome, "Envio de documento ao cliente"],
    resumo,
    envio,
    destinatarios,
    log,
    rodape: [
      `Envio ${d.envioId}`,
      `Emitido pelo Connect por ${d.emitidoPor} em ${dataHoraDaProva(d.emitidoEm)}. Horários de Brasília.`,
    ],
  };
}

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 50;
const RODAPE = MARGIN + 40;
const CINZA = rgb(0.4, 0.4, 0.4);
const LINHA = rgb(0.8, 0.8, 0.8);

/** O PDF do comprovante — A4, quantas páginas o log pedir. */
export async function pdfDoComprovante(d: DadosDoComprovante): Promise<Uint8Array> {
  const c = linhasDoComprovante(d);
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setTitle(`Comprovante de leitura ${c.numero}`);
  pdfDoc.setCreator("Connect 41");
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const largura = A4_WIDTH - 2 * MARGIN;

  const paginas: PDFPage[] = [];
  let page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
  paginas.push(page);
  let y = A4_HEIGHT - MARGIN;

  /** Garante espaço para `altura`; senão, página nova. */
  const caber = (altura: number) => {
    if (y - altura >= RODAPE) return;
    page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
    paginas.push(page);
    y = A4_HEIGHT - MARGIN;
  };
  const escrever = (texto: string, x: number, size: number, f: PDFFont, color = rgb(0, 0, 0)) =>
    page.drawText(textoParaPdf(texto), { x, y, size, font: f, color });
  const separador = () => {
    page.drawLine({ start: { x: MARGIN, y }, end: { x: A4_WIDTH - MARGIN, y }, thickness: 0.5, color: LINHA });
  };
  const tituloDoBloco = (titulo: string) => {
    caber(40);
    escrever(titulo, MARGIN, 11, fontBold);
    y -= 8;
    separador();
    y -= 16;
  };

  escrever(c.cabecalho[0], MARGIN, 10, fontBold, CINZA);
  const numero = textoParaPdf(`Nº ${c.numero}`);
  page.drawText(numero, { x: A4_WIDTH - MARGIN - fontBold.widthOfTextAtSize(numero, 12), y, size: 12, font: fontBold });
  y -= 30;
  escrever(c.titulo, MARGIN, 22, fontBold);
  y -= 18;
  escrever(c.cabecalho[1], MARGIN, 10, font, CINZA);
  y -= 16;
  separador();
  y -= 22;

  for (const linha of quebrarLinhas(textoParaPdf(c.resumo), largura, (t) => font.widthOfTextAtSize(t, 11))) {
    caber(16);
    escrever(linha, MARGIN, 11, font);
    y -= 16;
  }
  y -= 10;

  tituloDoBloco("Envio");
  for (const l of c.envio) {
    const partes = quebrarLinhas(textoParaPdf(l.valor), largura - 130, (t) => font.widthOfTextAtSize(t, 9.5));
    caber(15 * partes.length);
    escrever(l.rotulo, MARGIN, 9.5, font, CINZA);
    for (const parte of partes) {
      page.drawText(parte, { x: MARGIN + 130, y, size: 9.5, font });
      y -= 14;
    }
    y -= 3;
  }
  y -= 10;

  tituloDoBloco("Destinatários");
  if (c.destinatarios.length === 0) {
    escrever("Nenhum destinatário.", MARGIN, 9.5, font, CINZA);
    y -= 16;
  }
  for (const r of c.destinatarios) {
    caber(14 * (r.linhas.length + 1) + 6);
    escrever(r.titulo, MARGIN, 9.5, fontBold);
    y -= 14;
    for (const l of r.linhas) {
      escrever(l, MARGIN + 12, 9, font, CINZA);
      y -= 13;
    }
    y -= 6;
  }
  y -= 8;

  tituloDoBloco("Registro de acessos");
  const colunas = [MARGIN, MARGIN + 115, MARGIN + 210, MARGIN + 400];
  const cabecalhoDoLog = () => {
    ["Data e hora", "Ação", "Destinatário", "IP"].forEach((t, i) => escrever(t, colunas[i]!, 8.5, fontBold, CINZA));
    y -= 13;
  };
  if (c.log.length === 0) {
    escrever("Nenhum acesso registrado até a emissão.", MARGIN, 9.5, font, CINZA);
    y -= 16;
  } else {
    cabecalhoDoLog();
    for (const linha of c.log) {
      if (y - 12 < RODAPE) {
        caber(Number.POSITIVE_INFINITY);
        cabecalhoDoLog();
      }
      linha.forEach((t, i) => {
        // Corta o que não cabe na coluna (e-mail longo), sem invadir a próxima.
        const limite = (colunas[i + 1] ?? A4_WIDTH - MARGIN) - colunas[i]! - 6;
        let texto = textoParaPdf(t);
        while (texto.length > 1 && font.widthOfTextAtSize(texto, 8.5) > limite) texto = texto.slice(0, -2) + "…";
        page.drawText(texto, { x: colunas[i]!, y, size: 8.5, font });
      });
      y -= 12;
    }
  }

  paginas.forEach((p, i) => {
    let yr = MARGIN + 24;
    p.drawLine({ start: { x: MARGIN, y: yr }, end: { x: A4_WIDTH - MARGIN, y: yr }, thickness: 0.5, color: LINHA });
    yr -= 14;
    for (const r of c.rodape) {
      p.drawText(textoParaPdf(r), { x: MARGIN, y: yr, size: 8, font, color: CINZA });
      yr -= 11;
    }
    const pagina = textoParaPdf(`Página ${i + 1} de ${paginas.length}`);
    p.drawText(pagina, { x: A4_WIDTH - MARGIN - font.widthOfTextAtSize(pagina, 8), y: MARGIN + 10, size: 8, font, color: CINZA });
  });

  return pdfDoc.save();
}
