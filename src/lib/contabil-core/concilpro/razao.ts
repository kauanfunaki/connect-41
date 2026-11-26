import "server-only";

// A leitura do arquivo do Razão de fornecedores (ConcilPro, Bloco D, Fase D3a, 26/11/2026): o
// `parsear_arquivo_razao` de `src/domain/concilpro/parser.py` do Contábil Core, mais os dois passos que o
// processamento do envio fazia logo depois (`_processar_arquivo_background` em `src/api/v1/concilpro.py`):
// a consolidação dos lançamentos (`consolidador.ts`) e a classificação dos incertos pela IA (`ia.ts`).
//
// - Planilha (.xlsx e .xls): o leitor da B1 (`conciliacao/razaoPlanilha.ts`), sem IA, como no original.
// - PDF: os caracteres do porte do pdfminer (`pdf/caracteres.ts`), o texto de cada página na estratégia
//   escolhida (`texto.ts`) e os blocos (`leitor.ts`), com a IA de texto e a de imagem (`ia.ts`). As páginas
//   que vão à IA de imagem são PDFs de uma página (pdf-lib), no lugar do PNG de 150 dpi do PyMuPDF.
// - Outro formato (o ZIP que não é planilha): a recusa do original.
//
// Nada é gravado aqui: o envio, a fila e as tabelas ficam para a D3b.

import { PDFDocument } from "pdf-lib";
import { caracteresDoPdf } from "../pdf/caracteres";
import { parsearPlanilhaRazao, parsearXlsRazao } from "../conciliacao/razaoPlanilha";
import { erroPython, type RazaoPlanilha } from "../conciliacao/razaoTipos";
import type { ContextoDeLeitura, DependenciasDaIa } from "../ia/leituraPorIa";
import { calcularHashArquivo, detectarFormatoArquivo, lerTextoDoRazao, type DiagnosticoDoRazao, type IaDoRazao, type RazaoDeFornecedores } from "./leitor";
import { extrairCandidatos, textosDasPaginas } from "./texto";
import { classificarLancamentosIncertos, IA_DESLIGADA, parsearBlocoFornecedorIa, parsearBlocoFornecedorIaVisao, type PaginaParaIa } from "./ia";
import { consolidarTodosFornecedores } from "./consolidador";

/** O Razão lido e, no PDF, o diagnóstico da leitura (na planilha, nulo). */
export type LeituraDoRazao = { razao: RazaoDeFornecedores; diagnostico: DiagnosticoDoRazao | null };

export type OpcoesDoRazao = {
  /** A fundação de IA (os testes trocam). */
  ia?: DependenciasDaIa;
};

/** O Razão da planilha no formato do leitor de PDF (as chaves e os tipos são os mesmos). */
export function razaoDaPlanilha(p: RazaoPlanilha): RazaoDeFornecedores {
  return {
    ...p,
    fornecedores: p.fornecedores.map((f) => ({
      ...f,
      lancamentos: f.lancamentos.map((l) => ({ ...l })),
      conciliacaoIa: [],
      resumoIa: new Map(),
      validacaoIa: new Map(),
    })),
  };
}

/**
 * O texto de cada página na estratégia escolhida para o documento (o `_extrair_paginas` dentro do
 * `pdfplumber.open`). O PDF que não abre levanta o `ValueError` do original, com a mensagem do pdf.js.
 */
export async function textoDasPaginas(conteudo: Uint8Array): Promise<string[]> {
  let paginas;
  try {
    paginas = await caracteresDoPdf(conteudo);
  } catch (e) {
    throw erroPython("ValueError", `Erro ao extrair texto do PDF: ${e instanceof Error ? e.message : String(e)}`);
  }
  return textosDasPaginas(paginas.map(extrairCandidatos));
}

/**
 * `extrair_texto_pdf`: as páginas com texto, separadas por uma linha em branco. No original ela nunca
 * funcionou (a variável `i` do laço não existe, e todo PDF com página dava "Erro ao extrair texto do PDF:
 * name 'i' is not defined"); ninguém a chamava. Aqui ela faz o que diz.
 */
