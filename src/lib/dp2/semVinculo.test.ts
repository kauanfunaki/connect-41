import { describe, expect, it } from "vitest";
import { calcularIrrf } from "./impostos";
import { tabelasDaCompetencia } from "./tabelas";
import { calcularMes, CONVENCAO_DA_CLT, type EmpresaDoMotor, type EntradaMensal, type EventoDoMotor, type VinculoDoMotor } from "./mensal";
import { calcularMesDaCategoria } from "./semVinculo";
import { CATEGORIAS, regimeDaCategoria, semVinculo } from "./categorias";
import { RUBRICAS_PADRAO, type PapelDaRubrica, type RubricaDoMotor } from "./rubricas";

const r = tabelasDaCompetencia("2026-11");
if (!r.ok) throw new Error(r.faltam.join(", "));
const tabelas = r.tabelas;
const rubricas = new Map<PapelDaRubrica, RubricaDoMotor>(RUBRICAS_PADRAO.filter((x) => x.papel).map((x) => [x.papel!, x]));
const rub = (p: PapelDaRubrica) => rubricas.get(p)!;
const empresa: EmpresaDoMotor = { patronalNoDas: false, ratAliquota: 2, fap: 1, terceirosAliquota: 5.8 };
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

const entrada = (categoria: string, salarioBase: number, extra: Partial<EntradaMensal> = {}, v: Partial<VinculoDoMotor> = {}): EntradaMensal => ({
  ano: 2026,
  mes: 11,
  admissao: null,
  desligamento: null,
  vinculo: {
    salarioBase,
    tipoSalario: "MENSAL",
    horasMensais: 220,
    dependentesIrrf: 0,
    filhosSalarioFamilia: 0,
    insalubridade: "NENHUM",
    periculosidade: false,
    valeTransporte: true,
    aprendiz: false,
    categoria,
    ...v,
  },
  eventos: [],
  rubricas,
  tabelas,
  convencao: CONVENCAO_DA_CLT,
  empresa,
  diasUteis: 20,
  diasDeDescanso: 10,
  ...extra,
});

describe("categorias", () => {
  it("separa empregado, contribuinte individual e estagiário", () => {
    expect(regimeDaCategoria("101")).toBe("CLT");
    expect(regimeDaCategoria(undefined)).toBe("CLT");
    expect(regimeDaCategoria("723")).toBe("CONTRIBUINTE_INDIVIDUAL");
    expect(regimeDaCategoria("701")).toBe("CONTRIBUINTE_INDIVIDUAL");
    expect(regimeDaCategoria("901")).toBe("ESTAGIARIO");
    expect(semVinculo("103")).toBe(false);
    expect(CATEGORIAS.map(([k]) => k)).toEqual(expect.arrayContaining(["723", "701", "901"]));
  });

  it("as rubricas novas têm as incidências certas", () => {
    expect(rub("PRO_LABORE")).toMatchObject({ incideInss: true, incideFgts: false, incideIrrf: true });
    expect(rub("SERVICO_AUTONOMO")).toMatchObject({ incideInss: true, incideFgts: false, incideIrrf: true });
    expect(rub("BOLSA_ESTAGIO")).toMatchObject({ incideInss: false, incideFgts: false, incideIrrf: true });
  });
});

describe("pró-labore (723)", () => {
  it("INSS de 11%, IRRF pela tabela, 20% da empresa, sem FGTS e sem provisões", () => {
    const c = calcularMesDaCategoria(entrada("723", 8000));
    expect(c.itens.map((i) => i.papel)).toEqual(["PRO_LABORE", "INSS", "IRRF"]);
    expect(c.inss.valor).toBe(880);
    const irrf = calcularIrrf({ rendimentos: 8000, inss: 880, dependentes: 0, pensao: 0 }, tabelas.irrf.dados);
    expect(irrf.valor).toBeGreaterThan(0);
    expect(c.irrf.valor).toBe(irrf.valor);
    expect(c.liquido).toBe(Math.round((8000 - 880 - irrf.valor) * 100) / 100);
    expect(c.fgts).toBe(0);
    expect(c.encargos).toMatchObject({ inssEmpresa: 1600, rat: 0, terceiros: 0, fgts: 0, total: 1600 });
    expect(c.provisoes.total).toBe(0);
  });

  it("o INSS para no teto e o vale-transporte não se aplica", () => {
    const c = calcularMesDaCategoria(entrada("723", 10000));
    expect(c.inss.valor).toBe(932.31);
    expect(c.itens.some((i) => i.papel === "VALE_TRANSPORTE")).toBe(false);
  });

  it("com a patronal no DAS, a empresa não paga os 20%", () => {
    const c = calcularMesDaCategoria(entrada("723", 5000, { empresa: { ...empresa, patronalNoDas: true } }));
    expect(c.encargos.total).toBe(0);
  });

  it("entrada no meio do mês proporcionaliza", () => {
    const c = calcularMesDaCategoria(entrada("723", 3000, { admissao: d("2026-11-16") }));
    expect(c.itens[0]).toMatchObject({ papel: "PRO_LABORE", valor: 1500 });
  });
});

describe("autônomo por RPA (701)", () => {
  it("o serviço lançado no mês, com 11% e o aviso do ISS", () => {
    const eventos: EventoDoMotor[] = [{ rubrica: rub("SERVICO_AUTONOMO"), quantidade: null, valor: 2000 }];
    const c = calcularMesDaCategoria(entrada("701", 0, { eventos }));
    expect(c.itens.map((i) => i.papel)).toEqual(["SERVICO_AUTONOMO", "INSS"]);
    expect(c.inss.valor).toBe(220);
    expect(c.encargos.inssEmpresa).toBe(400);
    expect(c.alertas.join(" ")).toContain("ISS");
  });
});

describe("estagiário (901)", () => {
  it("bolsa só com IRRF; horas extras ignoradas com aviso; sem encargos", () => {
    const eventos: EventoDoMotor[] = [{ rubrica: rub("HE50"), quantidade: 5, valor: null }];
    const c = calcularMesDaCategoria(entrada("901", 1500, { eventos }));
    expect(c.itens.map((i) => i.papel)).toEqual(["BOLSA_ESTAGIO"]);
    expect(c.inss.valor).toBe(0);
    expect(c.irrf.valor).toBe(0);
    expect(c.liquido).toBe(1500);
    expect(c.encargos.total).toBe(0);
    expect(c.alertas.join(" ")).toContain("não se aplica");
  });
});

describe("empregado", () => {
  it("categoria CLT segue o motor de sempre", () => {
    const e = entrada("101", 3000);
    expect(calcularMesDaCategoria(e)).toEqual(calcularMes(e));
  });
});
