import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { geradorDeId, type EmpregadorEsocial } from "./eventos";
import { eventoS2200, type TrabalhadorCompleto } from "./naoPeriodicos";
import { DADOS_VAZIOS } from "./cadastro";
import { consolidarTrabalhadores, contagemDeDependentes, lerArquivosDoEsocial, raizDoCnpj } from "./importacao";

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
const sindicato = { cnpj: "11.222.333/0001-81", mesDataBase: 5 };
const quando = new Date("2026-12-03T14:05:09Z");

const joana: TrabalhadorCompleto = {
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
};

const admissao = (t = joana, cnpj = empregador.cnpj) => eventoS2200({ ...empregador, cnpj }, t, sindicato, geradorDeId(cnpj, quando)).xml;

const alteracaoContratual = (data: string, salario: string, retif = "1") => `<?xml version="1.0" encoding="UTF-8"?>
<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtAltContratual/v_S_01_03_00">
  <evtAltContratual Id="ID1482917300000002026120314050900002">
    <ideEvento><indRetif>${retif}</indRetif><tpAmb>1</tpAmb><procEmi>1</procEmi><verProc>x</verProc></ideEvento>
    <ideEmpregador><tpInsc>1</tpInsc><nrInsc>48291730</nrInsc></ideEmpregador>
    <ideVinculo><cpfTrab>52998224725</cpfTrab><matricula>000123</matricula></ideVinculo>
    <altContratual>
      <dtAlteracao>${data}</dtAlteracao>
      <infoContrato>
        <nmCargo>Padeira</nmCargo><CBOCargo>848305</CBOCargo><codCateg>101</codCateg>
        <remuneracao><vrSalFx>${salario}</vrSalFx><undSalFixo>5</undSalFixo></remuneracao>
        <horContratual><qtdHrsSem>40</qtdHrsSem><tpJornada>9</tpJornada><dscJorn>Seg a sex, 8h</dscJorn></horContratual>
      </infoContrato>
    </altContratual>
  </evtAltContratual>
</eSocial>`;

const desligamento = (data: string) => `<eSocial xmlns="http://www.esocial.gov.br/schema/evt/evtDeslig/v_S_01_03_00"><evtDeslig Id="ID3">
  <ideEvento><indRetif>1</indRetif></ideEvento>
  <ideEmpregador><tpInsc>1</tpInsc><nrInsc>48291730</nrInsc></ideEmpregador>
  <ideVinculo><cpfTrab>52998224725</cpfTrab><matricula>000123</matricula></ideVinculo>
  <infoDeslig><mtvDeslig>02</mtvDeslig><dtDeslig>${data}</dtDeslig></infoDeslig>
</evtDeslig></eSocial>`;

const alteracaoCadastral = `<eSocial><evtAltCadastral Id="ID4">
  <ideEvento><indRetif>1</indRetif></ideEvento>
  <ideEmpregador><tpInsc>1</tpInsc><nrInsc>48291730</nrInsc></ideEmpregador>
  <ideTrabalhador><cpfTrab>52998224725</cpfTrab></ideTrabalhador>
  <alteracao><dtAlteracao>2026-11-20</dtAlteracao><dadosTrabalhador>
    <nmTrab>Joana Ribeiro Lima</nmTrab><sexo>F</sexo><racaCor>3</racaCor><estCiv>2</estCiv><grauInstr>7</grauInstr>
    <endereco><brasil><tpLograd>AV</tpLograd><dscLograd>Sete de Setembro</dscLograd><nrLograd>900</nrLograd><bairro>Batel</bairro><cep>80240000</cep><codMunic>4106902</codMunic><uf>PR</uf></brasil></endereco>
    <dependente><tpDep>01</tpDep><nmDep>Carlos Lima</nmDep><dtNascto>1988-01-10</dtNascto><cpfDep>11144477735</cpfDep><depIRRF>S</depIRRF><depSF>N</depSF></dependente>
    <dependente><tpDep>03</tpDep><nmDep>Ana Ribeiro</nmDep><dtNascto>2018-02-01</dtNascto><depIRRF>S</depIRRF><depSF>S</depSF></dependente>
    <contato><fonePrinc>41999990000</fonePrinc><emailPrinc>joana@exemplo.com</emailPrinc></contato>
  </dadosTrabalhador></alteracao>
</evtAltCadastral></eSocial>`;

