import "server-only";

// A leitura do extrato em PDF (Fase 4, 10/11/2026): porte do `parse_pdf` de `extrato/pdf_parser.py`
// nas camadas determinísticas.
//
// - Camada 0: o leitor do banco, escolhido pela sigla da agência ou pela assinatura do layout, com a
//   cadeia de saldos de cada bloco conferida (ou, sem cadeia, os totais declarados).
// - Camada 1: o leitor genérico linha a linha, conferido pelos totais.
//
// As camadas de IA do original (texto para o GPT e imagem para o Vision) não vêm nesta fase: o PDF
// que só elas leriam é recusado com uma frase que manda importar o OFX (divergência 9 no documento).

import { dec } from "../motor/decimal";
import { caracteresDoPdf, LimiteDePaginas, type PaginaComCaracteres } from "../pdf/caracteres";
import { extrairPalavras, extrairTexto } from "../pdf/plumber";
import { anoDe, type Bloco, type Palavra, type Transacao } from "./comum";
import { documentoDeOutroTipo, ErroDeLeitura, FRACAO_LEGIVEL_MINIMA, fracaoLegivel, parseLinhasMultipagina, recusaDeAdaptadorVazio, validarBlocos, validarCompletude } from "./leitura";
import { escolher } from "./leitores";
import { ajustarViradaDeAno, fimDoPeriodo } from "./periodo";
import { splitlines } from "./py";

/** `pdf_max_pages` do original. */
export const MAX_PAGINAS_DO_PDF = 120;

export type LeituraDoPdf = {
  transacoes: Transacao[];
  /** O leitor que leu ("bb", "itau"…) ou "generico". */
  leitor: string;
};

/** O PDF já aberto: os caracteres de cada página, o texto em linhas e o topo de cada página. */
export type PdfAberto = {
  paginas: PaginaComCaracteres[];
  linhas: string[];
  totalChars: number;
  /** O topo de cada página (até 230 pontos ou 32% da altura), para a conferência da conta. */
  topos: string[];
};

/** Abre o PDF e extrai o texto, como o pdfplumber. Lança `ErroDeLeitura` se o arquivo não abre. */
export async function abrirPdf(bytes: Uint8Array): Promise<PdfAberto> {
  let paginas: PaginaComCaracteres[];
  try {
    paginas = await caracteresDoPdf(bytes, { maxPaginas: MAX_PAGINAS_DO_PDF });
  } catch (e) {
    if (e instanceof LimiteDePaginas) throw new ErroDeLeitura("PDF excede o limite de páginas.");
    throw new ErroDeLeitura("PDF inválido ou protegido. Envie um extrato legível.");
  }
  const linhas: string[] = [];
  const topos: string[] = [];
  let totalChars = 0;
  for (const p of paginas) {
    const texto = extrairTexto(p.caracteres);
    totalChars += [...texto].length;
    linhas.push(...splitlines(texto));
    const limite = Math.min(230, p.altura * 0.32);
    topos.push(extrairTexto(p.caracteres.filter((c) => c.top >= 0 && c.bottom <= limite && c.x0 >= 0 && c.x1 <= p.largura)));
  }
  return { paginas, linhas, totalChars, topos };
}

/** Lê o extrato de um PDF aberto. Lança `ErroDeLeitura` com a frase para o contador quando não dá. */
export function lerExtratoPdf(pdf: PdfAberto, bancoSigla: string | null, agora = new Date()): LeituraDoPdf {
  const { paginas, linhas, totalChars } = pdf;
  if (!paginas.length) throw new ErroDeLeitura("PDF sem páginas.");

  const naoEhExtrato = documentoDeOutroTipo(linhas);
  if (naoEhExtrato) throw new ErroDeLeitura(naoEhExtrato);

  if (totalChars < 50 || fracaoLegivel(linhas) < FRACAO_LEGIVEL_MINIMA) {
    throw new ErroDeLeitura(
      "Este PDF não tem texto legível: é uma imagem do extrato. O Connect ainda não lê extrato por imagem; " +
        "importe o OFX desta conta ou peça ao banco o PDF com texto selecionável.",
    );
  }

  // O ano vem do documento; o relógio só vale quando o extrato não diz.
  const fim = fimDoPeriodo(linhas);
  const anoAtual = agora.getUTCFullYear();
  const referenciaAno = fim ? anoDe(fim) : anoAtual;
  const tolerancia = dec("0.05");

  // Camada 0: o leitor do banco.
  const leitor = escolher(bancoSigla, linhas);
  if (leitor) {
    let blocos: Bloco[];
    try {
      blocos = leitor.extrairDePalavras
        ? leitor.extrairDePalavras(
            paginas.map((p) => extrairPalavras(p.caracteres, leitor.requerCaracteres) as unknown as Palavra[]),
            referenciaAno,
          )
        : leitor.extrair!(linhas, referenciaAno);
    } catch (e) {
      if (e instanceof ErroDeLeitura) throw e;
      // Os leitores reproduzem o original até nos tropeços (ex.: o Cresol com lançamento sem
      // descrição na última linha). No original, o job falhava com o erro cru; aqui vira recusa.
      console.error("[contabil-core] leitor de extrato falhou", leitor.nome, e instanceof Error ? e.name : "erro");
      throw new ErroDeLeitura(
        `O leitor do ${leitor.nome.toUpperCase()} não conseguiu ler este arquivo. Nenhum lançamento foi importado; ` +
          "envie o arquivo ao suporte para que o leitor seja ajustado, ou importe o OFX.",
      );
    }
    let transacoes = blocos.flatMap((b) => b.transacoes);
    if (transacoes.length) {
      // Sem saldo por lançamento (o Itaú imprime só em algumas linhas): cai na conferência por totais.
      if (!validarBlocos(blocos, tolerancia)) validarCompletude(linhas, transacoes);
      if (leitor.consolidarBlocos) transacoes = leitor.consolidarBlocos(blocos);
      // `ordem` é a posição no ARQUIVO, não no bloco.
      transacoes = ajustarViradaDeAno(transacoes, fim).map((t, i) => ({ ...t, ordem: i }));
      return { transacoes, leitor: leitor.nome };
    }
  }

  // Camada 1: o leitor genérico.
  const genericas = parseLinhasMultipagina(linhas, referenciaAno, anoAtual);
  if (genericas.length) {
    validarCompletude(linhas, genericas);
    return { transacoes: ajustarViradaDeAno(genericas, fim), leitor: "generico" };
  }

  if (leitor) throw new ErroDeLeitura(recusaDeAdaptadorVazio(leitor.nome, leitor.reconhece(linhas)));
  throw new ErroDeLeitura(
    "Não foi possível obter uma extração com saldos/totais verificáveis; nenhum lançamento foi importado. " +
      "Se o banco desta conta ainda não tem leitor de PDF no Connect, importe o OFX.",
  );
}
