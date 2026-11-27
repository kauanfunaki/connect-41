import { describe, expect, it } from "vitest";
import { apurarCompetencia } from "./apuracao";
import { calcularExemplos } from "./formulas";
import { tabelasDaCompetencia } from "./tabelas";
import { eventoS1200, geradorDeId, type EmpregadorEsocial, type TrabalhadorEsocial } from "./esocial/eventos";
import { afastamentosNoMes } from "./afastamentos";

// Licença-prêmio e aposentadoria especial no motor, na apuração e no eSocial (funcionalidade-763).

const empregador: EmpregadorEsocial = {
  cnpj: "48.291.730/0001-15",
  nome: "Panificadora",
  classTrib: "01",
  cnae: "1091102",
  ratAliquota: 2,
  fap: 1,
  fpas: "507",
  codTercs: "0079",
  iniValid: "2026-11",
};
const id = () => geradorDeId(empregador.cnpj, new Date("2026-12-20T14:05:09Z"));
const trabalhador = (t: Partial<TrabalhadorEsocial> = {}): TrabalhadorEsocial => ({
  personId: "p1",
  nome: "Joana Ribeiro",
  cpf: "529.982.247-25",
  matricula: "000123",
  categoria: "101",
  itens: [{ codigo: "001", tipo: "PROVENTO", referencia: "30 dias", valor: 3000, quantidade: 30 }],
  liquido: 2700,
  ...t,
});

describe("aposentadoria especial e licença-prêmio", () => {
  it("o motor paga a licença-prêmio sem INSS, FGTS e IRRF e soma o adicional de 6% nos encargos", () => {
    const t = tabelasDaCompetencia("2026-11");
    if (!t.ok) throw new Error("faltam tabelas");
    const x = calcularExemplos("2026-11", t.tabelas).licencaPremio;
    const licenca = x.itens.find((i) => i.papel === "LICENCA_PREMIO_INDENIZADA")!;
    expect(licenca.valor).toBe(3000);
    expect([licenca.incideInss, licenca.incideFgts, licenca.incideIrrf]).toEqual([false, false, false]);
    expect(x.encargos.aposentadoriaEspecial).toBeCloseTo(x.baseInss * 0.06, 2);
    expect(x.encargos.total).toBeCloseTo(x.encargos.inssEmpresa + x.encargos.rat + x.encargos.terceiros + x.encargos.fgts + x.encargos.aposentadoriaEspecial!, 2);
  });

  it("a apuração leva o adicional junto do RAT (GILRAT na DCTFWeb)", () => {
    const a = apurarCompetencia({
      calculos: [{ proventos: 3000, inss: 250, irrf: 0, encargos: { inssEmpresa: 600, rat: 60, terceiros: 174, aposentadoriaEspecial: 180 }, itens: [] }],
      informacoes: [],
      pisSobreFolha: false,
    });
    expect(a.rat).toBe(240);
    expect(a.cpDevida).toBe(250 + 600 + 240);
  });

  it("o S-1200 do empregado leva o grauExp do contrato; sem grau, 1; sem vínculo, sem o grupo", () => {
    expect(eventoS1200(empregador, "2026-11", trabalhador({ grauExp: "4" }), id()).xml).toContain("<infoAgNocivo><grauExp>4</grauExp></infoAgNocivo>");
    expect(eventoS1200(empregador, "2026-11", trabalhador(), id()).xml).toContain("<infoAgNocivo><grauExp>1</grauExp></infoAgNocivo>");
    expect(eventoS1200(empregador, "2026-11", trabalhador({ categoria: "701", matricula: null }), id()).xml).not.toContain("infoAgNocivo");
  });

  it("afastamento 06 tira o salário; licença remunerada (16) mantém", () => {
    const [inv] = afastamentosNoMes([{ motivo: "06", inicio: "2027-03-11", fim: null }], 2027, 3);
    expect(inv.diasInss).toBe(21);
    const [lic] = afastamentosNoMes([{ motivo: "16", inicio: "2027-03-01", fim: "2027-03-10" }], 2027, 3);
    expect([lic.diasInss, lic.diasEmpresa]).toEqual([0, 10]);
  });
});
