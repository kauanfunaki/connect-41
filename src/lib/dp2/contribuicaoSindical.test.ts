import { describe, expect, it } from "vitest";
import { CONVENCAO_DA_CLT, calcularMes, type VinculoDoMotor } from "./mensal";
import { RUBRICAS_PADRAO, type PapelDaRubrica } from "./rubricas";
import { tabelasDaCompetencia } from "./tabelas";

const t = tabelasDaCompetencia("2027-03");
if (!t.ok) throw new Error("tabelas");
const porPapel = new Map(RUBRICAS_PADRAO.filter((r) => r.papel).map((r) => [r.papel as PapelDaRubrica, r]));
const vinculo: VinculoDoMotor = { salarioBase: 3000, tipoSalario: "MENSAL", horasMensais: 220, dependentesIrrf: 0, filhosSalarioFamilia: 0, insalubridade: "NENHUM", periculosidade: false, valeTransporte: false, aprendiz: false, contribuicaoSindical: true };
const base = (mes: number) => ({
  ano: 2027, mes, admissao: new Date("2024-01-10T00:00:00Z"), desligamento: null, vinculo, eventos: [], rubricas: porPapel, tabelas: t.tabelas,
  convencao: CONVENCAO_DA_CLT, empresa: { patronalNoDas: false, ratAliquota: 2, fap: 1, terceirosAliquota: 5.8 }, diasUteis: 22, diasDeDescanso: 9,
});
const contribuicao = (c: ReturnType<typeof calcularMes>) => c.itens.find((i) => i.papel === "CONTRIBUICAO_SINDICAL");

describe("contribuição sindical do empregado", () => {
  it("um dia de trabalho em março, só de quem autorizou", () => {
    expect(contribuicao(calcularMes(base(3)))?.valor).toBe(100);
    expect(contribuicao(calcularMes(base(4)))).toBeUndefined();
    expect(contribuicao(calcularMes({ ...base(3), vinculo: { ...vinculo, contribuicaoSindical: false } }))).toBeUndefined();
  });

  it("o mês e o percentual da convenção; não mexe nas bases", () => {
    const c = calcularMes({ ...base(5), convencao: { ...CONVENCAO_DA_CLT, contribuicaoMes: 5, contribuicaoPercentual: 2, nome: "Comércio" } });
    expect(contribuicao(c)?.valor).toBe(60);
    expect(c.baseInss).toBe(3000);
  });
});
