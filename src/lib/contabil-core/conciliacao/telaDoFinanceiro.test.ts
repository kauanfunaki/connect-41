// A conferência do financeiro na tela: porte do `scripts/test-concilpro-financeiro.mjs` do Contábil
// Core (as verificações da lógica pura; o contrato HTTP fica nos testes das rotas).
import { describe, expect, it } from "vitest";
import type { LinhaFinanceiroJson, VinculoFinanceiro } from "./financeiroTipos";
import {
  COMPARACOES_POR_BASE,
  PARES_DE_COMPARACAO,
  TODAS,
  alternarSugestao,
  bloqueioDaSugestao,
  categoriasDe,
  comparacaoValida,
  enviarEmSequencia,
  filtrarLinhas,
  foraDoPeriodo,
  indexarLinha,
  indiceDasLinhas,
  itensUsados,
  loteDeSugestoes,
  nomeDaComparacao,
  novoVinculoFinanceiro,
  paginaDaLinha,
  pendenciasDoEnvio,
  podeRegistrarFinanceiro,
  situacaoDaSelecao,
  sugestoesDaResposta,
  totaisDoFinanceiro,
  validarInicio,
} from "./telaDoFinanceiro";

const linha = (id: string, valor: string, sentido: "ENTRADA" | "SAIDA" = "SAIDA", data = "2026-09-02") => ({ id, valor, sentido, data });

const completa = (id: string, parcial: Partial<LinhaFinanceiroJson> = {}): LinhaFinanceiroJson => ({
  id,
  ordem: null,
  ordemFonte: null,
  fonteId: "f1",
  tipoFonte: "FINANCEIRO",
  sentido: "SAIDA",
  data: "2026-09-02",
  valor: "-1.00",
  historico: "Pagamento",
  favorecido: null,
  documento: null,
  documentoFavorecido: null,
  categoria: null,
  parcela: null,
  banco: null,
  referencia: "Linha 8",
  observacao: null,
  ...parcial,
});

describe("totais da seleção", () => {
  it("valores de fontes diferentes são comparados, nunca somados entre si", () => {
    expect(totaisDoFinanceiro([linha("f1", "-0.10"), linha("f2", "-0.20")], [linha("e1", "-0.30")])).toEqual({
      totalFinanceiro: "0.30",
      totalComparacao: "0.30",
      diferenca: "0.00",
      temDiferenca: false,
      mesmoSentido: true,
      datasDiferentes: false,
    });
  });

  it("a diferença é comparação menos financeiro", () => {
    expect(totaisDoFinanceiro([linha("f", "-100.00")], [linha("e", "-90.00")]).diferenca).toBe("-10.00");
  });

  it("entradas usam o módulo nos dois totais", () => {
    const t = totaisDoFinanceiro([linha("f", "10.20", "ENTRADA")], [linha("e", "10.20", "ENTRADA")]);
    expect(t.totalFinanceiro).toBe("10.20");
    expect(t.temDiferenca).toBe(false);
  });

  it("entradas e saídas misturadas não são uma composição válida", () => {
    expect(totaisDoFinanceiro([linha("f", "-1.00")], [linha("e", "1.00", "ENTRADA")]).mesmoSentido).toBe(false);
  });

  it("diferença de data aparece mesmo com valores iguais", () => {
    const t = totaisDoFinanceiro([linha("f", "-1.00")], [linha("e", "-1.00", "SAIDA", "2026-09-03")]);
    expect(t.temDiferenca).toBe(false);
    expect(t.datasDiferentes).toBe(true);
  });

  it("soma exata acima do que o `Number` do original guardava (lá virava 'Valor fora do limite')", () => {
    const t = totaisDoFinanceiro(Array(10).fill(linha("f", "-9999999999999.99")), [linha("e", "-1.00")]);
    expect(t.totalFinanceiro).toBe("99999999999999.90");
    expect(t.diferenca).toBe("-99999999999998.90");
  });
});

