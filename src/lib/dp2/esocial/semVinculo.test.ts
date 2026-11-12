import { describe, expect, it } from "vitest";
import { eventoS1200, eventoS1210, geradorDeId, type EmpregadorEsocial, type TrabalhadorEsocial } from "./eventos";
import { eventoS2300, eventoS2399 } from "./semVinculo";
import { DADOS_VAZIOS, lerDadosEsocial } from "./cadastro";
import type { TrabalhadorCompleto } from "./naoPeriodicos";

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
const id = () => geradorDeId(empregador.cnpj, new Date("2026-12-03T14:05:09Z"));

const pessoa = (extra: Partial<TrabalhadorCompleto> = {}): TrabalhadorCompleto => ({
  personId: "p9",
  nome: "Lucas Prado",
  cpf: "529.982.247-25",
  nascimento: "2004-03-10",
  endereco: { logradouro: "Rua das Flores", numero: "120", complemento: null, bairro: "Centro", cep: "80010-000", uf: "PR" },
  dados: { ...DADOS_VAZIOS, sexo: "M", racaCor: "1", estadoCivil: "1", grauInstrucao: "08", codigoMunicipio: "4106902", cbo: "142105" },
  matricula: "EST001",
  categoria: "901",
  admissao: "2026-11-03",
  salario: 1500,
  tipoSalario: "MENSAL",
  horasMensais: 120,
  nomeDoCargo: "Estagiário de administração",
  aprendiz: false,
  dependentes: [],
  ...extra,
});

const estagio = lerDadosEsocial({
  ...pessoa().dados,
  estagioNatureza: "N",
  estagioNivel: "4",
  estagioArea: "Administração",
  estagioPrevisaoTermino: "2027-11-02",
  estagioCnpjInstituicao: "11.222.333/0001-81",
  estagioCpfSupervisor: "153.509.460-56",
});

describe("dados do estágio", () => {
  it("lê os campos do estágio e descarta o que não é da tabela", () => {
    expect(estagio).toMatchObject({ estagioNatureza: "N", estagioNivel: "4", estagioCnpjInstituicao: "11222333000181", estagioCpfSupervisor: "15350946056" });
    expect(lerDadosEsocial({ estagioNivel: "7", estagioNatureza: "X" })).toMatchObject({ estagioNivel: null, estagioNatureza: null });
  });
});

describe("S-2300 início sem vínculo", () => {
  it("estagiário completo: trabalhador, categoria e infoEstagiario", () => {
    const ev = eventoS2300(empregador, pessoa({ dados: estagio }), id());
    expect(ev.pendencias).toEqual([]);
    expect(ev.xml).toContain('xmlns="http://www.esocial.gov.br/schema/evt/evtTSVInicio/v_S_01_03_00"');
    expect(ev.xml).toContain("<trabalhador><cpfTrab>52998224725</cpfTrab><nmTrab>Lucas Prado</nmTrab>");
    expect(ev.xml).toContain("<infoTSVInicio><cadIni>N</cadIni><matricula>EST001</matricula><codCateg>901</codCateg><dtInicio>2026-11-03</dtInicio><natAtividade>1</natAtividade>");
    expect(ev.xml).toContain(
      "<infoEstagiario><natEstagio>N</natEstagio><nivEstagio>4</nivEstagio><areaAtuacao>Administração</areaAtuacao><dtPrevTerm>2027-11-02</dtPrevTerm><instEnsino><cnpjInstEnsino>11222333000181</cnpjInstEnsino></instEnsino><cpfSupervisor>15350946056</cpfSupervisor></infoEstagiario>"
    );
    expect(ev.xml).not.toContain("cargoFuncao");
  });

  it("estagiário sem os dados do estágio aponta o contrato", () => {
    const ev = eventoS2300(empregador, pessoa(), id());
    const textos = ev.pendencias.map((p) => p.texto).join(" | ");
    for (const t of ["natureza e o nível", "previsão de término", "instituição de ensino"]) expect(textos).toContain(t);
    expect(ev.pendencias[0].link).toBe("/dp2/colaboradores?pessoa=p9");
  });

  it("sócio com cargo e pró-labore; RPA sem valor fixo sai como variável", () => {
    const socio = eventoS2300(empregador, pessoa({ categoria: "723", salario: 8000, nomeDoCargo: "Sócio administrador", matricula: "SOC01" }), id());
    expect(socio.pendencias).toEqual([]);
    expect(socio.xml).toContain("<cargoFuncao><nmCargo>Sócio administrador</nmCargo><CBOCargo>142105</CBOCargo></cargoFuncao><remuneracao><vrSalFx>8000.00</vrSalFx><undSalFixo>5</undSalFixo></remuneracao>");
    expect(socio.xml).not.toContain("infoEstagiario");
    const rpa = eventoS2300(empregador, pessoa({ categoria: "701", salario: 0, matricula: "RPA01" }), id());
    expect(rpa.xml).toContain("<remuneracao><vrSalFx>0.00</vrSalFx><undSalFixo>7</undSalFixo><dscSalVar>Valor por servico prestado (RPA)</dscSalVar></remuneracao>");
  });

  it("empregado não vai no S-2300", () => {
    const ev = eventoS2300(empregador, pessoa({ categoria: "101", dados: estagio }), id());
    expect(ev.pendencias.map((p) => p.texto).join(" ")).toContain("S-2200");
  });
});

