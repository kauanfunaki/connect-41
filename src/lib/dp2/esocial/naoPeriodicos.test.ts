import { describe, expect, it } from "vitest";
import { geradorDeId, type EmpregadorEsocial } from "./eventos";
import { eventoS2200, eventoS2206, eventoS2230, eventoS2298, eventoS2299, eventoS2299Transferencia, MOTIVO_DO_DESLIGAMENTO, type TrabalhadorCompleto } from "./naoPeriodicos";
import { DADOS_VAZIOS, horasSemanais, lerDadosEsocial, sugerirGrauDeInstrucao } from "./cadastro";
import { RUBRICAS_PADRAO } from "../rubricas";

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
const quando = new Date("2026-12-03T14:05:09Z");
const sindicato = { cnpj: "11.222.333/0001-81", mesDataBase: 5 };

const trabalhador = (extra: Partial<TrabalhadorCompleto> = {}): TrabalhadorCompleto => ({
  personId: "p1",
  nome: "Joana Ribeiro",
  cpf: "529.982.247-25",
  nascimento: "1990-04-12",
  endereco: { logradouro: "Rua das Flores", numero: "120", complemento: "ap 3", bairro: "Centro", cep: "80010-000", uf: "PR" },
  dados: {
    ...DADOS_VAZIOS,
    sexo: "F",
    racaCor: "3",
    estadoCivil: "1",
    grauInstrucao: "07",
    codigoMunicipio: "4106902",
    cbo: "784205",
    tipoContrato: "1",
    tipoJornada: "3",
    descricaoJornada: "Segunda a sexta, 08:00 às 17:48",
  },
  matricula: "000123",
  categoria: "101",
  admissao: "2026-11-03",
  salario: 3000,
  tipoSalario: "MENSAL",
  horasMensais: 220,
  nomeDoCargo: "Auxiliar de padaria",
  aprendiz: false,
  dependentes: [{ nome: "Ana Ribeiro", cpf: "153.509.460-56", nascimento: "2018-02-01", tipo: "03", irrf: true, salarioFamilia: true }],
  ...extra,
});

describe("cadastro do eSocial", () => {
  it("lê o JSON do contrato e descarta o que não é da tabela", () => {
    const d = lerDadosEsocial({ sexo: "F", racaCor: "9", cbo: "7842-05", codigoMunicipio: "41.06902", tipoContrato: "x" });
    expect(d).toMatchObject({ sexo: "F", racaCor: null, cbo: "784205", codigoMunicipio: "4106902", tipoContrato: "1" });
  });

  it("sugere o grau de instrução pela escolaridade escrita", () => {
    expect(sugerirGrauDeInstrucao("Superior completo em Administração")).toBe("09");
    expect(sugerirGrauDeInstrucao("Ensino médio incompleto")).toBe("06");
    expect(sugerirGrauDeInstrucao("Pós-graduação em RH")).toBe("10");
    expect(sugerirGrauDeInstrucao("")).toBeNull();
    expect(horasSemanais(220)).toBe(44);
  });
});