describe("período e justificativa", () => {
  it("data coincidente fora do período continua pedindo conferência explícita", () => {
    expect(foraDoPeriodo([linha("f", "-1.00", "SAIDA", "2026-08-31"), linha("e", "-1.00", "SAIDA", "2026-08-31")], "2026-09-01", "2026-09-30")).toBe(true);
    expect(foraDoPeriodo([linha("f", "-1.00", "SAIDA", "2026-10-01")], "2026-09-01", "2026-09-30")).toBe(true);
    expect(foraDoPeriodo([linha("f", "-1.00", "SAIDA", "2026-09-01")], "2026-09-01", "2026-09-30")).toBe(false);
    expect(foraDoPeriodo([linha("f", "-1.00", "SAIDA", "2026-09-30")], "2026-09-01", "2026-09-30")).toBe(false);
  });

  it("com sugestões marcadas, só a sugestão com datas diferentes dentro dela pede justificativa", () => {
    const base = { financeiro: [linha("f", "-1.00")], comparacao: [linha("e", "-1.00", "SAIDA", "2026-09-03")], periodoInicio: "2026-09-01", periodoFim: "2026-09-30" };
    expect(situacaoDaSelecao({ ...base, marcadas: [] }).precisaJustificativa).toBe(true);
    expect(situacaoDaSelecao({ ...base, marcadas: [{ exigeJustificativa: false }] }).precisaJustificativa).toBe(false);
    expect(situacaoDaSelecao({ ...base, marcadas: [{ exigeJustificativa: true }] }).datasDiferentes).toBe(true);
  });

  it("registrar pede os dois lados, a mesma natureza, comparação válida e observação quando há diferença", () => {
    const situacao = situacaoDaSelecao({ financeiro: [linha("f", "-1.00")], comparacao: [linha("e", "-2.00")], marcadas: [], periodoInicio: "2026-09-01", periodoFim: "2026-09-30" });
    const p = { ocupado: false, comparacaoValida: true, qtdFinanceiro: 1, qtdComparacao: 1, situacao, observacao: "" };
    expect(podeRegistrarFinanceiro(p)).toBe(false);
    expect(podeRegistrarFinanceiro({ ...p, observacao: "  juros  " })).toBe(true);
    expect(podeRegistrarFinanceiro({ ...p, observacao: "x", comparacaoValida: false })).toBe(false);
    expect(podeRegistrarFinanceiro({ ...p, observacao: "x", qtdComparacao: 0 })).toBe(false);
    expect(podeRegistrarFinanceiro({ ...p, observacao: "x", ocupado: true })).toBe(false);
  });

  it("extrato mudado bloqueia só as conferências com o Extrato", () => {
    const analise = { extratoValido: false };
    expect(comparacaoValida(analise, "EXTRATO")).toBe(false);
    expect(comparacaoValida(analise, "SISPAG")).toBe(true);
    expect(comparacaoValida(analise, "RAZAO_DETALHADO")).toBe(true);
    expect(comparacaoValida({ extratoValido: true }, "EXTRATO")).toBe(true);
  });
});

