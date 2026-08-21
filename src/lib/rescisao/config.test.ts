import { describe, expect, it } from "vitest";
import {
  resolveRescisaoConfig,
  clampTolerancia,
  clampMediaMeses,
  excedeTolerancia,
  CONFIG_PADRAO,
  TOLERANCIA_MAX_PCT,
} from "./config";

describe("resolveRescisaoConfig", () => {
  it("sem nenhuma linha usa o padrão legal", () => {
    const { valores, origem } = resolveRescisaoConfig(null, null);
    expect(valores).toEqual(CONFIG_PADRAO);
    expect(origem.insalubridadeGrau).toBe("PADRAO_LEGAL");
    expect(origem.toleranciaPct).toBe("PADRAO_LEGAL");
  });

  it("só tenant: valores do tenant, origem TENANT", () => {
    const { valores, origem } = resolveRescisaoConfig(
      { insalubridadeGrau: "MEDIO", mediaMeses: 6, cctNome: "SINDCONT" },
      null
    );
    expect(valores.insalubridadeGrau).toBe("MEDIO");
    expect(valores.mediaMeses).toBe(6);
    expect(valores.cctNome).toBe("SINDCONT");
    expect(origem.insalubridadeGrau).toBe("TENANT");
    // não informado no tenant continua no padrão legal
    expect(valores.periculosidadeAplica).toBe(false);
    expect(origem.periculosidadeAplica).toBe("PADRAO_LEGAL");
  });

  it("empresa sobrescreve CAMPO A CAMPO, herdando o resto do tenant", () => {
    const { valores, origem } = resolveRescisaoConfig(
      { insalubridadeGrau: "MEDIO", mediaMeses: 6, periculosidadeAplica: true },
      { insalubridadeGrau: "MAXIMO" } // só este campo
    );
    expect(valores.insalubridadeGrau).toBe("MAXIMO");
    expect(origem.insalubridadeGrau).toBe("EMPRESA");
    // herdados do tenant
    expect(valores.mediaMeses).toBe(6);
    expect(origem.mediaMeses).toBe("TENANT");
    expect(valores.periculosidadeAplica).toBe(true);
    expect(origem.periculosidadeAplica).toBe("TENANT");
  });

  it("null na coluna da empresa significa HERDA, não 'apaga'", () => {
    const { valores, origem } = resolveRescisaoConfig(
      { mediaMeses: 6 },
      { mediaMeses: null, insalubridadeGrau: null }
    );
    expect(valores.mediaMeses).toBe(6);
    expect(origem.mediaMeses).toBe("TENANT");
    expect(origem.insalubridadeGrau).toBe("PADRAO_LEGAL");
  });

  it("false da empresa É um valor válido (não confunde com null)", () => {
    const { valores, origem } = resolveRescisaoConfig(
      { periculosidadeAplica: true },
      { periculosidadeAplica: false }
    );
    expect(valores.periculosidadeAplica).toBe(false);
    expect(origem.periculosidadeAplica).toBe("EMPRESA");
  });

  it("verbasDesabilitadas vem como string[] e ignora lixo", () => {
    const { valores } = resolveRescisaoConfig(null, {
      verbasDesabilitadas: ["fgts_multa", 42, null, "aviso_previo"],
    });
    expect(valores.verbasDesabilitadas).toEqual(["fgts_multa", "aviso_previo"]);
  });

  it("descontosPadrao descarta item malformado", () => {
    const { valores } = resolveRescisaoConfig(null, {
      descontosPadrao: [
        { label: "Plano de saúde", tipo: "SAUDE", valor: 150 },
        { label: "sem valor" },
        { valor: 10 },
        "lixo",
      ],
    });
    expect(valores.descontosPadrao).toHaveLength(1);
    expect(valores.descontosPadrao[0]!.label).toBe("Plano de saúde");
  });

  it("aplica o cap de tolerância vindo do banco", () => {
    const { valores } = resolveRescisaoConfig({ toleranciaPct: 50 }, null);
    expect(valores.toleranciaPct).toBe(TOLERANCIA_MAX_PCT);
  });

  it("aplica o clamp de mediaMeses vindo do banco", () => {
    expect(resolveRescisaoConfig({ mediaMeses: 99 }, null).valores.mediaMeses).toBe(12);
    expect(resolveRescisaoConfig({ mediaMeses: 1 }, null).valores.mediaMeses).toBe(3);
  });
});

describe("clamps", () => {
  it("tolerância negativa ou inválida cai no padrão", () => {
    expect(clampTolerancia(-5)).toBe(1);
    expect(clampTolerancia(Number.NaN)).toBe(1);
  });

  it("tolerância dentro do intervalo é preservada", () => {
    expect(clampTolerancia(2.5)).toBe(2.5);
  });

  it("mediaMeses arredonda e limita", () => {
    expect(clampMediaMeses(6.4)).toBe(6);
    expect(clampMediaMeses(0)).toBe(3);
    expect(clampMediaMeses(24)).toBe(12);
  });
});

describe("excedeTolerancia", () => {
  it("diferença de centavo não acusa (piso absoluto)", () => {
    expect(excedeTolerancia(1000.02, 1000.0, 1)).toBe(false);
  });

  it("diferença acima do percentual acusa", () => {
    // 1% de 1000 = 10; diferença de 15 excede
    expect(excedeTolerancia(1015, 1000, 1)).toBe(true);
  });

  it("diferença dentro do percentual não acusa", () => {
    expect(excedeTolerancia(1005, 1000, 1)).toBe(false);
  });

  it("valor calculado zero ainda usa o piso absoluto", () => {
    expect(excedeTolerancia(0.03, 0, 1)).toBe(false);
    expect(excedeTolerancia(5, 0, 1)).toBe(true);
  });

  it("funciona nos dois sentidos (informado menor)", () => {
    expect(excedeTolerancia(900, 1000, 1)).toBe(true);
  });
});