describe("S-2200 admissão", () => {
  it("completo: sem pendência e com trabalhador, dependente e vínculo", () => {
    const ev = eventoS2200(empregador, trabalhador(), sindicato, geradorDeId(empregador.cnpj, quando));
    expect(ev.pendencias).toEqual([]);
    expect(ev.xml).toContain('xmlns="http://www.esocial.gov.br/schema/evt/evtAdmissao/v_S_01_03_00"');
    expect(ev.xml).toContain("<cpfTrab>52998224725</cpfTrab><nmTrab>Joana Ribeiro</nmTrab><sexo>F</sexo><racaCor>3</racaCor><estCiv>1</estCiv><grauInstr>07</grauInstr>");
    expect(ev.xml).toContain("<cep>80010000</cep><codMunic>4106902</codMunic><uf>PR</uf>");
    expect(ev.xml).toContain("<dependente><tpDep>03</tpDep><nmDep>Ana Ribeiro</nmDep><dtNascto>2018-02-01</dtNascto><cpfDep>15350946056</cpfDep><depIRRF>S</depIRRF><depSF>S</depSF>");
    expect(ev.xml).toContain("<infoCeletista><dtAdm>2026-11-03</dtAdm><tpAdmissao>1</tpAdmissao><indAdmissao>1</indAdmissao><tpRegJor>1</tpRegJor><natAtividade>1</natAtividade><dtBase>05</dtBase><cnpjSindCategProf>11222333000181</cnpjSindCategProf></infoCeletista>");
    expect(ev.xml).toContain("<remuneracao><vrSalFx>3000.00</vrSalFx><undSalFixo>5</undSalFixo></remuneracao>");
    expect(ev.xml).toContain("<horContratual><qtdHrsSem>44.00</qtdHrsSem><tpJornada>3</tpJornada><tmpParc>0</tmpParc><horNoturno>N</horNoturno><dscJorn>Segunda a sexta, 08:00 às 17:48</dscJorn></horContratual>");
  });

  it("aponta o que falta, com o lugar de corrigir", () => {
    const ev = eventoS2200(
      empregador,
      trabalhador({
        dados: DADOS_VAZIOS,
        nascimento: null,
        endereco: { logradouro: null, numero: null, complemento: null, bairro: null, cep: null, uf: null },
        dependentes: [{ nome: "Ana", cpf: null, nascimento: null, tipo: "03", irrf: true, salarioFamilia: false }],
      }),
      { cnpj: null, mesDataBase: null },
      geradorDeId(empregador.cnpj, quando)
    );
    const textos = ev.pendencias.map((p) => p.texto).join(" | ");
    for (const t of ["CBO", "jornada", "sindicato", "nascimento", "sexo", "endereço", "IBGE", "dependente Ana sem data", "precisa de CPF"]) expect(textos).toContain(t);
    expect(ev.pendencias.find((p) => p.texto.includes("CBO"))?.link).toBe("/dp2/colaboradores?pessoa=p1");
  });
});

