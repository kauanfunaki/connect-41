import { describe, expect, it } from "vitest";
import { apuracaoAnual, eventoS1200, eventoS1210, eventoS1299, geradorDeId, ideDmDev, type EmpregadorEsocial, type TrabalhadorEsocial } from "./eventos";

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
const joana: TrabalhadorEsocial = {
  personId: "p1",
  nome: "Joana Ribeiro",
  cpf: "529.982.247-25",
  matricula: "000123",
  categoria: "101",
  itens: [
    { codigo: "061", tipo: "PROVENTO", referencia: "12/12", valor: 3000, quantidade: null },
    { codigo: "062", tipo: "DESCONTO", referencia: "", valor: 1500, quantidade: null },
    { codigo: "063", tipo: "DESCONTO", referencia: "", valor: 248.6, quantidade: null },
  ],
  liquido: 1251.4,
};

describe("13º no eSocial (apuração anual)", () => {
  it("perApur de 4 dígitos é anual e tem demonstrativo próprio", () => {
    expect(apuracaoAnual("2026")).toBe(true);
    expect(apuracaoAnual("2026-12")).toBe(false);
    expect(ideDmDev("2026")).toBe("DECIMO2026");
    expect(ideDmDev("2026-12")).toBe("FOLHA202612");
  });

  it("S-1200 anual: indApuracao 2, o ano e as rubricas do 13º", () => {
    const ev = eventoS1200(empregador, "2026", joana, id());
    expect(ev.pendencias).toEqual([]);
    expect(ev.xml).toContain("<indApuracao>2</indApuracao><perApur>2026</perApur>");
    expect(ev.xml).toContain("<ideDmDev>DECIMO2026</ideDmDev>");
    expect(ev.xml).toContain("<codRubr>061</codRubr><ideTabRubr>DP2</ideTabRubr><vrRubr>3000.00</vrRubr>");
    expect(ev.xml).toContain("<codRubr>062</codRubr>");
  });

  it("S-1210 de dezembro paga o demonstrativo anual", () => {
    const ev = eventoS1210(empregador, "2026-12", "2026-12-18", joana, id(), "2026");
    expect(ev.xml).toContain("<perApur>2026-12</perApur>");
    expect(ev.xml).toContain("<infoPgto><dtPgto>2026-12-18</dtPgto><tpPgto>1</tpPgto><perRef>2026</perRef><ideDmDev>DECIMO2026</ideDmDev><vrLiq>1251.40</vrLiq></infoPgto>");
  });

  it("o mês segue como antes e o S-1299 anual fecha o ano", () => {
    expect(eventoS1210(empregador, "2026-11", "2026-12-05", joana, id()).xml).toContain("<perRef>2026-11</perRef><ideDmDev>FOLHA202611</ideDmDev>");
    expect(eventoS1200(empregador, "2026-11", joana, id()).xml).toContain("<indApuracao>1</indApuracao><perApur>2026-11</perApur>");
    expect(eventoS1299(empregador, "2026", true, id()).xml).toContain("<indApuracao>2</indApuracao><perApur>2026</perApur>");
  });
});
