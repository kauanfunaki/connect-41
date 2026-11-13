// O relatório de conta corrente do Omie (Bloco B, Fase B4, 12/11/2026): leitura documental, sem regra
// contábil. Porte de `conciliacao_bancaria/financeiro_omie.py`.
//
// O original lê este PDF pelo PyMuPDF (e não pelo pdfplumber), que corta as palavras e mede as caixas
// de outro jeito. As palavras e o texto de cada página saem de `pdf/mupdf.ts`, que imita o PyMuPDF a
// partir dos mesmos caracteres do pdfminer.
//
// Cada linha precisa fechar com o saldo (saldo anterior + valor = saldo), estar dentro do período e
// em ordem de data, e ter uma situação conhecida (Conciliado, Não Conciliar, Pendente). O nome que
// invade a coluna Documento não vira número de documento.

import { compara, dec, modulo, soma, subtrai, type Dec } from "../motor/decimal";
import { agruparLinhas } from "../extrato/comum";
import { inteiro, len, re, strip } from "../extrato/py";
import type { PaginaComCaracteres } from "../pdf/caracteres";
import { palavrasMupdf, textoMupdf } from "../pdf/mupdf";
import type { DocumentoFinanceiro, LinhaFinanceiro } from "./financeiroTipos";
import { FinanceiroInvalido, MAX_CARACTERES_PAGINA, MAX_LINHAS_FINANCEIRO, MAX_SEGUNDOS_PDF, normalizarFinanceiro, valorFinanceiro } from "./financeiroComum";
import { strptimeDmy } from "./folhas";

/** `reconhece_omie`: o texto (do pdfplumber) da primeira página tem os rótulos do relatório. */
export function reconheceOmie(texto: string): boolean {
  const t = normalizarFinanceiro(texto);
  return ["extrato de", "conta corrente", "situacao data cliente ou fornecedor documento categoria valor saldo"].every((x) => t.includes(x));
}

type PalavraOmie = { text: string; x0: number; x1: number; top: number; bottom: number };

const BANCO = re("Extrato de ([^\\n]+)");
const PERIODO = re("Per[ií]odo de (\\d{2}/\\d{2}/\\d{4}) at[eé] (\\d{2}/\\d{2}/\\d{4})");
const NUMERACAO = re("Página (\\d+) de (\\d+)");
const DATA_CURTA = re("\\d{2}/\\d{2}/\\d{2}");
const MOEDA = re("-?(?:\\d{1,3}(?:\\.\\d{3})+|\\d+),\\d{2}");
// O `%d/%m/%y` do `_strptime` do Python.
const DMY_CURTO = re("(?P<d>3[01]|[12]\\d|0[1-9]|[1-9]| [1-9])/(?P<m>1[0-2]|0[1-9]|[1-9])/(?P<y>\\d\\d)");
const CABECALHO = ["Situação", "Data", "Documento", "Categoria", "Valor", "Saldo"];
const SITUACOES = new Set(["Conciliado", "Não", "Conciliar", "Pendente"]);
const UM_CENTAVO = dec("0.01");

/** Um erro do Python que não é recusa (`ValueError`, `KeyError`): o leitor do PDF o troca pela frase genérica. */
class ErroInterno extends Error {}

/** `datetime.strptime(texto, "%d/%m/%y").date()` */
function dataCurta(texto: string): string {
  const m = DMY_CURTO.fullmatch(texto);
  if (!m) throw new ErroInterno(`time data '${texto}' does not match format '%d/%m/%y'`);
  const y = inteiro(m.grupo("y")!);
  const iso = strptimeDmy(`${m.grupo("d")}/${m.grupo("m")}/${y < 69 ? 2000 + y : 1900 + y}`);
  if (iso === null) throw new ErroInterno("day is out of range for month");
  return iso;
}

/** `datetime.strptime(texto, "%d/%m/%Y").date()` */
function dataLonga(texto: string): string {
  const iso = strptimeDmy(texto);
  if (iso === null) throw new ErroInterno(`time data '${texto}' does not match format '%d/%m/%Y'`);
  return iso;
}

