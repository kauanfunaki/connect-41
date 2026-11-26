// Gabarito do leitor do Razão de fornecedores (scripts/contabil-core/gabarito_concilpro.py): as funções de
// `parser.py` e de `consolidador.py` chamada a chamada (as da suíte do original e as inventadas), e a leitura
// inteira (`parsear_arquivo_razao`, depois a consolidação e a classificação dos incertos, como o envio fazia) de
// PDFs e planilhas inventados, com a IA simulada nas combinações da chave: as mesmas chamadas à IA (texto ou
// imagem, o sistema, o texto enviado, as páginas, a ordem e a quantidade) e o mesmo resultado. As divergências
// deliberadas são contadas uma a uma.

import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/ai", () => ({ gerarTexto: vi.fn(), isAiConfigured: vi.fn() }));

import { jsonPython } from "../notas/visual";
import {
  arquivo,
  colunasDe,
  dataDe,
  decimalDe,
  decimalPy,
  fornecedorDe,
  fornecedorPy,
  lancamentoDe,
  lancamentoPy,
  projetar,
  PROMPTS,
  razaoDe,
  razaoPy,
  registros,
  totaisComoDecimal,
  type Json,
  type Objeto,
  type Regra,
  type Registro,
} from "./gabarito/ler";
import {
  calcularHashArquivo,
  classificarTipoOperacao,
  colunaDoValor,
  colunasDoHeader,
  consolidarFornecedoresDuplicados,
  construirFornecedorDeIa,
  corrigirColunasPorPosicao,
  deduplicarHistoricoLinha,
  deduplicarLancamentos,
  detectarFormatoArquivo,
  eContinuacaoDeHistorico,
  extrairCnpj,
  extrairNumeroNf,
  iaData,
  iaDecimal,
  identificarFornecedor,
  lerLinhaLancamento,
  normalizarLancamentoIa,
  parsearBlocoDeterministico,
  parseData,
  parseValor,
  pareceNomeFornecedor,
  preprocessarBloco,
  valoresPorColuna,
  type ColunasDoCabecalho,
  type DadosDoBloco,
} from "./leitor";
import { consolidarLancamentosFornecedor, consolidarTodosFornecedores, serieDaNota } from "./consolidador";
import { classificarLancamentosIncertos, LIMITES } from "./ia";
import { conferirChamadas, iaSimulada } from "./gabarito/iaSimulada";
import { extrairTextoPdf, lerRazaoDeFornecedores, parsearArquivoRazao } from "./razao";

/** As divergências deliberadas, contadas caso a caso (ver a "Fase D3a" em docs/CONTABIL-CORE.md). */
const divergencias = {
  /** O valor não finito da IA (NaN, Infinity): o `Dec` não o representa, e o porte levanta `InvalidOperation`. */
  naoFinito: 0,
  /** A chave do escritório desligada com o provedor configurado: o original mandava assim mesmo (não olhava o `ALLOW_...`). */
  chaveDoEscritorio: 0,
  /** O PDF que não abre: a mensagem é a do pdf.js, com o mesmo prefixo. */
  mensagemDoPdf: 0,
};

const tupla = (j: Json) => (j as { $tupla: Json[] }).$tupla;
const erro = (f: () => unknown): { tipo: string; mensagem: string } | { ok: unknown } => {
  try {
    return { ok: f() };
  } catch (e) {
    const x = e as Error;
    return { tipo: x.name, mensagem: x.message };
  }
};
const naoFinito = (texto: string) => /NaN|Infinity/.test(texto);