describe("busca", () => {
  it("inclui categoria, CPF/CNPJ, referência e a data brasileira, sem acentos", () => {
    const t = indexarLinha(completa("f", { favorecido: "João", documentoFavorecido: "12345678000190", categoria: "Manutenção" }));
    expect(t).toContain("joao");
    expect(t).toContain("manutencao");
    expect(t).toContain("12345678000190");
    expect(t).toContain("linha 8");
    expect(t).toContain("02/09/2026");
    expect(t).toContain("r$ -1,00");
  });

  it("campo ausente não vira 'null' nem 'undefined'", () => {
    const t = indexarLinha(completa("f"));
    expect(t).not.toContain("undefined");
    expect(t).not.toContain("null");
  });

  it("filtra por arquivo, natureza, data, categoria, busca e esconde os já conferidos", () => {
    const linhas = [
      completa("a", { categoria: "Aluguel" }),
      completa("b", { fonteId: "f2", sentido: "ENTRADA", valor: "5.00" }),
      completa("c", { data: "2026-09-05", historico: "Energia" }),
    ];
    const indice = indiceDasLinhas(linhas);
    const f = { mostrarVinculados: false, fonte: TODAS, natureza: TODAS, data: "", categoria: TODAS, busca: "" };
    const ids = (r: LinhaFinanceiroJson[]) => r.map((l) => l.id);
    expect(ids(filtrarLinhas(linhas, new Set(["a"]), indice, f))).toEqual(["b", "c"]);
    expect(ids(filtrarLinhas(linhas, new Set(["a"]), indice, { ...f, mostrarVinculados: true }))).toEqual(["a", "b", "c"]);
    expect(ids(filtrarLinhas(linhas, new Set(), indice, { ...f, fonte: "f2" }))).toEqual(["b"]);
    expect(ids(filtrarLinhas(linhas, new Set(), indice, { ...f, natureza: "SAIDA" }))).toEqual(["a", "c"]);
    expect(ids(filtrarLinhas(linhas, new Set(), indice, { ...f, data: "2026-09-05" }))).toEqual(["c"]);
    expect(ids(filtrarLinhas(linhas, new Set(), indice, { ...f, categoria: "Aluguel" }))).toEqual(["a"]);
    expect(ids(filtrarLinhas(linhas, new Set(), indice, { ...f, busca: " ENERGIA " }))).toEqual(["c"]);
    expect(categoriasDe([...linhas, completa("d", { categoria: "Água" })])).toEqual(["Água", "Aluguel"]);
  });

  it("a página da linha em foco", () => {
    const muitas = Array.from({ length: 120 }, (_, i) => ({ id: `l${i}` }));
    expect(paginaDaLinha(muitas, "l0")).toBe(0);
    expect(paginaDaLinha(muitas, "l50")).toBe(1);
    expect(paginaDaLinha(muitas, "l119")).toBe(2);
    expect(paginaDaLinha(muitas, "x")).toBeNull();
  });
});

describe("vínculos já registrados", () => {
  const v = (tipoComparacao: VinculoFinanceiro["tipoComparacao"], estado: VinculoFinanceiro["estado"], financeiroIds: string[], comparacaoIds: string[]) => ({
    tipoComparacao,
    estado,
    financeiroIds,
    comparacaoIds,
  });
  const vinculos = [v("EXTRATO", "ATIVO", ["f1"], ["e1"]), v("SISPAG", "ATIVO", ["f2"], ["s1"]), v("EXTRATO", "DESFEITO", ["f3"], ["e2"])];

  it("o uso é isolado por tipo de comparação; conferência com SISPAG não bloqueia o extrato", () => {
    const usados = itensUsados(vinculos, "EXTRATO");
    expect([...usados.financeiro]).toEqual(["f1"]);
    expect([...usados.comparacao]).toEqual(["e1"]);
  });

  it("desfazer libera só as referências daquele vínculo", () => {
    expect(itensUsados(vinculos, "EXTRATO").financeiro.has("f3")).toBe(false);
  });

  it("Razão × SISPAG não bloqueia o mesmo lançamento em Financeiro × Razão", () => {
    const comRazao = [v("RAZAO", "ATIVO", ["f1"], ["r1"]), v("RAZAO_SISPAG", "ATIVO", ["r2"], ["s1"])];
    expect([...itensUsados(comRazao, "RAZAO_SISPAG").financeiro]).toEqual(["r2"]);
    expect(itensUsados(comRazao, "RAZAO_SISPAG").financeiro.has("r1")).toBe(false);
  });
});

