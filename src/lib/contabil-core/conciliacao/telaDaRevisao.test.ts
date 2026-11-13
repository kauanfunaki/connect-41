// A revisão manual na tela: seleção, totais exatos, filtros e paginação.
import { describe, expect, it } from "vitest";
import type { LinhaExtratoRevisao, LinhaRazaoRevisao, Revisao, VinculoRevisao } from "./revisaoTipos";
import {
  chaveConta,
  contasDaOrigem,
  escolherExtrato,
  extratoInicial,
  filtrarExtrato,
  filtrarRazao,
  indiceDoExtrato,
  indiceDoRazao,
  naturezaDaComposicao,
  nomeDaRevisao,
  novoVinculo,
  paginaDe,
  podeRegistrar,
  razaoIndisponivel,
  registroManual,
  textoBusca,
  totaisDaSelecao,
  usadosNaRevisao,
} from "./telaDaRevisao";

const ext = (id: string, valor: string, parcial: Partial<LinhaExtratoRevisao> = {}): LinhaExtratoRevisao => ({
  transacaoId: id,
  data: "2026-09-02",
  valor,
  historico: `PIX ${id}`,
  documento: null,
  favorecido: null,
  ...parcial,
});

const raz = (id: string, d: string, c: string, parcial: Partial<LinhaRazaoRevisao> = {}): LinhaRazaoRevisao => ({
  id,
  fonteId: "f1",
  tipoFonte: "RAZAO_BANCO",
  referenciaId: null,
  data: "2026-09-02",
  contaCodigo: "2699",
  contaClassificacao: "1.1.1.02",
  contaDescricao: "Banco Itaú",
  historico: `Lançamento ${id}`,
  lote: "10",
  contrapartida: "",
  documento: null,
  favorecido: null,
  valorDebito: d,
  valorCredito: c,
  ...parcial,
});

const vinculo = (parcial: Partial<VinculoRevisao>): VinculoRevisao => ({
  id: "v1",
  extratoIds: [],
  razaoItens: [],
  totalExtrato: "0",
  totalRazao: "0",
  diferenca: "0",
  observacao: "",
  estado: "ATIVO",
  responsavel: "Pessoa",
  criadoEm: "2026-11-12T10:00:00Z",
  desfeitoPor: null,
  desfeitoEm: null,
  motivoDesfazer: null,
  ...parcial,
});

function revisao(parcial: Partial<Revisao> = {}): Revisao {
  return {
    id: "r1",
    agenciaId: "a1",
    nomeArquivo: "razao.xlsx",
    titulo: null,
    contaBancaria: "ITAU 1234",
    periodoInicio: "2026-09-01",
    periodoFim: "2026-09-30",
    versao: 3,
    criadaEm: "2026-11-12T10:00:00Z",
    atualizadaEm: "2026-11-12T10:00:00Z",
    relatorio: {} as Revisao["relatorio"],
    fontes: [],
    linhasRazao: [raz("r0", "0.00", "0.10"), raz("r1", "0.00", "0.20"), raz("r2", "50.00", "0.00")],
    extrato: [ext("e1", "-0.10"), ext("e2", "-0.20"), ext("e3", "50.00"), ext("e4", "0.00")],
    vinculos: [],
    avisos: [],
    fontesValidas: true,
    ...parcial,
  };
}

describe("vínculos já registrados", () => {
  it("só os ativos bloqueiam extrato e Razão, e o selo diz se a pendência foi conferida toda ou em parte", () => {
    const r = revisao({
      vinculos: [
        vinculo({ extratoIds: ["e1"], razaoItens: [{ linhaId: "r0", dc: "C" }] }),
        vinculo({ id: "v2", estado: "DESFEITO", extratoIds: ["e2"], razaoItens: [{ linhaId: "r1", dc: "C" }] }),
      ],
    });
    const usados = usadosNaRevisao(r);
    expect([...usados.extrato]).toEqual(["e1"]);
    expect([...usados.razao]).toEqual(["r0"]);
    const grupo = { extrato: [{ transacaoId: "e1", data: "", valor: "", historico: "" }, { transacaoId: "e2", data: "", valor: "", historico: "" }] };
    expect(registroManual(grupo, usados.extrato)).toBe("Conferência parcial (1/2)");
    expect(registroManual({ extrato: grupo.extrato.slice(0, 1) }, usados.extrato)).toBe("Conferência manual registrada");
    expect(registroManual({ extrato: [] }, usados.extrato)).toBeNull();
  });

  it("a seleção inicial pela pendência ignora o extrato já vinculado, o de outra revisão e o de valor zero", () => {
    const r = revisao({ vinculos: [vinculo({ extratoIds: ["e1"] })] });
    expect([...extratoInicial(r, ["e1", "e2", "outra", "e4"])]).toEqual(["e2"]);
  });
});

