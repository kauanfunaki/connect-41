import { describe, expect, it } from "vitest";
import { geradorDeId, type EmpregadorEsocial } from "./eventos";
import { eventoS2210, eventoS2220, eventoS2240, lerAgentes, lerProcedimentos, lerResponsaveis, SEM_AGENTE_NOCIVO, type Cat } from "./sst";

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
const id = () => geradorDeId(empregador.cnpj, quando);
const joana = { personId: "p1", nome: "Joana Ribeiro", cpf: "529.982.247-25", matricula: "000123" };
const resp = lerResponsaveis({
  medicoNome: "Dra. Paula Lima",
  medicoCpf: "153.509.460-56",
  medicoCrm: "12345",
  medicoUf: "pr",
  ambientalNome: "Eng. Marcos Dias",
  ambientalCpf: "153.509.460-56",
  ambientalOrgao: "4",
  ambientalNumero: "PR-998877",
  ambientalUf: "PR",
});

describe("responsáveis e leitura de códigos", () => {
  it("lê o JSON da empresa e descarta UF e órgão inválidos", () => {
    expect(resp).toMatchObject({ medicoCpf: "15350946056", medicoUf: "PR", ambientalOrgao: "4" });
    expect(lerResponsaveis({ medicoUf: "XX", ambientalOrgao: "7" })).toMatchObject({ medicoUf: null, ambientalOrgao: null });
    expect(lerResponsaveis(null).medicoNome).toBeNull();
  });

  it("separa procedimentos e agentes digitados", () => {
    expect(lerProcedimentos("0295, 0693;0295 12")).toEqual(["0295", "0693"]);
    expect(lerAgentes("01.18.001 ; 02.01.001, xx")).toEqual(["01.18.001", "02.01.001"]);
  });
});

describe("S-2220 ASO", () => {
  it("completo: exame clínico primeiro, médico e responsável do PCMSO", () => {
    const ev = eventoS2220(empregador, joana, { tipoExame: "0", data: "2026-11-01", resultado: "1", procedimentos: ["0295", "0693"], medicoNome: "Dr. Rui", medicoCrm: "555", medicoUf: "PR" }, resp, id());
    expect(ev.pendencias).toEqual([]);
    expect(ev.xml).toContain('xmlns="http://www.esocial.gov.br/schema/evt/evtMonit/v_S_01_03_00"');
    expect(ev.xml).toContain("<exMedOcup><tpExameOcup>0</tpExameOcup><aso><dtAso>2026-11-01</dtAso><resAso>1</resAso><exame><dtExm>2026-11-01</dtExm><procRealizado>0295</procRealizado><ordExame>1</ordExame></exame>");
    expect(ev.xml).toContain("<ordExame>2</ordExame>");
    expect(ev.xml).toContain("<respMonit><cpfResp>15350946056</cpfResp><nmResp>Dra. Paula Lima</nmResp><nrCRM>12345</nrCRM><ufCRM>PR</ufCRM></respMonit>");
  });

  it("sem médico do PCMSO aponta a configuração da empresa", () => {
    const ev = eventoS2220(empregador, joana, { tipoExame: "1", data: null, resultado: "1", procedimentos: [], medicoNome: null, medicoCrm: null, medicoUf: null }, lerResponsaveis({}), id());
    const textos = ev.pendencias.map((p) => p.texto).join(" | ");
    for (const t of ["data do ASO", "procedimento", "médico que assinou", "PCMSO"]) expect(textos).toContain(t);
    expect(ev.pendencias.find((p) => p.texto.includes("PCMSO"))?.link).toBe("/dp2/configuracao");
  });
});