describe("leitura dos XML do eSocial", () => {
  it("lê a admissão gerada pelo próprio Connect", () => {
    const { eventos, problemas } = lerArquivosDoEsocial([{ nome: "s2200.xml", conteudo: admissao() }]);
    expect(problemas).toEqual([]);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ tipo: "S-2200", cpf: "52998224725", matricula: "000123", data: "2026-11-03", empregador: "48291730" });
  });

  it("abre o .zip do download, ignora o que não é XML e acha o evento em base64", () => {
    const embrulho = `<retornoSolicDownloadEvts><arquivo><evento>${Buffer.from(desligamento("2026-12-20")).toString("base64")}</evento></arquivo></retornoSolicDownloadEvts>`;
    const zip = zipSync({ "eventos/s2200.xml": strToU8(admissao()), "leia-me.txt": strToU8("oi"), "retorno.xml": strToU8(embrulho) });
    const { eventos } = lerArquivosDoEsocial([{ nome: "download.zip", conteudo: zip }]);
    expect(eventos.map((e) => e.tipo).sort()).toEqual(["S-2200", "S-2299"]);
  });

  it("avisa quando o arquivo não tem XML", () => {
    expect(lerArquivosDoEsocial([{ nome: "x.txt", conteudo: "nada" }]).problemas[0]).toMatch(/Nenhum XML/);
  });
});

describe("um trabalhador a partir dos eventos", () => {
  it("monta pessoa, dependentes e contrato da admissão", () => {
    const { eventos } = lerArquivosDoEsocial([{ nome: "a.xml", conteudo: admissao() }]);
    const { trabalhadores } = consolidarTrabalhadores(eventos, empregador.cnpj);
    const t = trabalhadores[0];
    expect(t).toMatchObject({
      cpf: "52998224725",
      nome: "Joana Ribeiro",
      nascimento: "1990-04-12",
      matricula: "000123",
      categoria: "101",
      admissao: "2026-11-03",
      salario: 3000,
      tipoSalario: "MENSAL",
      horasMensais: 220,
      nomeDoCargo: "Auxiliar de padaria",
      desligamento: null,
    });
    expect(t.endereco).toMatchObject({ logradouro: "Rua das Flores", cep: "80010000", uf: "PR" });
    expect(t.dados).toMatchObject({ sexo: "F", racaCor: "3", grauInstrucao: "07", cbo: "784205", codigoMunicipio: "4106902", tipoJornada: "3" });
    expect(t.dependentes).toEqual([{ nome: "Ana Ribeiro", cpf: "15350946056", nascimento: "2018-02-01", relacao: "FILHO", irrf: true, salarioFamilia: true }]);
    expect(contagemDeDependentes(t.dependentes)).toEqual({ irrf: 1, salarioFamilia: 1 });
  });

  it("aplica as alterações pela data (a mais recente vale) e o desligamento", () => {
    const { eventos } = lerArquivosDoEsocial([
      { nome: "c.xml", conteudo: alteracaoContratual("2026-12-01", "3500.00") },
      { nome: "b.xml", conteudo: alteracaoContratual("2026-11-15", "3200.00") },
      { nome: "a.xml", conteudo: admissao() },
      { nome: "d.xml", conteudo: desligamento("2026-12-20") },
      { nome: "e.xml", conteudo: alteracaoCadastral },
    ]);
    const t = consolidarTrabalhadores(eventos, empregador.cnpj).trabalhadores[0];
    expect(t.salario).toBe(3500);
    expect(t.horasMensais).toBe(200);
    expect(t.nomeDoCargo).toBe("Padeira");
    expect(t.dados.cbo).toBe("848305");
    expect(t.desligamento).toBe("2026-12-20");
    expect(t.nome).toBe("Joana Ribeiro Lima");
    expect(t.dados.estadoCivil).toBe("2");
    expect(t.endereco.logradouro).toBe("AV Sete de Setembro");
    expect(t.telefone).toBe("41999990000");
    expect(t.dependentes.map((d) => d.relacao)).toEqual(["CONJUGE", "FILHO"]);
  });

  it("a retificação troca a versão anterior do mesmo evento", () => {
    const { eventos } = lerArquivosDoEsocial([
      { nome: "a.xml", conteudo: admissao() },
      { nome: "r.xml", conteudo: alteracaoContratual("2026-12-01", "3900.00", "2") },
      { nome: "o.xml", conteudo: alteracaoContratual("2026-12-01", "3500.00", "1") },
    ]);
    expect(consolidarTrabalhadores(eventos, empregador.cnpj).trabalhadores[0].salario).toBe(3900);
  });

  it("deixa de fora os eventos de outro CNPJ, com o motivo", () => {
    const { eventos } = lerArquivosDoEsocial([{ nome: "a.xml", conteudo: admissao(joana, "11.444.777/0001-61") }]);
    const r = consolidarTrabalhadores(eventos, empregador.cnpj);
    expect(r.trabalhadores).toEqual([]);
    expect(r.deOutraEmpresa).toBe(1);
    expect(r.problemas[0]).toMatch(/outro CNPJ/);
  });

  it("sem a admissão, avisa que só completa quem já existe", () => {
    const { eventos } = lerArquivosDoEsocial([{ nome: "c.xml", conteudo: alteracaoContratual("2026-12-01", "3500.00") }]);
    expect(consolidarTrabalhadores(eventos, empregador.cnpj).trabalhadores[0].avisos[0]).toMatch(/Sem a admissão/);
  });

  it("raiz do CNPJ", () => {
    expect(raizDoCnpj("48.291.730/0001-15")).toBe("48291730");
  });
});
