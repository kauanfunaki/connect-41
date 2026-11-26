import { describe, expect, it } from "vitest";
import {
  eventoS1200,
  eventoS1210,
  eventoS1298,
  eventoS3000,
  exclusaoPedePeriodo,
  exclusaoPedeTrabalhador,
  geradorDeId,
  podeExcluirPeloS3000,
  reciboValido,
  type EmpregadorEsocial,
  type TrabalhadorEsocial,
} from "./eventos";

const empregador: EmpregadorEsocial = { cnpj: "48.291.730/0001-15", nome: "Panificadora", classTrib: "01", cnae: "1091-1/02", ratAliquota: 2, fap: 1, fpas: "507", codTercs: "0079", iniValid: "2026-11" };
const quando = new Date("2026-12-03T14:05:09Z");
const novoId = () => geradorDeId(empregador.cnpj, quando);
const trabalhador: TrabalhadorEsocial = {
  personId: "p1",
  nome: "Joana Ribeiro",
  cpf: "529.982.247-25",
  matricula: "000123",
  categoria: "101",
  itens: [{ codigo: "001", tipo: "PROVENTO", referencia: "30 dias", valor: 3000, quantidade: null }],
  liquido: 2750,
};
const RECIBO = "1.2.0000000000123456789";

describe("S-3000, S-1298 e retificação (funcionalidade-754, leiaute S-1.3)", () => {
  it("S-3000 de S-1200: trabalhador e período com indApuracao, depois do ideEmpregador", () => {
    const ev = eventoS3000(empregador, { tipo: "S-1200", recibo: RECIBO, cpf: trabalhador.cpf, perApur: "2026-11" }, novoId());
    expect(ev.tipo).toBe("S-3000");
    expect(ev.pendencias).toEqual([]);
    expect(ev.xml).toContain('xmlns="http://www.esocial.gov.br/schema/evt/evtExclusao/v_S_01_03_00"');
    expect(ev.xml).toContain("<ideEvento><tpAmb>2</tpAmb><procEmi>1</procEmi><verProc>Connect-DP2-1.0</verProc></ideEvento>");
    expect(ev.xml).toContain(
      `<infoExclusao><tpEvento>S-1200</tpEvento><nrRecEvt>${RECIBO}</nrRecEvt><ideTrabalhador><cpfTrab>52998224725</cpfTrab></ideTrabalhador><ideFolhaPagto><indApuracao>1</indApuracao><perApur>2026-11</perApur></ideFolhaPagto></infoExclusao>`
    );
  });

  it("S-3000 de S-1210: período sem indApuracao (exclusivo de S-1200/1202/1207/1280/1300)", () => {
    const ev = eventoS3000(empregador, { tipo: "S-1210", recibo: RECIBO, cpf: trabalhador.cpf, perApur: "2026-11" }, novoId());
    expect(ev.xml).toContain("<ideFolhaPagto><perApur>2026-11</perApur></ideFolhaPagto>");
    expect(ev.xml).not.toContain("indApuracao");
  });

  it("S-3000 de não periódico: só o trabalhador; 13º com período anual", () => {
    const ev = eventoS3000(empregador, { tipo: "S-2299", recibo: RECIBO, cpf: trabalhador.cpf, perApur: null }, novoId());
    expect(ev.xml).toContain("<ideTrabalhador><cpfTrab>52998224725</cpfTrab></ideTrabalhador></infoExclusao>");
    expect(ev.xml).not.toContain("ideFolhaPagto");
    const anual = eventoS3000(empregador, { tipo: "S-1200", recibo: RECIBO, cpf: trabalhador.cpf, perApur: "2026" }, novoId());
    expect(anual.xml).toContain("<indApuracao>2</indApuracao><perApur>2026</perApur>");
  });

  it("quais eventos o S-3000 aceita e o que cada um pede", () => {
    expect(podeExcluirPeloS3000("S-1200")).toBe(true);
    expect(podeExcluirPeloS3000("S-2200")).toBe(true);
    expect(podeExcluirPeloS3000("S-1299")).toBe(false);
    expect(podeExcluirPeloS3000("S-1010")).toBe(false);
    expect(exclusaoPedeTrabalhador("S-1210")).toBe(true);
    expect(exclusaoPedeTrabalhador("S-1280")).toBe(false);
    expect(exclusaoPedePeriodo("S-1280")).toBe(true);
    expect(exclusaoPedePeriodo("S-2230")).toBe(false);
  });

  it("S-3000 sem recibo, sem CPF ou de evento que não se exclui assim: pendência que bloqueia", () => {
    const sem = eventoS3000(empregador, { tipo: "S-1200", recibo: null, cpf: null, perApur: null }, novoId());
    expect(sem.pendencias.filter((p) => p.bloqueia).map((p) => p.texto)).toEqual([
      "Sem o recibo do S-1200 a excluir.",
      "O S-1200 a excluir é de trabalhador: falta o CPF.",
      "O S-1200 a excluir é periódico: falta o período de apuração.",
    ]);
    expect(eventoS3000(empregador, { tipo: "S-1299", recibo: RECIBO, cpf: null, perApur: "2026-11" }, novoId()).pendencias.some((p) => p.bloqueia)).toBe(true);
  });

  it("recibo: dígitos e pontos, como o eSocial devolve", () => {
    expect(reciboValido(RECIBO)).toBe(true);
    expect(reciboValido(" 1.1.0000000000000012345 ")).toBe(true);
    expect(reciboValido("abc")).toBe(false);
    expect(reciboValido("12")).toBe(false);
    expect(reciboValido("1.2.")).toBe(false);
  });

  it("S-1298: indApuracao e perApur, sem indRetif", () => {
    const ev = eventoS1298(empregador, "2026-11", novoId());
    expect(ev.xml).toContain('xmlns="http://www.esocial.gov.br/schema/evt/evtReabreEvPer/v_S_01_03_00"');
    expect(ev.xml).toContain("<ideEvento><indApuracao>1</indApuracao><perApur>2026-11</perApur><tpAmb>2</tpAmb>");
    expect(ev.xml).not.toContain("indRetif");
    expect(eventoS1298(empregador, "2026", novoId()).xml).toContain("<indApuracao>2</indApuracao><perApur>2026</perApur>");
  });

  it("retificação do S-1200 e do S-1210: indRetif 2 e nrRecibo logo depois; original sem nrRecibo", () => {
    expect(eventoS1200(empregador, "2026-11", trabalhador, novoId(), RECIBO).xml).toContain(`<ideEvento><indRetif>2</indRetif><nrRecibo>${RECIBO}</nrRecibo><indApuracao>1</indApuracao>`);
    expect(eventoS1210(empregador, "2026-11", "2026-12-05", trabalhador, novoId(), "2026-11", RECIBO).xml).toContain(`<ideEvento><indRetif>2</indRetif><nrRecibo>${RECIBO}</nrRecibo><perApur>2026-11</perApur>`);
    const original = eventoS1200(empregador, "2026-11", trabalhador, novoId()).xml;
    expect(original).toContain("<ideEvento><indRetif>1</indRetif><indApuracao>1</indApuracao>");
    expect(original).not.toContain("nrRecibo");
  });
});
