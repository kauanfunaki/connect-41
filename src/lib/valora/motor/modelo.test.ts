import { describe, expect, it } from "vitest";

import { calcular, MODELO_41, normalizarParametros, normalizarPerfil, PARAMETROS_PADRAO, perfilVazio } from "./index";

describe("MODELO_41", () => {
  it("tem ids únicos", () => {
    const ids = MODELO_41.atividades.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("toda condição e todo volume usados existem no formulário (temFolha é derivado)", () => {
    const chaves = new Set(MODELO_41.campos.map((c) => c.chave));
    for (const a of MODELO_41.atividades) {
      if (a.condicao && a.condicao !== "temFolha") expect(chaves, a.id).toContain(a.condicao);
      if (a.quantidade.tipo === "volume") expect(chaves, a.id).toContain(a.quantidade.campo);
    }
  });

  it("toda atividade pertence a um setor do catálogo", () => {
    const setores = new Set(MODELO_41.setores.map((s) => s.codigo));
    for (const a of MODELO_41.atividades) expect(setores).toContain(a.setor);
  });

  it("Presumido com ICMS e folha custa mais que Simples sem nada", () => {
    const custo = (setorCusto: number) => ({
      ...MODELO_41,
      setores: MODELO_41.setores.map((s) => ({ ...s, custoMensal: setorCusto })),
    });
    const cat = custo(30000);
    const simples = calcular(cat, perfilVazio(cat), PARAMETROS_PADRAO);
    const presumido = calcular(
      cat,
      { ...perfilVazio(cat), regime: "PRESUMIDO", marcadores: { temICMS: true, temPonto: true }, volumes: { funcionarios: 20 } },
      PARAMETROS_PADRAO,
    );
    expect(simples.mensal.alvo).toBeGreaterThan(0);
    expect(presumido.mensal.alvo!).toBeGreaterThan(simples.mensal.alvo!);
    expect(presumido.setores.find((s) => s.codigo === "DP")!.minutosMes).toBeGreaterThan(0);
  });
});

describe("Societário: mensalidade + avulsos", () => {
  const cat = { ...MODELO_41, setores: MODELO_41.setores.map((s) => ({ ...s, custoMensal: 30000 })) };
  const soc = (extra: Partial<ReturnType<typeof perfilVazio>> = {}) =>
    calcular(cat, { ...perfilVazio(cat), setores: ["SOC"], ...extra }, PARAMETROS_PADRAO);

  it("processo vai para a tabela de avulsos, não para a mensalidade", () => {
    const r = soc();
    const ids = r.setores[0].atividades.map((a) => a.id);
    expect(ids).not.toContain("SOC-07");
    expect(r.avulsos.map((a) => a.id)).toEqual(expect.arrayContaining(["SOC-07", "SOC-10", "SOC-12"]));
    const abertura = r.avulsos.find((a) => a.id === "SOC-07")!;
    const baixa = r.avulsos.find((a) => a.id === "SOC-12")!;
    expect(abertura.precos.alvo!).toBeGreaterThan(baixa.precos.alvo!);
    expect(r.mensal.alvo!).toBeGreaterThan(0);
  });

  it("licenças sobem a mensalidade; complexidade encarece o avulso", () => {
    const sem = soc();
    const com = soc({ volumes: { licencas: 4 } });
    expect(com.mensal.alvo!).toBeGreaterThan(sem.mensal.alvo!);
    const dificil = soc({ complexidades: MODELO_41.complexidades.filter((c) => c.setor === "SOC").slice(0, 1).map((c) => c.id) });
    const abertura = (x: typeof sem) => x.avulsos.find((a) => a.id === "SOC-07")!.minutos;
    expect(abertura(dificil)).toBeGreaterThan(abertura(sem));
  });

  it("setor não contratado não gera avulso", () => {
    const r = calcular(cat, { ...perfilVazio(cat), setores: ["FIS"] }, PARAMETROS_PADRAO);
    expect(r.avulsos).toEqual([]);
  });
});

describe("validação", () => {
  it("recusa margem que torna o preço impossível e piso acima do alvo", () => {
    expect(normalizarParametros({ ...PARAMETROS_PADRAO, variaveisPct: 50, margemAlvoPct: 50 })).toBeNull();
    expect(normalizarParametros({ ...PARAMETROS_PADRAO, margemPisoPct: 30 })).toBeNull();
    expect(normalizarParametros({ ...PARAMETROS_PADRAO, margemAlvoPct: "25,5" })?.margemAlvoPct).toBe(25.5);
  });

  it("descarta chave desconhecida e exige ao menos um setor", () => {
    const p = normalizarPerfil(
      { regime: "REAL", setores: ["FIS", "XYZ"], volumes: { funcionarios: "12", hack: 9 }, marcadores: { temICMS: true, x: true }, complexidades: ["FIS-C01", "??"] },
      MODELO_41,
    );
    expect(p?.setores).toEqual(["FIS"]);
    expect(p?.volumes.funcionarios).toBe(12);
    expect(p?.volumes).not.toHaveProperty("hack");
    expect(p?.marcadores).not.toHaveProperty("x");
    expect(p?.complexidades).toEqual(["FIS-C01"]);
    expect(normalizarPerfil({ regime: "REAL", setores: [] }, MODELO_41)).toBeNull();
    expect(normalizarPerfil({ regime: "XX", setores: ["FIS"] }, MODELO_41)).toBeNull();
  });
});
