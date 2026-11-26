import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { conferirTotalizadores, lerTotalizadores } from "./totalizadores";

const ns = (tag: string) => `http://www.esocial.gov.br/schema/evt/${tag}/v_S_01_03_00`;
const empregador = "<ideEmpregador><tpInsc>1</tpInsc><nrInsc>48291730</nrInsc></ideEmpregador>";

const s5001 = (cpf: string, desc: string, calc: string) => `<eSocial xmlns="${ns("evtBasesTrab")}"><evtBasesTrab Id="ID1">
<ideEvento><nrRecArqBase>1.2.0000000000000000101</nrRecArqBase><indApuracao>1</indApuracao><perApur>2027-02</perApur></ideEvento>${empregador}
<ideTrabalhador><cpfTrab>${cpf}</cpfTrab></ideTrabalhador>
<infoCpCalc><tpCR>108201</tpCR><vrCpSeg>${calc}</vrCpSeg><vrDescSeg>${desc}</vrDescSeg></infoCpCalc>
<infoCp><classTrib>99</classTrib><ideEstabLot><tpInsc>1</tpInsc><nrInsc>48291730000115</nrInsc><codLotacao>LOT001</codLotacao>
<infoCategIncid><codCateg>101</codCateg><infoBaseCS><ind13>0</ind13><tpValor>11</tpValor><valor>3000.00</valor></infoBaseCS></infoCategIncid></ideEstabLot></infoCp>
</evtBasesTrab></eSocial>`;

const s5002 = (cpf: string, ir: string) => `<eSocial xmlns="${ns("evtIrrfBenef")}"><evtIrrfBenef Id="ID2">
<ideEvento><nrRecArqBase>1.2.0000000000000000201</nrRecArqBase><perApur>2027-02</perApur></ideEvento>${empregador}
<ideTrabalhador><cpfBenef>${cpf}</cpfBenef>
<dmDev><perRef>2027-02</perRef><ideDmDev>FOLHA202702</ideDmDev><tpPgto>1</tpPgto><dtPgto>2027-03-05</dtPgto><codCateg>101</codCateg>
<totApurMen><CRMen>056107</CRMen><vlrRendTrib>3000.00</vlrRendTrib><vlrRendTrib13>0.00</vlrRendTrib13><vlrPrevOficial>253.41</vlrPrevOficial><vlrPrevOficial13>0</vlrPrevOficial13><vlrCRMen>${ir}</vlrCRMen><vlrCR13Men>0.00</vlrCR13Men></totApurMen></dmDev>
<totInfoIR><consolidApurMen><CRMen>056107</CRMen><vlrRendTrib>3000.00</vlrRendTrib><vlrRendTrib13>0.00</vlrRendTrib13><vlrCRMen>${ir}</vlrCRMen><vlrCR13Men>0.00</vlrCR13Men></consolidApurMen></totInfoIR>
</ideTrabalhador></evtIrrfBenef></eSocial>`;

const s5003 = (cpf: string, base: string, dps: string) => `<eSocial xmlns="${ns("evtBasesFGTS")}"><evtBasesFGTS Id="ID3">
<ideEvento><nrRecArqBase>1.2.0000000000000000101</nrRecArqBase><indApuracao>1</indApuracao><perApur>2027-02</perApur></ideEvento>${empregador}
<ideTrabalhador><cpfTrab>${cpf}</cpfTrab></ideTrabalhador>
<infoFGTS><ideEstab><ideLotacao><infoTrabFGTS><codCateg>101</codCateg><infoBaseFGTS>
<basePerApur><tpValor>11</tpValor><indIncid>1</indIncid><remFGTS>${base}</remFGTS><dpsFGTS>${dps}</dpsFGTS></basePerApur>
</infoBaseFGTS></infoTrabFGTS></ideLotacao></ideEstab></infoFGTS></evtBasesFGTS></eSocial>`;

