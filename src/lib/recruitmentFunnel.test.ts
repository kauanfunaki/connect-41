import { describe, expect, it } from "vitest";
import { computeFunnelConversion, linhaDaColuna, numerosDasColunas, resumoDoFunil, stageIndex } from "./recruitmentFunnel";

describe("stageIndex", () => {
  it("ordena as etapas", () => {
    expect(stageIndex("TRIAGEM")).toBe(0);
    expect(stageIndex("CONTRATADO")).toBe(4);
    expect(stageIndex("desconhecido")).toBe(0);
  });
});

describe("computeFunnelConversion", () => {
  it("mede quantos alcançaram cada etapa, preservando reprovados", () => {
    const stats = computeFunnelConversion([
      { stage: "TRIAGEM", status: "EM_ANDAMENTO" },
      { stage: "ENTREVISTA", status: "EM_ANDAMENTO" },
      { stage: "ENTREVISTA", status: "REPROVADO" }, // reprovado na entrevista: alcançou triagem+entrevista
      { stage: "CONTRATADO", status: "CONTRATADO" },
    ]);

    expect(stats.total).toBe(4);
    const [triagem, entrevista, teste, , contratado] = stats.stages;
    expect(triagem!.reached).toBe(4); // todos passaram por triagem
    expect(entrevista!.reached).toBe(3); // 2 em entrevista + 1 contratado
    expect(teste!.reached).toBe(1); // só o contratado
    expect(contratado!.reached).toBe(1);
    expect(triagem!.conversionPct).toBe(100);
    expect(entrevista!.conversionPct).toBe(75);
  });

  it("current ignora reprovados/desistentes na coluna", () => {
    const stats = computeFunnelConversion([
      { stage: "ENTREVISTA", status: "EM_ANDAMENTO" },
      { stage: "ENTREVISTA", status: "REPROVADO" },
      { stage: "ENTREVISTA", status: "DESISTENTE" },
    ]);
    const entrevista = stats.stages.find((s) => s.stage === "ENTREVISTA")!;
    expect(entrevista.current).toBe(1); // só o ativo
    expect(entrevista.reached).toBe(3); // mas os 3 alcançaram a etapa
  });

  it("conta os desfechos", () => {
    const stats = computeFunnelConversion([
      { stage: "CONTRATADO", status: "CONTRATADO" },
      { stage: "PROPOSTA", status: "REPROVADO" },
      { stage: "TRIAGEM", status: "DESISTENTE" },
    ]);
    expect(stats.contratados).toBe(1);
    expect(stats.reprovados).toBe(1);
    expect(stats.desistentes).toBe(1);
  });

  it("lida com funil vazio", () => {
    const stats = computeFunnelConversion([]);
    expect(stats.total).toBe(0);
    expect(stats.stages.every((s) => s.conversionPct === 0)).toBe(true);
  });
});

describe("numerosDasColunas (o topo de cada coluna do quadro)", () => {
  // O exemplo da página de alternativas: 5 candidaturas, 1 reprovada na triagem.
  const CANDIDATURAS = [
    { stage: "TRIAGEM", status: "EM_ANDAMENTO" },
    { stage: "TRIAGEM", status: "EM_ANDAMENTO" },
    { stage: "TRIAGEM", status: "REPROVADO" },
    { stage: "ENTREVISTA", status: "EM_ANDAMENTO" },
    { stage: "CONTRATADO", status: "CONTRATADO" },
  ];

  it("quem está agora, quem chegou e a passagem da etapa anterior", () => {
    const n = numerosDasColunas(CANDIDATURAS);
    expect(n.map((c) => [c.stage, c.agora, c.chegaram])).toEqual([
      ["TRIAGEM", 2, 5],
      ["ENTREVISTA", 1, 2],
      ["TESTE", 0, 1],
      ["PROPOSTA", 0, 1],
      ["CONTRATADO", 1, 1],
    ]);
    expect(n.map((c) => c.passaram)).toEqual([null, 0.4, 0.5, 1, 1]);
    expect(n.map((c) => c.parteDoTotal)).toEqual([1, 0.4, 0.2, 0.2, 0.2]);
  });

  it("a mesma conta do gráfico de funil que saiu da ficha", () => {
    // O `Funil` mostrava a barra como chegaram/maior e o % como chegaram/anterior.
    const stats = computeFunnelConversion(CANDIDATURAS);
    const n = numerosDasColunas(CANDIDATURAS);
    stats.stages.forEach((s, i) => {
      expect(n[i]!.chegaram).toBe(s.reached);
      expect(n[i]!.agora).toBe(s.current);
      expect(Math.round(n[i]!.parteDoTotal * 100)).toBe(s.conversionPct);
    });
  });

  it("ninguém na etapa anterior: sem percentual", () => {
    const n = numerosDasColunas([]);
    expect(n.every((c) => c.passaram === null && c.parteDoTotal === 0 && c.agora === 0)).toBe(true);
  });

  it("a linha de cada coluna", () => {
    expect(linhaDaColuna({ chegaram: 5, passaram: null })).toBe("5 chegaram");
    expect(linhaDaColuna({ chegaram: 2, passaram: 0.4 })).toBe("2 chegaram · 40% passaram");
    expect(linhaDaColuna({ chegaram: 1, passaram: 1 })).toBe("1 chegou · 100% passaram");
    expect(linhaDaColuna({ chegaram: 2, passaram: 2 / 3 })).toBe("2 chegaram · 67% passaram");
  });

  it("a linha em cima do quadro", () => {
    expect(resumoDoFunil(5, 1, 2)).toBe("5 candidaturas · 1 contratada de 2 vagas");
    expect(resumoDoFunil(1, 0, 1)).toBe("1 candidatura · 0 contratadas de 1 vaga");
    expect(resumoDoFunil(3, 2, 2)).toBe("3 candidaturas · 2 contratadas de 2 vagas");
  });
});