describe("pares de comparação", () => {
  it("o Razão como base oferece extrato detalhado e SISPAG, cada um com seu documento", () => {
    expect(PARES_DE_COMPARACAO.RAZAO_SISPAG).toEqual({ base: "RAZAO", origem: "SISPAG" });
    expect(COMPARACOES_POR_BASE.RAZAO).toEqual(["RAZAO_DETALHADO", "RAZAO_SISPAG"]);
    expect(PARES_DE_COMPARACAO.RAZAO_DETALHADO).toEqual({ base: "RAZAO", origem: "EXTRATO_DETALHADO" });
    expect(nomeDaComparacao("RAZAO_DETALHADO")).toBe("Razão da conta banco × Extrato detalhado Itaú");
    expect(nomeDaComparacao("RAZAO_SISPAG")).toBe("Razão da conta banco × SISPAG");
    expect(nomeDaComparacao("SISPAG")).toBe("Financeiro da empresa × SISPAG");
  });
});

describe("sugestões marcadas", () => {
  const s = (id: string, financeiroIds: string[], comparacaoIds: string[]) => ({ id, financeiroIds, comparacaoIds });

  it("acumulam, e marcar de novo desmarca só aquela", () => {
    const a = s("a", ["r1"], ["d1"]);
    const b = s("b", ["r2"], ["d2"]);
    const duas = alternarSugestao(alternarSugestao([], a), b);
    expect(duas.map((x) => x.id)).toEqual(["a", "b"]);
    expect(alternarSugestao(duas, a).map((x) => x.id)).toEqual(["b"]);
  });

  it("ambígua que divide movimento com uma marcada fica bloqueada; natureza diferente também", () => {
    const sentido = () => "SAIDA" as const;
    const marcadas = [s("a", ["r1"], ["d1"])];
    expect(bloqueioDaSugestao(s("b", ["r1"], ["d9"]), marcadas, sentido)).toMatch(/outra sugestão marcada/);
    expect(bloqueioDaSugestao(s("c", ["r9"], ["d1"]), marcadas, sentido)).toMatch(/outra sugestão marcada/);
    expect(bloqueioDaSugestao(s("d", ["r2"], ["d2"]), marcadas, sentido)).toBeNull();
    expect(bloqueioDaSugestao(marcadas[0], marcadas, sentido)).toBeNull();
    const entrada = (id: string) => (id === "r3" ? "ENTRADA" : "SAIDA");
    expect(bloqueioDaSugestao(s("e", ["r3"], ["d3"]), marcadas, entrada)).toMatch(/Natureza diferente/);
  });

  it("vão juntas, com uma versão, para o lote", () => {
    expect(loteDeSugestoes(7, [s("a", ["r1"], ["d1"]), s("b", ["r2"], ["d2", "d3"])], "  ok ")).toEqual({
      versao: 7,
      observacao: "ok",
      sugestoes: [
        { sugestaoId: "a", financeiroIds: ["r1"], comparacaoIds: ["d1"] },
        { sugestaoId: "b", financeiroIds: ["r2"], comparacaoIds: ["d2", "d3"] },
      ],
    });
  });

  it("a resposta da rota é conferida: sem id ou sem um dos lados, a sugestão some", () => {
    const r = sugestoesDaResposta({
      items: [
        { id: "a", financeiroIds: ["f"], comparacaoIds: ["e"], motivo: "Mesmo valor", ambigua: true, alertas: ["x", 3], exigeJustificativa: true },
        { id: "b", financeiroIds: [], comparacaoIds: ["e"] },
        { financeiroIds: ["f"], comparacaoIds: ["e"] },
      ],
      avisos: ["Limite de busca atingido."],
    });
    expect(r.itens).toEqual([{ id: "a", financeiroIds: ["f"], comparacaoIds: ["e"], motivo: "Mesmo valor", ambigua: true, alertas: ["x"], exigeJustificativa: true }]);
    expect(r.avisos).toEqual(["Limite de busca atingido."]);
    expect(sugestoesDaResposta(null)).toEqual({ itens: [], avisos: [] });
  });
});

describe("conferência manual", () => {
  it("manda só referências, versão e observação, na ordem dos documentos", () => {
    const analise = { versao: 4, linhas: [completa("f1"), completa("e2", { tipoFonte: "EXTRATO" }), completa("e1", { tipoFonte: "EXTRATO" })] };
    expect(novoVinculoFinanceiro(analise, new Set(["f1"]), new Set(["e1", "e2"]), " Conferido ")).toEqual({
      versao: 4,
      sugestaoId: null,
      financeiroIds: ["f1"],
      comparacaoIds: ["e2", "e1"],
      observacao: "Conferido",
    });
  });
});

