import { describe, expect, it } from "vitest";
import { cnpjValido, cpfValido, cnaeDoEsocial, idDoEvento } from "./documentos";
import { el, serializar, decimal } from "./xml";
import {
  classificacaoTributaria,
  eventoS1000,
  eventoS1005,
  eventoS1010,
  eventoS1020,
  eventoS1200,
  eventoS1210,
  eventoS1299,
  geradorDeId,
  incidencias,
  loteParaConferencia,
  type EmpregadorEsocial,
  type RubricaEsocial,
  type TrabalhadorEsocial,
} from "./eventos";

const empregador: EmpregadorEsocial = {
  cnpj: "48.291.730/0001-15",
  nome: "Panificadora",
  classTrib: "01",
  cnae: "1091-1/02",
  ratAliquota: 2,
  fap: 1,
  fpas: "507",
  codTercs: "0079",
  iniValid: "2026-11",
};
const quando = new Date("2026-12-03T14:05:09Z");
const trabalhador: TrabalhadorEsocial = {
  personId: "p1",
  nome: "Joana Ribeiro",
  cpf: "529.982.247-25",
  matricula: "000123",
  categoria: "101",
  itens: [
    { codigo: "001", tipo: "PROVENTO", referencia: "30 dias", valor: 3000, quantidade: null },
    { codigo: "002", tipo: "PROVENTO", referencia: "10 h", valor: 204.55, quantidade: 10 },
    { codigo: "053", tipo: "DESCONTO", referencia: "", valor: 277.87, quantidade: null },
  ],
  liquido: 2926.68,
};
const rubrica = (extra: Partial<RubricaEsocial>): RubricaEsocial => ({
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

describe("documentos", () => {
  it("valida CPF e CNPJ pelos dígitos", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("529.982.247-26")).toBe(false);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cnpjValido("48.291.730/0001-15")).toBe(true);
    expect(cnpjValido("48.291.730/0001-16")).toBe(false);
  });

  it("CNAE com 7 dígitos e Id com 36 caracteres a partir da raiz do CNPJ", () => {
    expect(cnaeDoEsocial("1091-1/02")).toBe("1091102");
    expect(cnaeDoEsocial("1091")).toBeNull();
    const id = idDoEvento("48.291.730/0001-15", quando, 7);
    expect(id).toBe("ID14829173000000020261203140509" + "00007");
    expect(id).toHaveLength(36);
  });
});

describe("xml", () => {
  it("omite vazio, escapa e mantém a ordem", () => {
    expect(serializar(el("a", [el("b", "x & y"), el("c", null), el("d", [el("e", "")])]))).toBe("<a><b>x &amp; y</b></a>");
    expect(decimal(1234.5)).toBe("1234.50");
    expect(decimal(1, 4)).toBe("1.0000");
  });
});

describe("classificação e incidências", () => {
  it("classificação tributária pelo regime", () => {
    expect(classificacaoTributaria("SIMPLES_NACIONAL", true, null)).toBe("01");
    expect(classificacaoTributaria("SIMPLES_NACIONAL", false, null)).toBe("02");
    expect(classificacaoTributaria("LUCRO_PRESUMIDO", false, null)).toBe("99");
    expect(classificacaoTributaria("IMUNE_ISENTA", false, null)).toBeNull();
    expect(classificacaoTributaria("IMUNE_ISENTA", false, "85")).toBe("85");
  });

  it("incidências sugeridas pelo papel, com o que conferir", () => {
    expect(incidencias(rubrica({}))).toEqual({ cp: "11", irrf: "11", fgts: "11", conferir: [] });
    expect(incidencias(rubrica({ papel: "INSS", tipo: "DESCONTO", incideInss: false, incideFgts: false, incideIrrf: false }))).toMatchObject({ cp: "31", fgts: "00", conferir: ["IRRF"] });
    expect(incidencias(rubrica({ papel: "IRRF", tipo: "DESCONTO", incideInss: false, incideFgts: false, incideIrrf: false })).irrf).toBe("31");
    expect(incidencias(rubrica({ papel: "DECIMO_SEGUNDA" }))).toMatchObject({ cp: "12", fgts: "12" });
    expect(incidencias(rubrica({ papel: "INSS", codIncIRRF: "41", tipo: "DESCONTO" })).conferir).toEqual([]);
  });
});