describe("totais da composição", () => {
  it("soma exata em decimal: 0,10 + 0,20 fecha com 0,30 sem sobra de ponto flutuante", () => {
    const r = revisao({ linhasRazao: [raz("r0", "0.00", "0.30")] });
    const t = totaisDaSelecao(r, new Set(["e1", "e2"]), new Set(["r0"]), "C");
    expect(t).toEqual({ totalExtrato: "0.30", totalRazao: "0.30", diferenca: "0.00", temDiferenca: false, mesmoSentido: true });
  });

  it("entrada e saída juntas não formam composição, e a diferença pede observação", () => {
    const r = revisao();
    const misto = totaisDaSelecao(r, new Set(["e1", "e3"]), new Set(["r2"]), "D");
    expect(misto.mesmoSentido).toBe(false);
    const comDiferenca = totaisDaSelecao(r, new Set(["e3"]), new Set(["r2", "r0"]), "D");
    expect(comDiferenca.diferenca).toBe("0.00");
    const falta = totaisDaSelecao(r, new Set(["e1", "e2"]), new Set(["r0"]), "C");
    expect(falta).toMatchObject({ totalExtrato: "0.30", totalRazao: "0.10", diferenca: "-0.20", temDiferenca: true });
    const base = { fontesValidas: true, ocupado: false, qtdExtrato: 2, qtdRazao: 1, totais: falta };
    expect(podeRegistrar({ ...base, observacao: "  " })).toBe(false);
    expect(podeRegistrar({ ...base, observacao: "Tarifa cobrada à parte" })).toBe(true);
    expect(podeRegistrar({ ...base, observacao: "x", fontesValidas: false })).toBe(false);
    expect(podeRegistrar({ ...base, observacao: "x", totais: misto })).toBe(false);
    expect(podeRegistrar({ ...base, observacao: "x", qtdRazao: 0 })).toBe(false);
  });

  it("a coluna do Razão: entrada usa débito, saída usa crédito; no apoio, a escolhida", () => {
    const r = revisao();
    expect(naturezaDaComposicao([r.extrato[2]], "RAZAO_BANCO", "C")).toBe("D");
    expect(naturezaDaComposicao([r.extrato[0]], "RAZAO_BANCO", "D")).toBe("C");
    expect(naturezaDaComposicao([], "RAZAO_BANCO", "D")).toBe("C");
    expect(naturezaDaComposicao([r.extrato[0]], "RAZAO_APOIO", "D")).toBe("D");
  });

  it("trocar a primeira linha do extrato de saída para entrada limpa o Razão escolhido", () => {
    const r = revisao();
    expect(escolherExtrato(r, new Set(), "e3", "RAZAO_BANCO", "C")).toEqual({ extrato: new Set(["e3"]), limparRazao: true });
    expect(escolherExtrato(r, new Set(["e1"]), "e2", "RAZAO_BANCO", "C").limparRazao).toBe(false);
    expect(escolherExtrato(r, new Set(), "e3", "RAZAO_APOIO", "C").limparRazao).toBe(false);
  });

  it("o Razão sem valor na coluna, ou sem extrato escolhido na conta do banco, fica indisponível", () => {
    const l = raz("r9", "10.00", "0.00");
    expect(razaoIndisponivel(l, "D", "RAZAO_BANCO", false)).toMatch(/Escolha um lançamento do extrato/);
    expect(razaoIndisponivel(l, "C", "RAZAO_BANCO", true)).toMatch(/créditos/);
    expect(razaoIndisponivel(l, "D", "RAZAO_BANCO", true)).toBeNull();
    expect(razaoIndisponivel(l, "D", "RAZAO_APOIO", false)).toBeNull();
  });

  it("o vínculo vai na ordem dos documentos, com a versão e a observação aparada", () => {
    const r = revisao();
    expect(novoVinculo(r, new Set(["e2", "e1"]), new Set(["r1", "r0"]), "C", "  ok  ")).toEqual({
      versao: 3,
      extratoIds: ["e1", "e2"],
      razaoItens: [
        { linhaId: "r0", dc: "C" },
        { linhaId: "r1", dc: "C" },
      ],
      observacao: "ok",
    });
  });
});