describe("funções unitárias de parser.py (gabarito)", () => {
  it.each(registros("parser.parse_valor").map((r) => [JSON.stringify(r.args[0]), r] as const))("parse_valor(%s)", (_n, r) => {
    expect(decimalPy(parseValor(r.args[0] as string | null))).toEqual(r.result);
  });

  it.each(registros("parser.parse_data").map((r) => [JSON.stringify(r.args[0]), r] as const))("parse_data(%s)", (_n, r) => {
    expect(parseData(r.args[0] as string | null)).toBe(r.result === null ? null : dataDe(r.result!));
  });

  it.each(registros("parser.extrair_numero_nf").map((r) => [r.args[0] as string, r] as const))("extrair_numero_nf(%s)", (_n, r) => {
    expect(extrairNumeroNf(r.args[0] as string)).toBe(r.result);
  });

  it.each(registros("parser.extrair_cnpj").map((r) => [r.args[0] as string, r] as const))("extrair_cnpj(%s)", (_n, r) => {
    expect(extrairCnpj(r.args[0] as string)).toBe(r.result);
  });

  it.each(registros("parser.classificar_tipo_operacao").map((r) => [JSON.stringify(r.args), r] as const))("classificar_tipo_operacao(%s)", (_n, r) => {
    expect(classificarTipoOperacao(r.args[0] as string, decimalDe(r.args[1]), decimalDe(r.args[2]))).toBe(r.result);
  });

  it.each(registros("parser._deduplicar_historico_linha").map((r) => [JSON.stringify(r.args[0]).slice(0, 70), r] as const))(
    "_deduplicar_historico_linha(%s)",
    (_n, r) => {
      expect(deduplicarHistoricoLinha(r.args[0] as string)).toBe(r.result);
    },
  );

  it.each(registros("parser._preprocessar_bloco").map((r, k) => [k, r] as const))("_preprocessar_bloco #%s", (_k, r) => {
    expect(preprocessarBloco(r.args[0] as string)).toBe(r.result);
  });

  it.each(registros("parser.calcular_hash_arquivo").map((r, k) => [k, r] as const))("calcular_hash_arquivo #%s", (_k, r) => {
    expect(calcularHashArquivo(arquivo(r.args[0]))).toBe(r.result);
  });

  it.each(registros("parser.detectar_formato_arquivo").map((r) => [(r.args[0] as { $arquivo: string }).$arquivo, r] as const))(
    "detectar_formato_arquivo(%s)",
    (_n, r) => {
      expect(erro(() => detectarFormatoArquivo(arquivo(r.args[0])))).toEqual(r.error ?? { ok: r.result });
    },
  );
});

const colunasPy = (c: ColunasDoCabecalho | null): Json =>
  c === null
    ? null
    : { valores: Object.fromEntries(c.valores), tolerancia: c.tolerancia, historico: c.historico, cta: c.cta, inicio_debito: c.inicioDebito };

const dadosDoBlocoPy = (d: DadosDoBloco | null): Json => {
  if (d === null) return null;
  const o: Objeto = {
    saldo_anterior: decimalPy(d.saldoAnterior),
    saldo_anterior_tipo: d.saldoAnteriorTipo,
    total_debito: decimalPy(d.totalDebito),
    total_credito: decimalPy(d.totalCredito),
    lancamentos: d.lancamentos.map(lancamentoPy),
  };
  if (d.semMovimento) o.sem_movimento = true;
  return o;
};

