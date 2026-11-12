// A conciliação Razão × extrato na tela: somas da rota, composições, filtros por dia e por tipo.
import { describe, expect, it } from "vitest";
import type { GrupoConciliacaoJson, RelatorioConciliacaoJson, ResumoDiaJson } from "./relatorio";
import {
  agruparPorTipo,
  composicoesDoGrupo,
  dataBr,
  diasDaTela,
  ehLote,
  moedaDoRelatorio,
  pendenciasDoDia,
  somasDaTela,
} from "./telaDaConciliacao";

const razao = (data: string, valor: string, lote = "1") => ({ data, valor, historico: `PAG ${valor}`, lote, contrapartida: "" });
const extrato = (data: string, valor: string, id = valor) => ({ transacaoId: id, data, valor, historico: `SISPAG ${valor}` });

function grupo(parcial: Partial<GrupoConciliacaoJson>): GrupoConciliacaoJson {
  return { tipo: "SO_RAZAO", razao: [], extrato: [], diferenca: "0.00", sispagFaltando: [], composicoes: [], ...parcial };
}

function dia(data: string, diferenca: string, pendencias: number): ResumoDiaJson {
  return {
    data,
    lancamentosRazao: 1,
    lancamentosExtrato: 1,
    movimentoRazao: "0.00",
    movimentoExtrato: "0.00",
    diferenca,
    pendencias,
    dataDiferente: 0,
    aplicacaoSemExtrato: 0,
  };
}

describe("composições de um grupo", () => {
  it("uma linha só no extrato: todo o Razão do grupo é dela, com a soma exata", () => {
    const g = grupo({
      tipo: "LOTE_SISPAG",
      razao: [razao("2026-09-01", "-0.10"), razao("2026-09-01", "-0.20")],
      extrato: [extrato("2026-09-01", "-0.30")],
    });
    expect(composicoesDoGrupo(g)).toEqual([
      { extratoIndice: 0, razaoIndices: [0, 1], sispagFaltandoIndices: [], criterio: "grupo_unico", sugerida: false, totalRazao: "-0.30", diferenca: "0.00" },
    ]);
  });

  it("várias linhas: usa as composições do relatório e marca a sugerida", () => {
    const g = grupo({
      tipo: "LOTE_SISPAG",
      razao: [razao("2026-09-01", "-100.00"), razao("2026-09-01", "-50.00"), razao("2026-09-01", "-25.50")],
      extrato: [extrato("2026-09-01", "-150.00", "a"), extrato("2026-09-01", "-25.00", "b")],
      composicoes: [
        { extratoIndice: 0, razaoIndices: [0, 1], sispagFaltandoIndices: [], criterio: "SOMA_UNICA_POR_VALORES_SISPAG", confianca: "CONFIRMADA" },
        { extratoIndice: 1, razaoIndices: [2], sispagFaltandoIndices: [], criterio: "SUGESTAO_POR_LOTES_E_SOMA", confianca: "SUGERIDA" },
      ],
    });
    const [a, b] = composicoesDoGrupo(g);
    expect(a).toMatchObject({ criterio: "soma_unica_sispag", sugerida: false, totalRazao: "-150.00", diferenca: "0.00" });
    expect(b).toMatchObject({ criterio: "lotes_soma", sugerida: true, totalRazao: "-25.50", diferenca: "-0.50" });
  });

  it("sem composição ou com índice fora do grupo, não vincula nada", () => {
    const g = grupo({
      razao: [razao("2026-09-01", "-10.00")],
      extrato: [extrato("2026-09-01", "-10.00", "a"), extrato("2026-09-01", "-5.00", "b")],
      composicoes: [{ extratoIndice: 0, razaoIndices: [0, 7], sispagFaltandoIndices: [], criterio: "SOMA_UNICA_POR_VALORES_SISPAG", confianca: "CONFIRMADA" }],
    });
    for (const c of composicoesDoGrupo(g)) {
      expect(c).toMatchObject({ criterio: "sem_vinculo", razaoIndices: [], totalRazao: null, diferenca: null });
    }
  });

  it("as somas da rota seguem a ordem das pendências", () => {
    const r = {
      pendencias: [grupo({ razao: [razao("2026-09-01", "0.10"), razao("2026-09-02", "0.20")] }), grupo({ extrato: [extrato("2026-09-03", "1234.5")] })],
    } as RelatorioConciliacaoJson;
    const somas = somasDaTela(r);
    expect(somas.map((s) => [s.totalRazao, s.totalExtrato])).toEqual([
      ["0.30", "0"],
      ["0", "1234.5"],
    ]);
  });
});

describe("filtros da tela", () => {
  const pendencias = [
    grupo({ tipo: "SO_RAZAO", razao: [razao("2026-09-01", "-1.00")] }),
    grupo({ tipo: "SO_EXTRATO", extrato: [extrato("2026-09-02", "2.00")] }),
    grupo({ tipo: "SO_RAZAO", razao: [razao("2026-09-02", "-3.00")] }),
  ];

  it("o dia escolhido pega a pendência por qualquer lado, e guarda a posição no relatório", () => {
    expect(pendenciasDoDia(pendencias, "2026-09-02").map((p) => p.indice)).toEqual([1, 2]);
    expect(pendenciasDoDia(pendencias, null)).toHaveLength(3);
  });

  it("agrupa por tipo na ordem em que o tipo aparece", () => {
    const tipos = agruparPorTipo(pendenciasDoDia(pendencias, null));
    expect(tipos.map((t) => [t.tipo, t.rotulo, t.pendencias.map((p) => p.indice)])).toEqual([
      ["SO_RAZAO", "Só no razão", [0, 2]],
      ["SO_EXTRATO", "Só no extrato", [1]],
    ]);
    expect(agruparPorTipo([{ indice: 0, grupo: grupo({ tipo: "NOVO" }) }])[0].rotulo).toBe("NOVO");
  });

  it("só os dias com diferença ou pendência, quando pedido", () => {
    const dias = [dia("2026-09-01", "0.00", 0), dia("2026-09-02", "-0.01", 0), dia("2026-09-03", "0", 2)];
    expect(diasDaTela(dias, true).map((d) => d.data)).toEqual(["2026-09-02", "2026-09-03"]);
    expect(diasDaTela(dias, false)).toHaveLength(3);
  });

  it("lote é grupo grande ou com pagamento do SISPAG faltando", () => {
    expect(ehLote(grupo({ razao: [razao("2026-09-01", "1"), razao("2026-09-01", "1")], extrato: [extrato("2026-09-01", "2")] }))).toBe(false);
    expect(ehLote(grupo({ razao: [1, 2, 3].map(() => razao("2026-09-01", "1")), extrato: [extrato("2026-09-01", "3")] }))).toBe(true);
    expect(ehLote(grupo({ sispagFaltando: [{ data: "2026-09-01", valor: "-5.00", tipo: "TED", favorecido: "Fornecedor A", documento: "" }] }))).toBe(true);
  });
});

describe("formatação", () => {
  it("dinheiro do relatório guarda o sinal, inclusive abaixo de um real", () => {
    expect(moedaDoRelatorio("-1234.5")).toBe("R$ -1.234,50");
    expect(moedaDoRelatorio("-0.50")).toBe("R$ -0,50");
    expect(moedaDoRelatorio("-0.00")).toBe("R$ 0,00");
    expect(moedaDoRelatorio("10")).toBe("R$ 10,00");
  });

  it("data de calendário sem fuso", () => {
    expect(dataBr("2026-09-01")).toBe("01/09/2026");
    expect(dataBr(null)).toBe("—");
  });
});