describe("filtros e paginação", () => {
  it("a busca ignora acento e caixa, e acha pela data e pelo valor em reais", () => {
    expect(textoBusca("Ação TARIFA")).toBe("acao tarifa");
    const extrato = [ext("e1", "-1234.50", { historico: "Tarifa Bancária" }), ext("e2", "10.00", { data: "2026-09-03" })];
    const indice = indiceDoExtrato(extrato);
    const f = { mostrarVinculados: false, data: "", busca: "" };
    expect(filtrarExtrato(extrato, new Set(), indice, { ...f, busca: "bancaria" }).map((l) => l.transacaoId)).toEqual(["e1"]);
    expect(filtrarExtrato(extrato, new Set(), indice, { ...f, busca: "1.234,50" }).map((l) => l.transacaoId)).toEqual(["e1"]);
    expect(filtrarExtrato(extrato, new Set(), indice, { ...f, busca: "03/09/2026" }).map((l) => l.transacaoId)).toEqual(["e2"]);
    expect(filtrarExtrato(extrato, new Set(), indice, { ...f, data: "2026-09-03" }).map((l) => l.transacaoId)).toEqual(["e2"]);
    expect(filtrarExtrato(extrato, new Set(["e1"]), indice, f).map((l) => l.transacaoId)).toEqual(["e2"]);
    expect(filtrarExtrato(extrato, new Set(["e1"]), indice, { ...f, mostrarVinculados: true })).toHaveLength(2);
  });

  it("o Razão filtra pela origem, pela conta (código + classificação) e pela busca", () => {
    const linhas = [
      raz("r0", "1.00", "0.00"),
      raz("r1", "1.00", "0.00", { tipoFonte: "RAZAO_APOIO", contaCodigo: "300", contaClassificacao: "2.1.3", contaDescricao: "FGTS a Recolher" }),
      raz("r2", "1.00", "0.00", { tipoFonte: "RAZAO_APOIO", contaCodigo: "300", contaClassificacao: "2.1.4", contaDescricao: "INSS a Recolher" }),
    ];
    const indice = indiceDoRazao(linhas);
    const f = { tipoFonte: "RAZAO_APOIO" as const, mostrarVinculados: false, conta: "todas", busca: "" };
    expect(filtrarRazao(linhas, new Set(), indice, f).map((l) => l.id)).toEqual(["r1", "r2"]);
    expect(filtrarRazao(linhas, new Set(), indice, { ...f, conta: chaveConta(linhas[2]) }).map((l) => l.id)).toEqual(["r2"]);
    expect(filtrarRazao(linhas, new Set(), indice, { ...f, busca: "fgts" }).map((l) => l.id)).toEqual(["r1"]);
    expect(contasDaOrigem(linhas, "RAZAO_APOIO").map((c) => c.label)).toEqual(["Todas as contas", "300 — FGTS a Recolher", "300 — INSS a Recolher"]);
    expect(contasDaOrigem(linhas, "RAZAO_BANCO")).toHaveLength(2);
  });

  it("a página fica presa ao intervalo quando o filtro encolhe a lista", () => {
    const lista = Array.from({ length: 120 }, (_, i) => i);
    expect(paginaDe(lista, 2)).toMatchObject({ pagina: 2, paginas: 3, itens: lista.slice(100) });
    expect(paginaDe(lista.slice(0, 10), 2)).toMatchObject({ pagina: 0, paginas: 1 });
    expect(paginaDe([], 0)).toEqual({ itens: [], pagina: 0, paginas: 1 });
  });

  it("o nome da revisão é o título, ou o arquivo quando não há título", () => {
    expect(nomeDaRevisao({ titulo: "  Setembro  ", nomeArquivo: "razao.xlsx" })).toBe("Setembro");
    expect(nomeDaRevisao({ titulo: null, nomeArquivo: "razao.xlsx" })).toBe("razao.xlsx");
  });
});
