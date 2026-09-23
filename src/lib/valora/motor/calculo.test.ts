import { describe, expect, it } from "vitest";

import { calcular, markup, vezesPorMes } from "./calculo";
import type { Catalogo, ParametrosPreco, Perfil } from "./tipos";

// Catálogo de brinquedo: números redondos para a conta caber de cabeça.
// Setor FIS: 100 h de capacidade e R$ 6.000/mês → R$ 1/min. Despesas fixas R$ 12.000 sobre
// 200 h de capacidade total (FIS + DP) → R$ 1/min de rateio. Custo total: R$ 2/min no FIS.
const catalogo: Catalogo = {
  setores: [
    { codigo: "FIS", nome: "Fiscal", capacidadeHorasMes: 100, custoMensal: 6000, fatorCalibracao: 1, minutosSemMovimento: 30 },
    { codigo: "DP", nome: "Departamento Pessoal", capacidadeHorasMes: 100, custoMensal: 0, fatorCalibracao: 0.5 },
  ],
  atividades: [
    { id: "FIS-01", setor: "FIS", grupo: "Doc", nome: "Cobrar documentos", frequencia: "mensal", tempoMin: { SIMPLES: 10, PRESUMIDO: 20 }, quantidade: { tipo: "fixa", valor: 1 } },
    { id: "FIS-09", setor: "FIS", grupo: "Apuração", nome: "ICMS", frequencia: "mensal", tempoMin: { SIMPLES: 30 }, quantidade: { tipo: "fixa", valor: 1 }, condicao: "temICMS" },
    { id: "FIS-14", setor: "FIS", grupo: "Apuração", nome: "IRPJ trimestral", frequencia: "trimestral", tempoMin: { PRESUMIDO: 60 }, quantidade: { tipo: "fixa", valor: 1 } },
    { id: "FIS-18", setor: "FIS", grupo: "Obrigações", nome: "DCTFWeb", frequencia: "mensal", tempoMin: { SIMPLES: 5 }, quantidade: { tipo: "fixa", valor: 1 }, semMovimento: true },
    { id: "FIS-31", setor: "FIS", grupo: "Implantação", nome: "Implantar", frequencia: "evento", tempoMin: { SIMPLES: 120 }, quantidade: { tipo: "fixa", valor: 1 }, implantacao: true },
    { id: "DP-02", setor: "DP", grupo: "Folha", nome: "Calcular folha", frequencia: "mensal", tempoMin: { SIMPLES: 20 }, quantidade: { tipo: "fixa", valor: 1 }, condicao: "temFolha" },
    { id: "DP-18", setor: "DP", grupo: "Eventos", nome: "Férias", frequencia: "anual", tempoMin: { SIMPLES: 15 }, quantidade: { tipo: "volume", campo: "funcionarios" } },
  ],
  complexidades: [{ id: "FIS-C1", setor: "FIS", nome: "Muito atendimento", pct: 50 }],
  campos: [],
};

const parametros: ParametrosPreco = { despesasFixasMes: 12000, variaveisPct: 15, margemAlvoPct: 20, margemPisoPct: 0, descontoMaximoPct: 15 };

const perfil = (p: Partial<Perfil> = {}): Perfil => ({
  regime: "SIMPLES",
  semMovimento: false,
  setores: ["FIS"],
  volumes: {},
  marcadores: {},
  complexidades: [],
  ...p,
});

describe("markup", () => {
  it("é divisor, não soma: custo 1.000, 15% de imposto e 20% de margem dão 1.538,46", () => {
    expect(markup(1000, 15, 20)).toBeCloseTo(1538.46, 2);
  });
  it("devolve null quando variáveis + margem chegam a 100%", () => {
    expect(markup(1000, 60, 40)).toBeNull();
  });
});

describe("vezesPorMes", () => {
  it("divide trimestral por 3 e anual por 12", () => {
    expect(vezesPorMes(catalogo.atividades[2], perfil())).toBeCloseTo(1 / 3);
    expect(vezesPorMes(catalogo.atividades[6], perfil({ volumes: { funcionarios: 24 } }))).toBe(2);
  });
  it("zera a atividade cuja condição o cliente não tem", () => {
    expect(vezesPorMes(catalogo.atividades[1], perfil())).toBe(0);
    expect(vezesPorMes(catalogo.atividades[1], perfil({ marcadores: { temICMS: true } }))).toBe(1);
  });
});

describe("calcular", () => {
  it("soma só o que existe no regime e a R$ 2/min", () => {
    // Simples sem ICMS: cobrar 10 + DCTFWeb 5 = 15 min → R$ 30
    const r = calcular(catalogo, perfil(), parametros);
    expect(r.setores).toHaveLength(1);
    expect(r.setores[0].minutosMes).toBe(15);
    expect(r.mensal.custo).toBe(30);
    expect(r.mensal.alvo).toBeCloseTo(30 / 0.65, 2);
    expect(r.mensal.piso).toBeCloseTo(30 / 0.85, 2);
    expect(r.mensal.tabela).toBeCloseTo(30 / 0.65 / 0.85, 2);
  });

  it("aplica condição, complexidade e implantação à parte", () => {
    const r = calcular(catalogo, perfil({ marcadores: { temICMS: true }, complexidades: ["FIS-C1"] }), parametros);
    // (10 + 30 + 5) × 1,5 = 67,5 min
    expect(r.setores[0].minutosMes).toBeCloseTo(67.5);
    expect(r.setores[0].complexidadePct).toBe(50);
    expect(r.implantacao.custo).toBe(240); // 120 min × R$ 2, sem complexidade
  });

  it("empresa sem movimento: só o que é marcado para ela e os minutos fixos do setor", () => {
    const r = calcular(catalogo, perfil({ semMovimento: true }), parametros);
    // DCTFWeb 5 + 30 fixos
    expect(r.setores[0].minutosMes).toBe(35);
  });

  it("calibra pelo fator do setor e avisa quando o setor não tem custo", () => {
    const r = calcular(catalogo, perfil({ setores: ["DP"], volumes: { funcionarios: 12 } }), parametros);
    // (20 + 15 × 1) × 0,5 = 17,5 min, só rateio (R$ 1/min)
    expect(r.setores[0].minutosMes).toBeCloseTo(17.5);
    expect(r.setores[0].semCusto).toBe(true);
    expect(r.mensal.custo).toBeCloseTo(17.5);
    expect(r.avisos.some((a) => a.includes("custo mensal da equipe não informado"))).toBe(true);
    expect(r.avisos.some((a) => a.includes("fator 0,50"))).toBe(true);
  });

  it("não quebra com margem impossível", () => {
    const r = calcular(catalogo, perfil(), { ...parametros, variaveisPct: 50, margemAlvoPct: 50 });
    expect(r.mensal.alvo).toBeNull();
    expect(r.mensal.tabela).toBeNull();
    expect(r.avisos.some((a) => a.includes("100%"))).toBe(true);
  });
});