describe("as colunas e a leitura sem IA (gabarito)", () => {
  it.each(registros("parser._colunas_do_header").map((r, k) => [k, r] as const))("_colunas_do_header #%s", (_k, r) => {
    const obtido = colunasDoHeader(r.args[0] as string[]);
    expect(colunasPy(obtido)).toEqual(r.result);
    // A ordem das colunas de valor é a do cabeçalho (o dict do Python).
    if (obtido) expect([...obtido.valores.keys()]).toEqual(Object.keys((r.result as Objeto).valores as Objeto));
  });

  it.each(registros("parser._coluna_do_valor").map((r, k) => [k, r] as const))("_coluna_do_valor #%s", (_k, r) => {
    expect(colunaDoValor(r.args[0] as number, colunasDe(r.args[1]))).toBe(r.result);
  });

  it.each(registros("parser._valores_por_coluna").map((r, k) => [k, r] as const))("_valores_por_coluna #%s", (_k, r) => {
    const v = valoresPorColuna(r.args[0] as string, colunasDe(r.args[1]));
    expect(v === null ? null : { data: v.data, lote: v.lote, debito: decimalPy(v.debito), credito: decimalPy(v.credito) }).toEqual(r.result);
  });

  it.each(registros("parser._ler_linha_lancamento").map((r, k) => [k, r] as const))("_ler_linha_lancamento #%s", (_k, r) => {
    const l = lerLinhaLancamento(r.args[0] as string, colunasDe(r.args[1]));
    expect(l === null ? null : lancamentoPy(l)).toEqual(r.result);
  });

  it.each(registros("parser._e_continuacao_de_historico").map((r, k) => [k, r] as const))("_e_continuacao_de_historico #%s", (_k, r) => {
    expect(eContinuacaoDeHistorico(r.args[0] as string, colunasDe(r.args[1]))).toBe(r.result);
  });

  it.each(registros("parser.parsear_bloco_deterministico").map((r, k) => [k, r] as const))("parsear_bloco_deterministico #%s", (_k, r) => {
    expect(dadosDoBlocoPy(parsearBlocoDeterministico(r.args[0] as string[]))).toEqual(r.result);
  });

  it.each(registros("parser._identificar_fornecedor").map((r, k) => [k, r] as const))("_identificar_fornecedor #%s", (_k, r) => {
    const f = identificarFornecedor(r.args[0] as string[]);
    expect(f).toEqual(r.result === null ? null : tupla(r.result!));
  });

  it.each(registros("parser._parece_nome_fornecedor").map((r) => [r.args[0] as string, r] as const))("_parece_nome_fornecedor(%s)", (_n, r) => {
    expect(pareceNomeFornecedor(r.args[0] as string)).toBe(r.result);
  });
});

describe("a resposta da IA (gabarito)", () => {
  it.each(registros("parser._ia_decimal").map((r) => [r.args[0] as string, r] as const))("_ia_decimal(%s)", (_n, r) => {
    const obtido = erro(() => decimalPy(iaDecimal(jsonPython(r.args[0] as string))));
    if (!r.error && naoFinito((r.result as { $dec: string }).$dec)) {
      divergencias.naoFinito++;
      expect(obtido).toMatchObject({ tipo: "InvalidOperation" });
    } else if (r.error) expect(obtido).toEqual(r.error);
    else expect(obtido).toEqual({ ok: r.result });
  });

  it.each(registros("parser._ia_data").map((r) => [r.args[0] as string, r] as const))("_ia_data(%s)", (_n, r) => {
    expect(iaData(jsonPython(r.args[0] as string))).toBe(r.result === null ? null : dataDe(r.result!));
  });

  it.each(registros("parser._normalizar_lancamento_ia").map((r) => [(r.args[0] as string).slice(0, 80), r] as const))(
    "_normalizar_lancamento_ia(%s)",
    (_n, r) => {
      const l = normalizarLancamentoIa(jsonPython(r.args[0] as string));
      const esperado = r.result as Objeto | null;
      if (esperado && Object.values(esperado).some((v) => v && typeof v === "object" && "$dec" in v && naoFinito(v.$dec as string))) {
        divergencias.naoFinito++;
        expect(l).toBeNull();
      } else expect(l === null ? null : lancamentoPy(l)).toEqual(esperado);
    },
  );

  it.each(registros("parser._construir_fornecedor_de_ia").map((r, k) => [k, r] as const))("_construir_fornecedor_de_ia #%s", (_k, r) => {
    const obtido = erro(() => {
      const f = construirFornecedorDeIa(jsonPython(r.args[0] as string) as Map<string, never>, r.args[1] as string[]);
      return f === null ? null : fornecedorPy(f);
    });
    expect(obtido).toEqual(r.error ? r.error : { ok: r.result });
  });

  it.each(registros("parser._corrigir_colunas_por_posicao").map((r, k) => [k, r] as const))("_corrigir_colunas_por_posicao #%s", (_k, r) => {
    const lancamentos = (r.args[0] as Json[]).map(lancamentoDe);
    const obtido = corrigirColunasPorPosicao(lancamentos, r.args[1] as string[]).map(lancamentoPy);
    expect(projetar(obtido, r.result!)).toEqual(r.result);
  });
});