describe("S-2399 término", () => {
  it("com matrícula identifica por ela; sem, pela categoria", () => {
    const com = eventoS2399(empregador, { personId: "p9", nome: "Lucas", cpf: "529.982.247-25", matricula: "EST001", categoria: "901" }, "2027-06-30", id());
    expect(com.pendencias).toEqual([]);
    expect(com.xml).toContain("<ideTrabSemVinculo><cpfTrab>52998224725</cpfTrab><matricula>EST001</matricula></ideTrabSemVinculo><infoTSVTermino><dtTerm>2027-06-30</dtTerm></infoTSVTermino>");
    const sem = eventoS2399(empregador, { personId: "p9", nome: "Lucas", cpf: "529.982.247-25", matricula: null, categoria: "723" }, null, id());
    expect(sem.xml).toContain("<ideTrabSemVinculo><cpfTrab>52998224725</cpfTrab><codCateg>723</codCateg></ideTrabSemVinculo>");
    expect(sem.pendencias.map((p) => p.texto)).toContain("Informe a data do término.");
  });
});

describe("S-1200 de quem não tem vínculo", () => {
  const base: TrabalhadorEsocial = {
    personId: "p9",
    nome: "Lucas Prado",
    cpf: "529.982.247-25",
    matricula: null,
    categoria: "723",
    itens: [{ codigo: "080", tipo: "PROVENTO", referencia: "30 dias", valor: 8000, quantidade: null }],
    liquido: 7000,
    nascimento: "1980-05-02",
  };

  it("sócio sem S-2300: sem matrícula, com nome e nascimento", () => {
    const ev = eventoS1200(empregador, "2026-11", base, id());
    expect(ev.pendencias).toEqual([]);
    expect(ev.xml).toContain("<ideTrabalhador><cpfTrab>52998224725</cpfTrab><infoComplem><nmTrab>Lucas Prado</nmTrab><dtNascto>1980-05-02</dtNascto></infoComplem></ideTrabalhador>");
    expect(ev.xml).toContain("<codCateg>723</codCateg>");
    expect(ev.xml).not.toContain("<matricula>");
    expect(eventoS1210(empregador, "2026-11", "2026-12-05", { ...base, nascimento: null }, id()).pendencias).toEqual([]);
  });

  it("sócio com matrícula usa a matrícula; estagiário sem matrícula é pendência", () => {
    const ev = eventoS1200(empregador, "2026-11", { ...base, matricula: "SOC01" }, id());
    expect(ev.xml).not.toContain("infoComplem");
    expect(ev.xml).toContain("<matricula>SOC01</matricula>");
    const est = eventoS1200(empregador, "2026-11", { ...base, categoria: "901" }, id());
    expect(est.pendencias.map((p) => p.texto).join(" ")).toContain("matrícula");
    const semNasc = eventoS1200(empregador, "2026-11", { ...base, nascimento: null }, id());
    expect(semNasc.pendencias.map((p) => p.texto).join(" ")).toContain("nascimento");
  });
});