describe("S-2206, S-2230 e S-2299", () => {
  it("S-2206 leva a data e o contrato atual, sem a admissão", () => {
    const ev = eventoS2206(empregador, trabalhador({ salario: 3300 }), sindicato, { data: "2026-12-01", descricao: "Reajuste da convenção" }, geradorDeId(empregador.cnpj, quando));
    expect(ev.pendencias).toEqual([]);
    expect(ev.xml).toContain("<ideVinculo><cpfTrab>52998224725</cpfTrab><matricula>000123</matricula></ideVinculo>");
    expect(ev.xml).toContain("<altContratual><dtAlteracao>2026-12-01</dtAlteracao><dscAlt>Reajuste da convenção</dscAlt>");
    expect(ev.xml).toContain("<vrSalFx>3300.00</vrSalFx>");
    expect(ev.xml).not.toContain("dtAdm");
  });

  it("S-2230 com início e fim; motivo fora da lista pede conferência", () => {
    const t = trabalhador();
    const ev = eventoS2230(empregador, t, { motivo: "03", inicio: "2026-11-10", fim: "2026-11-25", observacao: null }, geradorDeId(empregador.cnpj, quando));
    expect(ev.xml).toContain("<iniAfastamento><dtIniAfast>2026-11-10</dtIniAfast><codMotAfast>03</codMotAfast></iniAfastamento><fimAfastamento><dtTermAfast>2026-11-25</dtTermAfast></fimAfastamento>");
    expect(ev.pendencias).toEqual([]);
    const outro = eventoS2230(empregador, t, { motivo: "21", inicio: "2026-11-10", fim: null, observacao: null }, geradorDeId(empregador.cnpj, quando));
    expect(outro.pendencias).toEqual([expect.objectContaining({ bloqueia: false })]);
    expect(outro.xml).not.toContain("fimAfastamento");
  });

  it("S-2298 reintegração judicial, por anistia e as datas", () => {
    const t = trabalhador();
    const id = () => geradorDeId(empregador.cnpj, quando);
    const judicial = eventoS2298(empregador, t, { tipo: "1", processo: "0001234-56.2026.5.09.0001", leiAnistia: null, retorno: "2026-12-01", efeito: "2026-11-15", desligamento: "2026-08-31" }, id());
    expect(judicial.pendencias).toEqual([]);
    expect(judicial.xml).toContain('xmlns="http://www.esocial.gov.br/schema/evt/evtReintegr/v_S_01_03_00"');
    expect(judicial.xml).toContain("<ideVinculo><cpfTrab>52998224725</cpfTrab><matricula>000123</matricula></ideVinculo><infoReintegr><tpReint>1</tpReint><nrProcJud>00012345620265090001</nrProcJud><dtEfetRetorno>2026-12-01</dtEfetRetorno><dtEfeito>2026-11-15</dtEfeito></infoReintegr>");
    const anistia = eventoS2298(empregador, t, { tipo: "2", processo: null, leiAnistia: "8878/1994", retorno: "2026-12-01", efeito: "2026-12-01", desligamento: "2026-08-31" }, id());
    expect(anistia.xml).toContain("<tpReint>2</tpReint><nrLeiAnistia>8878/1994</nrLeiAnistia>");
    const ruim = eventoS2298(empregador, t, { tipo: "1", processo: "123", leiAnistia: null, retorno: "2026-08-01", efeito: "2026-09-01", desligamento: "2026-08-31" }, id());
    const textos = ruim.pendencias.map((p) => p.texto).join(" | ");
    for (const x of ["20 algarismos", "no retorno ou antes", "depois do desligamento"]) expect(textos).toContain(x);
  });

  it("S-2299 com motivo, aviso indenizado e as verbas", () => {
    const ev = eventoS2299(
      empregador,
      trabalhador(),
      { motivo: "DISPENSA_SEM_JUSTA_CAUSA", data: "2026-11-20", avisoIndenizado: true, fimProjetado: "2026-12-23", verbas: [{ codigo: "001", valor: 2000 }, { codigo: "070", valor: 3300 }, { codigo: "072", valor: 0 }] },
      geradorDeId(empregador.cnpj, quando)
    );
    expect(ev.xml).toContain("<infoDeslig><mtvDeslig>02</mtvDeslig><dtDeslig>2026-11-20</dtDeslig><indPagtoAPI>S</indPagtoAPI><dtProjFimAPI>2026-12-23</dtProjFimAPI><pensAlim>0</pensAlim>");
    expect(ev.xml).toContain("<detVerbas><codRubr>070</codRubr><ideTabRubr>DP2</ideTabRubr><vrRubr>3300.00</vrRubr><indApurIR>0</indApurIR></detVerbas>");
    expect(ev.xml).not.toContain("<codRubr>072</codRubr>");
    expect(MOTIVO_DO_DESLIGAMENTO.PEDIDO_DEMISSAO).toBe("07");
    expect(MOTIVO_DO_DESLIGAMENTO.ACORDO_MUTUO).toBe("33");
  });

  it("todo papel cabe na coluna papel (VarChar 30) e todo código em codigo (VarChar 10)", () => {
    for (const r of RUBRICAS_PADRAO) {
      expect((r.papel ?? "").length, r.papel ?? "").toBeLessThanOrEqual(30);
      expect(r.codigo.length).toBeLessThanOrEqual(10);
    }
  });

  it("as rubricas de rescisão estão na lista padrão", () => {
    const papeis = RUBRICAS_PADRAO.map((r) => r.papel);
    for (const p of ["AVISO_INDENIZADO", "AVISO_DESCONTO", "FERIAS_VENCIDAS_INDENIZADAS", "FERIAS_PROPORC_INDENIZADAS", "TERCO_FERIAS_INDENIZADAS"]) expect(papeis).toContain(p);
    expect(RUBRICAS_PADRAO.find((r) => r.papel === "AVISO_INDENIZADO")).toMatchObject({ incideInss: false, incideFgts: true, incideIrrf: false });
  });
});