const s5011 = `<eSocial xmlns="${ns("evtCS")}"><evtCS Id="ID4">
<ideEvento><indApuracao>1</indApuracao><perApur>2027-02</perApur></ideEvento>${empregador}
<infoCS><nrRecArqBase>1.2.0000000000000000301</nrRecArqBase><indExistInfo>1</indExistInfo>
<infoCPSeg><vrDescCP>506.82</vrDescCP><vrCpSeg>506.82</vrCpSeg></infoCPSeg>
<infoContrib><classTrib>99</classTrib></infoContrib>
<ideEstab><tpInsc>1</tpInsc><nrInsc>48291730000115</nrInsc><ideLotacao><codLotacao>LOT001</codLotacao><fpas>507</fpas><codTercs>0079</codTercs>
<basesRemun><indIncid>1</indIncid><codCateg>101</codCateg><basesCp><vrBcCp00>6000.00</vrBcCp00><vrSalFam>65.00</vrSalFam><vrSalMat>0</vrSalMat></basesCp></basesRemun>
</ideLotacao></ideEstab>
<infoCRContrib><tpCR>108201</tpCR><vrCR>506.82</vrCR></infoCRContrib>
<infoCRContrib><tpCR>109901</tpCR><vrCR>1395.00</vrCR></infoCRContrib>
</infoCS></evtCS></eSocial>`;

const s5013 = `<eSocial xmlns="${ns("evtFGTS")}"><evtFGTS Id="ID5">
<ideEvento><indApuracao>1</indApuracao><perApur>2027-02</perApur></ideEvento>${empregador}
<infoFGTS><nrRecArqBase>1.2.0000000000000000301</nrRecArqBase><indExistInfo>1</indExistInfo><ideEstab><tpInsc>1</tpInsc><nrInsc>48291730000115</nrInsc>
<ideLotacao><codLotacao>LOT001</codLotacao><tpLotacao>01</tpLotacao><infoBaseFGTS>
<basePerApur><tpValor>11</tpValor><indIncid>1</indIncid><baseFGTS>6000.00</baseFGTS><vrFGTS>480.00</vrFGTS></basePerApur>
</infoBaseFGTS></ideLotacao></ideEstab></infoFGTS></evtFGTS></eSocial>`;

const ANA = "52998224725";
const BIA = "39053344705";

describe("leitura dos totalizadores do eSocial (funcionalidade-755, leiaute S-1.3)", () => {
  it("lê os cinco totalizadores, cada um com os seus campos", () => {
    const { lidos, problemas } = lerTotalizadores([
      { nome: "5001.xml", conteudo: s5001(ANA, "253.41", "253.41") },
      { nome: "5002.xml", conteudo: s5002(ANA, "45.10") },
      { nome: "5003.xml", conteudo: s5003(ANA, "3000.00", "240.00") },
      { nome: "5011.xml", conteudo: s5011 },
      { nome: "5013.xml", conteudo: s5013 },
    ]);
    expect(problemas).toEqual([]);
    const de = (t: string) => lidos.find((l) => l.tipo === t)!;
    expect(de("S-5001")).toMatchObject({ perApur: "2027-02", cpf: ANA, empregador: "48291730", reciboBase: "1.2.0000000000000000101", valores: { inssCalculado: 253.41, inssDescontado: 253.41 } });
    expect(de("S-5002").valores).toEqual({ irrf: 45.1, rendimentosTributaveis: 3000 });
    expect(de("S-5003").valores).toEqual({ baseFgts: 3000, fgts: 240 });
    expect(de("S-5011")).toMatchObject({ cpf: null, reciboBase: "1.2.0000000000000000301" });
    expect(de("S-5011").valores).toEqual({ inssDescontado: 506.82, inssCalculado: 506.82, salarioFamilia: 65, totalDasContribuicoes: 1901.82, cr108201: 506.82, cr109901: 1395 });
    expect(de("S-5013").valores).toEqual({ baseFgts: 6000, fgts: 480 });
  });

  it("retorno de lote com vários eventos e .zip dentro de .zip", () => {
    const lote = `<eSocial><retornoProcessamentoLoteEventos><retornoEventos><evento><retornoEvento>${s5001(ANA, "1", "1")}</retornoEvento></evento><evento><retornoEvento>${s5001(BIA, "2", "2")}</retornoEvento></evento></retornoEventos></retornoProcessamentoLoteEventos></eSocial>`;
    const interno = zipSync({ "5013.xml": strToU8(s5013) });
    const zip = zipSync({ "lote.xml": strToU8(lote), "outro.zip": interno });
    const { lidos } = lerTotalizadores([{ nome: "download.zip", conteudo: zip }]);
    expect(lidos.map((l) => `${l.tipo}:${l.cpf ?? "empresa"}`).sort()).toEqual([`S-5001:${BIA}`, `S-5001:${ANA}`, "S-5013:empresa"]);
  });

  it("arquivo sem totalizador ou que não é XML vira problema, sem travar", () => {
    const { lidos, problemas } = lerTotalizadores([
      { nome: "s1200.xml", conteudo: "<eSocial><evtRemun/></eSocial>" },
      { nome: "lixo.xml", conteudo: "<a><b></a>" },
    ]);
    expect(lidos).toEqual([]);
    expect(problemas.length).toBe(2);
  });
});