describe("duplicados e consolidação (gabarito)", () => {
  it.each(registros("parser._deduplicar_lancamentos").map((r, k) => [k, r] as const))("_deduplicar_lancamentos #%s", (_k, r) => {
    const [limpos, n] = deduplicarLancamentos((r.args[0] as Json[]).map(lancamentoDe));
    const esperado = tupla(r.result!);
    expect([projetar(limpos.map(lancamentoPy), esperado[0]), n]).toEqual(esperado);
  });

  it.each(registros("parser.consolidar_fornecedores_duplicados").map((r, k) => [k, r] as const))("consolidar_fornecedores_duplicados #%s", (_k, r) => {
    const obtido = consolidarFornecedoresDuplicados((r.args[0] as Json[]).map(fornecedorDe)).map(fornecedorPy);
    expect(projetar(obtido, r.result!)).toEqual(r.result);
  });

  it.each(registros("consolidador._serie_da_nota").map((r, k) => [k, r] as const))("_serie_da_nota #%s", (_k, r) => {
    expect(serieDaNota(lancamentoDe(r.args[0]))).toBe(r.result);
  });

  it.each(registros("consolidador.consolidar_lancamentos_fornecedor").map((r, k) => [k, r] as const))("consolidar_lancamentos_fornecedor #%s", (_k, r) => {
    const obtido = consolidarLancamentosFornecedor((r.args[0] as Json[]).map(lancamentoDe)).map(lancamentoPy);
    expect(projetar(obtido, r.result!)).toEqual(r.result);
  });

  it.each(registros("consolidador.consolidar_todos_fornecedores").map((r, k) => [k, r] as const))("consolidar_todos_fornecedores #%s", (_k, r) => {
    const obtido = razaoPy(consolidarTodosFornecedores(razaoDe(r.args[0])));
    const esperado = totaisComoDecimal(r.result!);
    expect(projetar(obtido, esperado)).toEqual(esperado);
  });

  it("a suíte do original está no gabarito", () => {
    const daSuite = registros("parser.consolidar_fornecedores_duplicados").filter((r) => r.suite).length;
    expect(daSuite).toBeGreaterThan(0);
    expect(registros("parser.parsear_bloco_deterministico").filter((r) => r.suite).length).toBeGreaterThan(0);
    expect(registros("consolidador.consolidar_lancamentos_fornecedor").filter((r) => r.suite).length).toBeGreaterThan(0);
  });
});

type Config = { chave: boolean; allow: boolean; respostas: Regra[] };

async function rodar(r: Registro) {
  const c = r.args[1] as unknown as Config;
  const { ia, feitas } = iaSimulada(c.chave, c.respostas);
  const quem = { tenantId: "escritorio-teste", documentosFinanceirosLiberados: c.allow };
  const saida: { result?: Json; processado?: Json; error?: { tipo: string; mensagem: string } } = {};
  try {
    const lido = await parsearArquivoRazao(arquivo(r.args[0]), quem, { ia });
    saida.result = razaoPy(lido.razao);
    // O que o envio fazia depois (o mesmo de `lerRazaoDeFornecedores`).
    const razao = consolidarTodosFornecedores(lido.razao);
    const incertos = razao.fornecedores.flatMap((f) => f.lancamentos.filter((l) => l.classificacaoIncerta));
    if (incertos.length) await classificarLancamentosIncertos(incertos, quem, ia);
    saida.processado = razaoPy(razao);
  } catch (e) {
    saida.error = { tipo: (e as Error).name, mensagem: (e as Error).message };
  }
  return { saida, feitas };
}

const PREFIXO_DO_PDF = "Erro ao extrair texto do PDF: ";

function conferirSaida(obtido: { result?: Json; processado?: Json; error?: { tipo: string; mensagem: string } }, esperado: NonNullable<Registro["sem_ia"]>) {
  if (esperado.error) {
    expect(obtido.error?.tipo).toBe(esperado.error.tipo);
    if (esperado.error.mensagem.startsWith(PREFIXO_DO_PDF) && obtido.error?.mensagem !== esperado.error.mensagem) {
      divergencias.mensagemDoPdf++;
      expect(obtido.error?.mensagem.startsWith(PREFIXO_DO_PDF)).toBe(true);
    } else expect(obtido.error?.mensagem).toBe(esperado.error.mensagem);
    return;
  }
  expect(obtido.error).toBeUndefined();
  expect(obtido.result).toEqual(esperado.result);
  const processado = totaisComoDecimal(esperado.processado!);
  expect(projetar(obtido.processado!, processado)).toEqual(processado);
}