export async function extrairTextoPdf(conteudo: Uint8Array): Promise<string> {
  return (await textoDasPaginas(conteudo)).filter(Boolean).join("\n\n");
}

/**
 * `_renderizar_paginas_pdf`: as páginas pedidas (as que existem) como PDFs de uma página. Qualquer falha
 * devolve nenhuma, e o bloco não vai à IA de imagem, como no original.
 */
async function paginasParaIa(conteudo: Uint8Array, indices: readonly number[], cache: { doc?: PDFDocument | null }): Promise<PaginaParaIa[]> {
  try {
    if (cache.doc === undefined) cache.doc = await PDFDocument.load(conteudo, { ignoreEncryption: true, updateMetadata: false });
    const doc = cache.doc;
    if (!doc) return [];
    const saida: PaginaParaIa[] = [];
    for (const k of indices) {
      if (k < 0 || k >= doc.getPageCount()) continue;
      const uma = await PDFDocument.create();
      const [pagina] = await uma.copyPages(doc, [k]);
      uma.addPage(pagina);
      saida.push({ numero: k + 1, pdf: await uma.save() });
    }
    return saida;
  } catch {
    cache.doc ??= null;
    return [];
  }
}

/**
 * `parsear_arquivo_razao`: o Razão de fornecedores em PDF, .xlsx ou .xls. Levanta como o original: o
 * formato não suportado e o PDF ilegível (`ValueError`), as recusas da planilha, a falha de um lote da IA de
 * imagem (`ErroNoLoteDeImagem`) e a resposta da IA fora do formato que o original não tratava.
 */
export async function parsearArquivoRazao(conteudo: Uint8Array, quem: ContextoDeLeitura, opcoes: OpcoesDoRazao = {}): Promise<LeituraDoRazao> {
  const hash = calcularHashArquivo(conteudo);
  const formato = detectarFormatoArquivo(conteudo);
  if (formato === "XLSX") return { razao: razaoDaPlanilha(parsearPlanilhaRazao(conteudo)), diagnostico: null };
  if (formato === "XLS") return { razao: razaoDaPlanilha(parsearXlsRazao(conteudo)), diagnostico: null };
  if (formato !== "PDF") throw erroPython("ValueError", `Formato '${formato}' não suportado. Envie o Razão em PDF, XLSX ou XLS.`);

  const textos = await textoDasPaginas(conteudo);
  const cache: { doc?: PDFDocument | null } = {};
  const ia: IaDoRazao = {
    texto: (bloco) => parsearBlocoFornecedorIa(bloco, quem, opcoes.ia),
    visao: async (indices, bloco) => {
      // Sem a chave, nada vai à IA: não há por que separar as páginas.
      if (quem.documentosFinanceirosLiberados !== true) return { indisponivel: IA_DESLIGADA };
      const paginas = await paginasParaIa(conteudo, indices, cache);
      if (!paginas.length) return null;
      return parsearBlocoFornecedorIaVisao(paginas, bloco, quem, opcoes.ia);
    },
  };
  return lerTextoDoRazao(textos, hash, ia);
}

/**
 * O que o processamento do envio fazia com o arquivo antes de gravar: `parsear_arquivo_razao`,
 * `consolidar_todos_fornecedores` e, com os lançamentos incertos de todos os fornecedores, uma chamada de
 * `classificar_lancamentos_incertos`.
 */
export async function lerRazaoDeFornecedores(conteudo: Uint8Array, quem: ContextoDeLeitura, opcoes: OpcoesDoRazao = {}): Promise<LeituraDoRazao> {
  const lido = await parsearArquivoRazao(conteudo, quem, opcoes);
  const razao = consolidarTodosFornecedores(lido.razao);
  const incertos = razao.fornecedores.flatMap((f) => f.lancamentos.filter((l) => l.classificacaoIncerta));
  if (incertos.length) {
    const fora = await classificarLancamentosIncertos(incertos, quem, opcoes.ia);
    if (fora && lido.diagnostico) lido.diagnostico.iaIndisponivel ??= fora;
  }
  return { razao, diagnostico: lido.diagnostico };
}