describe("eventos de tabela", () => {
  it("S-1000 com namespace, Id e classificação", () => {
    const ev = eventoS1000(empregador, geradorDeId(empregador.cnpj, quando));
    expect(ev.xml).toContain('<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtInfoEmpregador/v_S_01_03_00">');
    expect(ev.xml).toContain(`<evtInfoEmpregador Id="${ev.idEvento}">`);
    expect(ev.xml).toContain("<ideEmpregador><tpInsc>1</tpInsc><nrInsc>48291730</nrInsc></ideEmpregador>");
    expect(ev.xml).toContain("<classTrib>01</classTrib>");
    expect(ev.pendencias).toEqual([]);
  });

  it("S-1000 sem classificação vira pendência que bloqueia", () => {
    const ev = eventoS1000({ ...empregador, classTrib: null }, geradorDeId(empregador.cnpj, quando));
    expect(ev.pendencias[0]).toMatchObject({ onde: "empresa", bloqueia: true });
    expect(ev.xml).not.toContain("classTrib");
  });

  it("S-1005 com CNAE e RAT/FAP; S-1020 pede FPAS e terceiros", () => {
    const s1005 = eventoS1005(empregador, geradorDeId(empregador.cnpj, quando));
    expect(s1005.xml).toContain("<cnaePrep>1091102</cnaePrep><aliqGilrat><aliqRat>2</aliqRat><fap>1.0000</fap></aliqGilrat>");
    const s1020 = eventoS1020({ ...empregador, fpas: null }, geradorDeId(empregador.cnpj, quando));
    expect(s1020.pendencias.some((p) => p.texto.includes("FPAS"))).toBe(true);
  });

  it("S-1010 exige a natureza e manda conferir o IRRF sugerido do INSS", () => {
    const sem = eventoS1010(empregador, rubrica({ naturezaEsocial: null }), geradorDeId(empregador.cnpj, quando));
    expect(sem.pendencias.some((p) => p.bloqueia && p.texto.includes("natureza"))).toBe(true);
    const inss = eventoS1010(empregador, rubrica({ codigo: "053", nome: "INSS", tipo: "DESCONTO", papel: "INSS", naturezaEsocial: "9201", incideInss: false, incideFgts: false, incideIrrf: false }), geradorDeId(empregador.cnpj, quando));
    expect(inss.xml).toContain("<tpRubr>2</tpRubr><codIncCP>31</codIncCP>");
    expect(inss.pendencias).toEqual([expect.objectContaining({ bloqueia: false })]);
  });
});

describe("eventos periódicos", () => {
  it("S-1200 com os itens, quantidade só quando há, e matrícula", () => {
    const ev = eventoS1200(empregador, "2026-11", trabalhador, geradorDeId(empregador.cnpj, quando));
    expect(ev.pendencias).toEqual([]);
    expect(ev.xml).toContain("<perApur>2026-11</perApur>");
    expect(ev.xml).toContain("<cpfTrab>52998224725</cpfTrab>");
    expect(ev.xml).toContain("<ideDmDev>FOLHA202611</ideDmDev><codCateg>101</codCateg>");
    expect(ev.xml).toContain("<itensRemun><codRubr>002</codRubr><ideTabRubr>DP2</ideTabRubr><qtdRubr>10.00</qtdRubr><vrRubr>204.55</vrRubr><indApurIR>0</indApurIR></itensRemun>");
    expect(ev.xml).toContain("<itensRemun><codRubr>001</codRubr><ideTabRubr>DP2</ideTabRubr><vrRubr>3000.00</vrRubr>");
  });

  it("S-1200 soma a mesma rubrica que veio de duas origens", () => {
    const t = { ...trabalhador, itens: [...trabalhador.itens, { codigo: "002", tipo: "PROVENTO", referencia: "2,5 h", valor: 51.14, quantidade: 2.5 }] };
    const ev = eventoS1200(empregador, "2026-11", t, geradorDeId(empregador.cnpj, quando));
    expect(ev.xml.match(/<codRubr>002<\/codRubr>/g)).toHaveLength(1);
    expect(ev.xml).toContain("<qtdRubr>12.50</qtdRubr><vrRubr>255.69</vrRubr>");
  });

  it("S-1200 sem CPF válido e sem matrícula bloqueia", () => {
    const ev = eventoS1200(empregador, "2026-11", { ...trabalhador, cpf: null, matricula: null }, geradorDeId(empregador.cnpj, quando));
    expect(ev.pendencias.filter((p) => p.bloqueia)).toHaveLength(2);
  });

  it("S-1210 liga ao demonstrativo e pede a data de pagamento", () => {
    const ev = eventoS1210(empregador, "2026-11", "2026-12-05", trabalhador, geradorDeId(empregador.cnpj, quando));
    expect(ev.xml).toContain("<infoPgto><dtPgto>2026-12-05</dtPgto><tpPgto>1</tpPgto><perRef>2026-11</perRef><ideDmDev>FOLHA202611</ideDmDev><vrLiq>2926.68</vrLiq></infoPgto>");
    expect(eventoS1210(empregador, "2026-11", null, trabalhador, geradorDeId(empregador.cnpj, quando)).pendencias.some((p) => p.texto.includes("data do pagamento"))).toBe(true);
  });

  it("S-1299 fecha com a remuneração informada; Ids diferentes no mesmo segundo", () => {
    const novoId = geradorDeId(empregador.cnpj, quando);
    const a = eventoS1299(empregador, "2026-11", true, novoId);
    const b = eventoS1299(empregador, "2026-11", false, novoId);
    expect(a.xml).toContain("<evtRemun>S</evtRemun>");
    expect(b.xml).toContain("<evtRemun>N</evtRemun>");
    expect(a.idEvento).not.toBe(b.idEvento);
  });

  it("lote de conferência com grupo, empregador e transmissor", () => {
    const ev = eventoS1299(empregador, "2026-11", true, geradorDeId(empregador.cnpj, quando));
    const lote = loteParaConferencia(empregador.cnpj, "11.222.333/0001-81", "3", [ev]);
    expect(lote).toContain('<envioLoteEventos grupo="3">');
    expect(lote).toContain("<ideTransmissor><tpInsc>1</tpInsc><nrInsc>11222333000181</nrInsc></ideTransmissor>");
    expect(lote).toContain(`<evento Id="${ev.idEvento}"><eSocial`);
  });
});