describe("S-2240 condições ambientais", () => {
  it("sem agente nocivo sai pronto com o código de ausência", () => {
    const ev = eventoS2240(empregador, joana, { inicio: "2026-11-03", setor: "Produção", atividade: "Prepara massas", agentes: [], usaEpc: "0", usaEpi: "0" }, resp, id());
    expect(ev.pendencias).toEqual([]);
    expect(ev.xml).toContain(`<agNoc><codAgNoc>${SEM_AGENTE_NOCIVO}</codAgNoc></agNoc>`);
    expect(ev.xml).toContain("<infoAmb><localAmb>1</localAmb><dscSetor>Produção</dscSetor><tpInsc>1</tpInsc><nrInsc>48291730000115</nrInsc></infoAmb>");
    expect(ev.xml).toContain("<respReg><cpfResp>15350946056</cpfResp><ideOC>4</ideOC><nrOC>PR-998877</nrOC><ufOC>PR</ufOC></respReg>");
  });

  it("com agente nocivo leva EPC/EPI e pede conferência sem bloquear", () => {
    const ev = eventoS2240(empregador, joana, { inicio: "2026-11-03", setor: "Forno", atividade: "Opera o forno", agentes: ["02.01.006"], usaEpc: "2", usaEpi: "2" }, resp, id());
    expect(ev.xml).toContain("<agNoc><codAgNoc>02.01.006</codAgNoc><tpAval>2</tpAval><epcEpi><utilizEPC>2</utilizEPC><utilizEPI>2</utilizEPI></epcEpi></agNoc>");
    expect(ev.xml).not.toContain(SEM_AGENTE_NOCIVO);
    expect(ev.pendencias).toEqual([expect.objectContaining({ bloqueia: false })]);
  });
});

describe("S-2210 CAT", () => {
  const cat: Cat = {
    dataAcidente: "2026-11-15",
    horaAcidente: "09:30",
    horasTrabalhadasAntes: "0130",
    tipoAcidente: "1",
    obito: false,
    comunicouPolicia: false,
    situacaoGeradora: "200004300",
    ultimoDiaTrabalhado: "2026-11-15",
    houveAfastamento: true,
    localDescricao: "Cozinha",
    localLogradouro: "Rua das Flores",
    localNumero: "",
    localCep: "80010-000",
    localMunicipio: "4106902",
    localUf: "PR",
    parteAtingida: "755010000",
    lateralidade: "2",
    agenteCausador: "303010000",
    dataAtendimento: "2026-11-15",
    horaAtendimento: "1015",
    internacao: false,
    diasDeTratamento: 7,
    naturezaDaLesao: "702010000",
    cid: "S61.0",
    emitenteNome: "Dr. Rui",
    emitenteCrm: "555",
    emitenteUf: "PR",
    observacao: null,
  };

  it("completa: acidente, local, parte atingida e atestado", () => {
    const ev = eventoS2210(empregador, joana, cat, id());
    expect(ev.pendencias).toEqual([]);
    expect(ev.xml).toContain('xmlns="http://www.esocial.gov.br/schema/evt/evtCAT/v_S_01_03_00"');
    expect(ev.xml).toContain("<dtAcid>2026-11-15</dtAcid><tpAcid>1</tpAcid><hrAcid>0930</hrAcid><hrsTrabAntesAcid>0130</hrsTrabAntesAcid><tpCat>1</tpCat>");
    expect(ev.xml).toContain("<nrLograd>S/N</nrLograd><cep>80010000</cep><codMunic>4106902</codMunic><uf>PR</uf>");
    expect(ev.xml).toContain("<parteAtingida><codParteAting>755010000</codParteAting><lateralidade>2</lateralidade></parteAtingida>");
    expect(ev.xml).toContain("<durTrat>7</durTrat><indAfast>S</indAfast><dscLesao>702010000</dscLesao><codCID>S610</codCID>");
  });

  it("aponta o que falta", () => {
    const ev = eventoS2210(empregador, joana, { ...cat, horaAcidente: null, parteAtingida: "12", cid: "", localCep: null }, id());
    const textos = ev.pendencias.map((p) => p.texto).join(" | ");
    for (const t of ["hora do acidente", "parte do corpo", "CID", "local do acidente"]) expect(textos).toContain(t);
    expect(eventoS2210(empregador, joana, { ...cat, tipoAcidente: "2", horaAcidente: null }, id()).pendencias).toEqual([]);
  });
});