describe("conferência com o cálculo (funcionalidade-755)", () => {
  const { lidos } = lerTotalizadores([
    { nome: "a", conteudo: s5001(ANA, "253.41", "253.41") },
    { nome: "b", conteudo: s5002(ANA, "45.10") },
    { nome: "c", conteudo: s5003(ANA, "3000.00", "240.00") },
    { nome: "d", conteudo: s5001(BIA, "253.41", "260.00") },
    { nome: "e", conteudo: s5011 },
    { nome: "f", conteudo: s5013 },
  ]);

  it("por pessoa: INSS descontado, IRRF e FGTS; diferença acima de 1 centavo diverge", () => {
    const r = conferirTotalizadores(
      [
        { personId: "a", nome: "Ana", cpf: "529.982.247-25", inss: 253.41, irrf: 45.1, baseFgts: 3000, fgts: 240 },
        { personId: "b", nome: "Bia", cpf: BIA, inss: 250, irrf: 0, baseFgts: 3000, fgts: 240 },
      ],
      lidos
    );
    expect(r.linhas[0]).toMatchObject({ nome: "Ana", diverge: false, inss: { calculo: 253.41, esocial: 253.41, diferenca: 0 } });
    expect(r.linhas[1]).toMatchObject({ nome: "Bia", diverge: true, inss: { diferenca: -3.41 }, fgts: { esocial: null, diferenca: null } });
    expect(r.divergentes).toBe(1);
    // Total com o S-5011 (descontado dos segurados) e o S-5013.
    expect(r.total.inss).toEqual({ calculo: 503.41, esocial: 506.82, diferenca: -3.41 });
    expect(r.total.fgts).toEqual({ calculo: 480, esocial: 480, diferenca: 0 });
  });

  it("CPF que o eSocial totalizou e não está no cálculo aparece à parte", () => {
    const r = conferirTotalizadores([{ personId: "a", nome: "Ana", cpf: ANA, inss: 253.41, irrf: 45.1, baseFgts: 3000, fgts: 240 }], lidos);
    expect(r.linhas.at(-1)).toMatchObject({ personId: null, cpf: BIA, diverge: true, nome: "Fora do cálculo do DP 2" });
  });

  it("sem totalizador nenhum da pessoa: conta à parte, sem divergir", () => {
    const r = conferirTotalizadores([{ personId: "c", nome: "Caio", cpf: "11144477735", inss: 100, irrf: 0, baseFgts: 1000, fgts: 80 }], []);
    expect(r.semTotalizador).toBe(1);
    expect(r.divergentes).toBe(0);
  });
});