/** `ler_omie` depois de abrir o PDF (`_ler_paginas`); `relogio` em segundos, como o `time.monotonic`. */
export function lerOmie(paginas: readonly PaginaComCaracteres[], inicioTempo: number, relogio: () => number): DocumentoFinanceiro {
  const registros: LinhaFinanceiro[] = [];
  let saldoAnterior: Dec | null = null;
  let ultimaData: string | null = null;
  if (!paginas.length) throw new ErroInterno("page 0 not in document");
  const primeira = textoMupdf(paginas[0].caracteres, paginas[0].largura, paginas[0].altura);
  const banco = BANCO.search(primeira);
  const periodo = PERIODO.search(primeira);
  if (!banco || !periodo) throw new FinanceiroInvalido("Omie sem banco ou período identificado.");
  const nomeBanco = strip(banco.grupo(1)!);
  const inicio = dataLonga(periodo.grupo(1)!);
  const fim = dataLonga(periodo.grupo(2)!);
  if (inicio > fim) throw new FinanceiroInvalido("Período Omie inválido.");

  paginas.forEach((page, i) => {
    const pagina = i + 1;
    if (relogio() - inicioTempo > MAX_SEGUNDOS_PDF) throw new FinanceiroInvalido("Leitura Omie excedeu o tempo limite; divida o PDF.");
    const textoPagina = textoMupdf(page.caracteres, page.largura, page.altura);
    if (len(textoPagina) > MAX_CARACTERES_PAGINA) throw new FinanceiroInvalido("Página Omie excede o limite de texto.");
    const grupos = agruparLinhas<PalavraOmie>(
      palavrasMupdf(page.caracteres, page.largura, page.altura).map((w) => ({ text: w.text, x0: w.x0, x1: w.x1, top: w.top, bottom: w.bottom })),
    );
    const numeracao = NUMERACAO.search(textoPagina);
    if (!numeracao || inteiro(numeracao.grupo(1)!) !== pagina || inteiro(numeracao.grupo(2)!) !== paginas.length) {
      throw new FinanceiroInvalido("Paginação Omie incompleta ou fora de ordem.");
    }
    const cab = grupos.find((g) => {
      const textos = new Set(g.map((w) => w.text));
      return CABECALHO.every((t) => textos.has(t));
    });
    if (!cab) throw new FinanceiroInvalido(`Cabeçalho Omie ausente na página ${pagina}.`);
    const mapa = new Map(cab.map((w) => [w.text, w]));
    const col = (nome: string): PalavraOmie => {
      const w = mapa.get(nome);
      if (!w) throw new ErroInterno(`KeyError: '${nome}'`);
      return w;
    };

    for (const grupo of grupos) {
      const top = grupo[0].top;
      if (top <= cab[0].top) continue;
      const texto = grupo.map((w) => w.text).join(" ");
      if (texto.startsWith("Gerado em") || texto.startsWith("Página")) continue;
      const datas = grupo.filter((w) => DATA_CURTA.fullmatch(w.text)).map((w) => w.text);
      if (!datas.length) throw new FinanceiroInvalido(`Linha Omie não reconhecida na página ${pagina}.`);
      const data = dataCurta(datas[0]);

      const dinheiro = (nome: string): Dec => {
        const alvo = col(nome).x1;
        const candidatos = grupo.filter((w) => Math.abs(w.x1 - alvo) <= 2 && MOEDA.fullmatch(w.text)).map((w) => w.text);
        if (candidatos.length !== 1) throw new FinanceiroInvalido(`${nome} Omie ausente ou ambíguo na página ${pagina}.`);
        return valorFinanceiro(candidatos[0], nome, true);
      };

      const saldo = dinheiro("Saldo");
      if (texto.includes("SALDO ANTERIOR")) {
        if (saldoAnterior !== null || registros.length) throw new FinanceiroInvalido("Saldo anterior Omie repetido.");
        saldoAnterior = saldo;
        continue;
      }
      const valor = dinheiro("Valor");
      if (saldoAnterior === null || compara(modulo(subtrai(soma(saldoAnterior, valor), saldo)), UM_CENTAVO) > 0) {
        throw new FinanceiroInvalido(`Movimentos Omie não fecham com o saldo na página ${pagina}.`);
      }
      if (!(inicio <= data && data <= fim) || (ultimaData && data < ultimaData)) {
        throw new FinanceiroInvalido("Data Omie fora do período ou ordem inválida.");
      }
      if (!grupo.some((w) => SITUACOES.has(w.text))) throw new FinanceiroInvalido("Situação Omie desconhecida.");

      const campo = (esquerda: number, direita: number): string | null =>
        strip(
          grupo
            .filter((w) => esquerda <= w.x0 && w.x0 < direita && !["Valor", "Saldo"].some((c) => Math.abs(w.x1 - col(c).x1) <= 2))
            .map((w) => w.text)
            .join(" "),
        ) || null;

      const nome = campo(col("Cliente").x0, col("Documento").x0);
      let documento = campo(col("Documento").x0, col("Categoria").x0);
      const sobreposicao = grupo.some((w) => col("Cliente").x0 <= w.x0 && w.x0 < col("Documento").x0 && col("Documento").x0 < w.x1);
      // O nome pode invadir a coluna Documento no PDF: pedaço do fornecedor não vira número de documento.
      if (sobreposicao) documento = null;
      const categoria = campo(col("Categoria").x0, col("Valor").x1);
      registros.push({
        data,
        valor,
        historico: nome || categoria || "SEM DESCRIÇÃO",
        favorecido: nome,
        documento,
        categoria,
        parcela: null,
        banco: nomeBanco,
        referencia: `omie:${pagina}:${registros.length + 1}`,
        observacao: (sobreposicao ? "Nome sobreposto à coluna Documento; confira o original. " : "") + "Relatório Omie; situação não altera lançamentos ou classificações.",
        documentoFavorecido: null,
      });
      saldoAnterior = saldo;
      ultimaData = data;
      if (registros.length > MAX_LINHAS_FINANCEIRO) throw new FinanceiroInvalido("Omie excede o limite de movimentos.");
    }
  });
  return {
    linhas: registros,
    banco: nomeBanco,
    avisos: [
      "Campos cortados ou sobrepostos no PDF original não são reconstruídos por suposição.",
      "Situação e categorias do Omie são apenas informações de consulta.",
    ],
    cnpj: null,
    titulosAbertos: [],
  };
}
