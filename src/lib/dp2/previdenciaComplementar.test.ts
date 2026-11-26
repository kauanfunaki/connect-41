import { describe, expect, it } from "vitest";
import { CONVENCAO_DA_CLT, calcularMes, type VinculoDoMotor } from "./mensal";
import { RUBRICAS_PADRAO, type PapelDaRubrica } from "./rubricas";
import { tabelasDaCompetencia } from "./tabelas";

const t = tabelasDaCompetencia("2026-11");
if (!t.ok) throw new Error("tabelas");
const porPapel = new Map(RUBRICAS_PADRAO.filter((r) => r.papel).map((r) => [r.papel as PapelDaRubrica, r]));
const vinculo: VinculoDoMotor = { salarioBase: 8000, tipoSalario: "MENSAL", horasMensais: 220, dependentesIrrf: 1, filhosSalarioFamilia: 0, insalubridade: "NENHUM", periculosidade: false, valeTransporte: false, aprendiz: false };
const mes = (v: VinculoDoMotor) =>
  calcularMes({
    ano: 2026, mes: 11, admissao: new Date("2024-01-10T00:00:00Z"), desligamento: null, vinculo: v, eventos: [], rubricas: porPapel, tabelas: t.tabelas,
    convencao: CONVENCAO_DA_CLT, empresa: { patronalNoDas: false, ratAliquota: 2, fap: 1, terceirosAliquota: 5.8 }, diasUteis: 20, diasDeDescanso: 10,
  });

describe("previdência complementar", () => {
  it("desconta na folha e reduz a base do IRRF pelo valor da contribuição", () => {
    const sem = mes(vinculo);
    const com = mes({ ...vinculo, previdenciaComplementar: 400 });
    expect(com.itens.find((i) => i.papel === "PREVIDENCIA_COMPLEMENTAR")?.valor).toBe(400);
    expect(com.irrf.base).toBeCloseTo(sem.irrf.base - 400, 2);
    expect(com.irrf.valor).toBeLessThan(sem.irrf.valor);
    expect(com.irrf.memoria.join(" ")).toContain("previdência complementar 400,00");
    // Não mexe no INSS nem no FGTS.
    expect(com.baseInss).toBe(sem.baseInss);
    expect(com.fgts).toBe(sem.fgts);
  });
});
