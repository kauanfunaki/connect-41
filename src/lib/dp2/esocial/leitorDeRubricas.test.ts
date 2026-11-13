import { describe, expect, it } from "vitest";
import type { RubricaEsocial } from "./eventos";
import { compararComEsocial, conferirRubrica, lerS1010 } from "./leitorDeRubricas";

const rubrica = (extra: Partial<RubricaEsocial> = {}): RubricaEsocial => ({
  codigo: "001",
  nome: "Salário",
  tipo: "PROVENTO",
  papel: "SALARIO",
  incideInss: true,
  incideFgts: true,
  incideIrrf: true,
  naturezaEsocial: "1000",
  codIncCP: null,
  codIncIRRF: null,
  codIncFGTS: null,
  ...extra,
});

const s1010 = (codigo: string, tabela: string, dados: string, op: "inclusao" | "alteracao" | "exclusao" = "inclusao") =>
  `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtTabRubrica/v_S_01_03_00"><evtTabRubrica Id="ID1"><ideEvento><tpAmb>1</tpAmb></ideEvento>` +
  `<infoRubrica><${op}><ideRubrica><codRubr>${codigo}</codRubr><ideTabRubr>${tabela}</ideTabRubr><iniValid>2021-07</iniValid></ideRubrica>` +
  (op === "exclusao" ? "" : `<dadosRubrica>${dados}</dadosRubrica>`) +
  `</${op}></infoRubrica></evtTabRubrica></eSocial>`;

describe("conferência da rubrica do Connect", () => {
  it("salário certinho não tem divergência", () => {
    expect(conferirRubrica(rubrica())).toEqual([]);
  });

  it("aponta natureza ausente, trocada e incompatível com o tipo", () => {
    expect(conferirRubrica(rubrica({ naturezaEsocial: null }))[0]).toMatchObject({ campo: "Natureza", gravidade: "erro" });
    expect(conferirRubrica(rubrica({ naturezaEsocial: "1003" })).map((d) => d.texto).join(" ")).toContain("espera a natureza 1000");
    expect(conferirRubrica(rubrica({ papel: null, naturezaEsocial: "9201" })).map((d) => d.texto).join(" ")).toContain("é de desconto");
  });

  it("código de incidência gravado que contradiz a marcação do Connect", () => {
    const d = conferirRubrica(rubrica({ codIncCP: "00", codIncFGTS: "00" }));
    expect(d.map((x) => x.campo)).toEqual(expect.arrayContaining(["INSS", "FGTS"]));
    expect(d.every((x) => x.gravidade === "erro")).toBe(true);
  });

  it("INSS descontado (31) e salário-família (51) não são divergência", () => {
    expect(conferirRubrica(rubrica({ codigo: "053", nome: "INSS", tipo: "DESCONTO", papel: "INSS", incideInss: false, incideFgts: false, incideIrrf: false, naturezaEsocial: "9201", codIncIRRF: "31" }))).toEqual([]);
  });
});

describe("leitura do S-1010", () => {
  it("lê inclusões e alterações, com a última valendo, e tira as exclusões", () => {
    const xml = [
      s1010("001", "DOM", "<dscRubr>Salario &amp; ordenado</dscRubr><natRubr>1000</natRubr><tpRubr>1</tpRubr><codIncCP>11</codIncCP><codIncIRRF>11</codIncIRRF><codIncFGTS>11</codIncFGTS>"),
      s1010("001", "DOM", "<dscRubr>Salário</dscRubr><natRubr>1000</natRubr><tpRubr>1</tpRubr><codIncCP>11</codIncCP><codIncIRRF>11</codIncIRRF><codIncFGTS>11</codIncFGTS>", "alteracao"),
      s1010("777", "DOM", "<dscRubr>Ajuda de custo</dscRubr><natRubr>1601</natRubr><tpRubr>1</tpRubr><codIncCP>00</codIncCP><codIncIRRF>00</codIncIRRF><codIncFGTS>00</codIncFGTS>"),
      s1010("888", "DOM", "", "exclusao"),
    ].join("\n");
    const r = lerS1010(xml);
    expect(r.map((x) => x.codigo)).toEqual(["001", "777"]);
    expect(r[0]).toMatchObject({ nome: "Salário", tabela: "DOM", natureza: "1000", tipo: "1", codIncFGTS: "11", inicio: "2021-07" });
    expect(lerS1010(s1010("002", "X", "<dscRubr>A &amp; B</dscRubr>"))[0].nome).toBe("A & B");
  });
});

describe("comparação eSocial x Connect", () => {
  it("separa iguais, diferentes e o que só existe de um lado", () => {
    const doEsocial = lerS1010(
      [
        s1010("001", "DOM", "<dscRubr>Salário</dscRubr><natRubr>1000</natRubr><tpRubr>1</tpRubr><codIncCP>11</codIncCP><codIncIRRF>11</codIncIRRF><codIncFGTS>11</codIncFGTS>"),
        s1010("002", "DOM", "<dscRubr>HE</dscRubr><natRubr>1003</natRubr><tpRubr>1</tpRubr><codIncCP>11</codIncCP><codIncIRRF>11</codIncIRRF><codIncFGTS>00</codIncFGTS>"),
        s1010("777", "DOM", "<dscRubr>Ajuda de custo</dscRubr><natRubr>1601</natRubr><tpRubr>1</tpRubr>"),
      ].join("")
    );
    const sistema = [rubrica(), rubrica({ codigo: "002", nome: "Horas extras 50%", papel: "HE50", naturezaEsocial: "1003" }), rubrica({ codigo: "090", nome: "FGTS", tipo: "INFORMATIVA", papel: "FGTS" })];
    const c = compararComEsocial(sistema, doEsocial);
    expect(c.iguais).toBe(1);
    expect(c.divergencias).toEqual([expect.objectContaining({ codigo: "002", campo: "Incidência FGTS", texto: "Connect: 11 · eSocial: 00" })]);
    expect(c.soNoSistema.map((r) => r.codigo)).toEqual(["090"]);
    expect(c.soNoEsocial.map((r) => r.codigo)).toEqual(["777"]);
    expect(c.outrasTabelas).toEqual(["DOM"]);
  });
});