describe("leitura inteira do Razão, com a IA simulada (cenários do gabarito)", () => {
  const cenarios = registros("razao.cenario");

  it("o gabarito traz os cenários de cada ramo", () => {
    expect(cenarios.length).toBeGreaterThan(100);
    expect(cenarios.map((c) => c.nome)).toEqual(
      expect.arrayContaining(["simples-chave-liberada", "formato-6-chave-liberada", "cinco-paginas-lote-2-falha-chave-liberada", "planilha-xls", "zip"]),
    );
  });

  it.each(cenarios.map((c) => [c.nome!, c] as const))("%s", async (_nome, r) => {
    const c = r.args[1] as unknown as Config;
    const { saida, feitas } = await rodar(r);
    if (c.chave && !c.allow) {
      // No Connect a chave do escritório desligada não manda nada: a saída é a do original sem a IA.
      expect(feitas).toEqual([]);
      conferirSaida(saida, r.sem_ia!);
      if (r.chamadas_ia!.length) divergencias.chaveDoEscritorio++;
      return;
    }
    conferirSaida(saida, r);
    conferirChamadas(feitas, r.chamadas_ia!);
  });

  it("lerRazaoDeFornecedores é a leitura com a consolidação e a classificação", async () => {
    const r = cenarios.find((c) => c.nome === "sem-total-chave-liberada")!;
    const { ia, feitas } = iaSimulada(true, (r.args[1] as unknown as Config).respostas);
    const lido = await lerRazaoDeFornecedores(arquivo(r.args[0]), { tenantId: "t", documentosFinanceirosLiberados: true }, { ia });
    expect(projetar(razaoPy(lido.razao), totaisComoDecimal(r.processado!))).toEqual(totaisComoDecimal(r.processado!));
    conferirChamadas(feitas, r.chamadas_ia!);
    expect(lido.diagnostico).toEqual({ blocos: 3, deterministicos: 1, porTexto: 0, porImagem: 1, descartados: 1, iaIndisponivel: null });
  });

  it("sem a chave, o diagnóstico diz onde ligar e nada vai à IA", async () => {
    const r = cenarios.find((c) => c.nome === "sem-total-chave-bloqueada")!;
    const { ia, feitas } = iaSimulada(true, []);
    const lido = await lerRazaoDeFornecedores(arquivo(r.args[0]), { tenantId: "t", documentosFinanceirosLiberados: false }, { ia });
    expect(feitas).toEqual([]);
    expect(lido.diagnostico?.iaIndisponivel).toMatch(/Contábil Core › Configurações › Leitura de documentos por IA/);
    expect(lido.diagnostico?.descartados).toBe(2);
  });

  it("extrairTextoPdf junta as páginas com texto (no original, sempre falhava com NameError)", async () => {
    for (const r of registros("parser.pdf_candidatos")) {
      const paginas = (r.result as { paginas: string[] }).paginas;
      expect(await extrairTextoPdf(arquivo(r.args[0]))).toBe(paginas.filter(Boolean).join("\n\n"));
    }
  });

  it("os prompts são os do original (com o nome do exemplo trocado por um fictício)", async () => {
    const ia = await import("./ia");
    expect(ia.PARSE_SYSTEM_PROMPT).toBe(PROMPTS.PARSE);
    expect(ia.VISION_SYSTEM_PROMPT).toBe(PROMPTS.VISION);
    expect(ia.CLASSIFY_SYSTEM_PROMPT).toBe(PROMPTS.CLASSIFY);
    expect(LIMITES.maxTokens).toBe(16_000);
  });

  afterAll(() => {
    // Cada divergência deliberada, contada.
    expect(divergencias).toEqual({ naoFinito: 3, chaveDoEscritorio: 31, mensagemDoPdf: 6 });
  });
});