describe("remuneração variável no contrato (funcionalidade-760)", () => {
  it("vai no dscSalVar do S-2200", () => {
    const t = trabalhador();
    const ev = eventoS2200(empregador, { ...t, dados: { ...t.dados, remuneracaoVariavel: "Comissão de 3% sobre as vendas" } }, sindicato, geradorDeId(empregador.cnpj, quando));
    expect(ev.xml).toContain("<undSalFixo>5</undSalFixo><dscSalVar>Comissão de 3% sobre as vendas</dscSalVar></remuneracao>");
    expect(eventoS2200(empregador, trabalhador(), sindicato, geradorDeId(empregador.cnpj, quando)).xml).not.toContain("dscSalVar");
  });
});

describe("transferência entre empresas do grupo (funcionalidade-771)", () => {
  it("S-2299 da origem: motivo 11, véspera da transferência, sucessora e sem verbas", () => {
    const ev = eventoS2299Transferencia(empregador, trabalhador(), { ultimoDia: "2027-06-15", cnpjSucessora: "11.222.333/0001-81", observacao: "Transferência para a filial" }, geradorDeId(empregador.cnpj, quando));
    expect(ev.tipo).toBe("S-2299");
    expect(ev.xml).toContain("<mtvDeslig>11</mtvDeslig><dtDeslig>2027-06-15</dtDeslig><indPagtoAPI>N</indPagtoAPI><pensAlim>0</pensAlim>");
    expect(ev.xml).toContain("<sucessaoVinc><tpInsc>1</tpInsc><nrInsc>11222333000181</nrInsc></sucessaoVinc>");
    expect(ev.xml).not.toContain("verbasResc");
    expect(ev.referencia).toContain("transferência");
    expect(ev.pendencias.filter((p) => p.bloqueia)).toEqual([]);
  });

  it("S-2299 sem CNPJ da sucessora aponta a pendência", () => {
    const ev = eventoS2299Transferencia(empregador, trabalhador(), { ultimoDia: "2027-06-15", cnpjSucessora: null, observacao: null }, geradorDeId(empregador.cnpj, quando));
    expect(ev.pendencias.map((p) => p.texto).join(" ")).toMatch(/destino.*CNPJ/);
  });

  it("S-2200 do destino: tpAdmissao 2, admissão original e sucessaoVinc", () => {
    const ev = eventoS2200(empregador, trabalhador(), sindicato, geradorDeId(empregador.cnpj, quando), { cnpjAnterior: "11.222.333/0001-81", matriculaAnterior: "M-77", data: "2027-06-16", observacao: null });
    expect(ev.xml).toContain("<dtAdm>2026-11-03</dtAdm><tpAdmissao>2</tpAdmissao>");
    expect(ev.xml).toContain("<sucessaoVinc><tpInsc>1</tpInsc><nrInsc>11222333000181</nrInsc><matricAnt>M-77</matricAnt><dtTransf>2027-06-16</dtTransf></sucessaoVinc>");
    expect(ev.xml.indexOf("</infoContrato>")).toBeLessThan(ev.xml.indexOf("<sucessaoVinc>"));
    expect(ev.referencia).toContain("sucessão");
  });

  it("S-2200 sem a matrícula anterior aponta a pendência", () => {
    const ev = eventoS2200(empregador, trabalhador(), sindicato, geradorDeId(empregador.cnpj, quando), { cnpjAnterior: "11.222.333/0001-81", matriculaAnterior: null, data: "2027-06-16", observacao: null });
    expect(ev.pendencias.map((p) => p.texto).join(" ")).toMatch(/matrícula/);
  });
});