describe("início", () => {
  it("informa todas as exigências em vez de desabilitar em silêncio", () => {
    expect(validarInicio("", "", "")).toEqual(["Selecione a conta bancária da comparação.", "Informe a data inicial do período.", "Informe a data final do período."]);
  });

  it("a conta escolhida não substitui as datas", () => {
    expect(validarInicio("conta", "", "")).toHaveLength(2);
    expect(validarInicio("conta", "2026-09-01", "")).toEqual(["Informe a data final do período."]);
  });

  it("recusa período invertido e aceita um dia só", () => {
    expect(validarInicio("conta", "2026-09-30", "2026-09-01")).toEqual(["A data final deve ser igual ou posterior à inicial."]);
    expect(validarInicio("conta", "2026-09-01", "2026-09-30")).toEqual([]);
    expect(validarInicio("conta", "2026-09-01", "2026-09-01")).toEqual([]);
  });

  it("os arquivos: o do lado base, o da origem (menos o extrato) e a confirmação da empresa", () => {
    const p = { base: "FINANCEIRO" as const, origem: "EXTRATO" as const, arquivos: 0, temArquivoDaOrigem: false, confirmouEmpresa: false };
    expect(pendenciasDoEnvio(p)).toEqual(["Selecione ao menos um documento do financeiro."]);
    expect(pendenciasDoEnvio({ ...p, arquivos: 2 })).toEqual(["Confirme que os arquivos pertencem à empresa selecionada."]);
    expect(pendenciasDoEnvio({ ...p, arquivos: 2, confirmouEmpresa: true })).toEqual([]);
    expect(pendenciasDoEnvio({ ...p, base: "RAZAO", origem: "SISPAG", arquivos: 1, confirmouEmpresa: true })).toEqual(["Selecione o arquivo de SISPAG."]);
  });
});

describe("envio dos documentos em série", () => {
  const arquivo = (nome: string) => new File(["dados"], nome);

  it("dois arquivos do financeiro e um SISPAG, cada um com a versão que o anterior devolveu", async () => {
    const documentos = (["FINANCEIRO", "FINANCEIRO", "SISPAG"] as const).map((tipo) => ({ tipo, arquivo: arquivo(`${tipo}.xlsx`) }));
    const chamadas: { versao: number; tipo: string }[] = [];
    const r = await enviarEmSequencia({ versao: 1 }, documentos, async (analise, d) => {
      chamadas.push({ versao: analise.versao, tipo: d.tipo });
      return { ok: true as const, valor: { versao: analise.versao + 1 } };
    });
    expect(chamadas).toEqual([
      { versao: 1, tipo: "FINANCEIRO" },
      { versao: 2, tipo: "FINANCEIRO" },
      { versao: 3, tipo: "SISPAG" },
    ]);
    expect(r.analise.versao).toBe(4);
    expect(r.enviados).toHaveLength(3);
    expect(r.erro).toBeNull();
  });

  it("a falha guarda o progresso: não envia os seguintes nem repete os anteriores", async () => {
    const documentos = (["FINANCEIRO", "RAZAO", "FINANCEIRO"] as const).map((tipo) => ({ tipo, arquivo: arquivo(`${tipo}.xlsx`) }));
    let chamadas = 0;
    const r = await enviarEmSequencia({ versao: 1 }, documentos, async (analise) => {
      chamadas += 1;
      if (chamadas === 2) return { ok: false as const, erro: "Documento inválido" };
      return { ok: true as const, valor: { versao: analise.versao + 1 } };
    });
    expect(chamadas).toBe(2);
    expect(r.analise.versao).toBe(2);
    expect(r.enviados).toEqual([documentos[0]]);
    expect(r.erro).toBe("Documento inválido");
  });
});
