import { describe, expect, it } from "vitest";
import { pistasDoXml, resumirPorMunicipio, rotuloDoMunicipio, rotuloDoMotivo, codigoDeMunicipioValido } from "./recusas";

// XMLs fictícios, montados à mão: nenhum é nota real.

describe("pistasDoXml", () => {
  it("ABRASF com namespace: NFS-e, município do órgão gerador antes do prestador", () => {
    const xml = `<?xml version="1.0"?><ns2:CompNfse xmlns:ns2="http://www.abrasf.org.br/nfse.xsd"><ns2:Nfse><ns2:InfNfse>
      <ns2:PrestadorServico><ns2:Endereco><ns2:CodigoMunicipio>4205407</ns2:CodigoMunicipio></ns2:Endereco></ns2:PrestadorServico>
      <ns2:OrgaoGerador><ns2:CodigoMunicipio>4106902</ns2:CodigoMunicipio><ns2:Uf>PR</ns2:Uf></ns2:OrgaoGerador>
    </ns2:InfNfse></ns2:Nfse></ns2:CompNfse>`;
    expect(pistasDoXml(xml)).toEqual({ raiz: "CompNfse", tipoProvavel: "nfse", municipio: "4106902" });
  });

  it("padrão nacional: o cLocEmi", () => {
    const xml = `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe Id="NFS1"><xLocEmi>Fictícia</xLocEmi><cLocIncid>4205407</cLocIncid><cLocEmi>4113700</cLocEmi></infNFSe></NFSe>`;
    expect(pistasDoXml(xml)).toEqual({ raiz: "NFSe", tipoProvavel: "nfse", municipio: "4113700" });
  });

  it("sem órgão gerador: o município do prestador", () => {
    const xml = `<Rps><Prestador><Cnpj>00000000000000</Cnpj><codigoMunicipio>4119905</codigoMunicipio></Prestador><Tomador><codigoMunicipio>3550308</codigoMunicipio></Tomador></Rps>`;
    expect(pistasDoXml(xml).municipio).toBe("4119905");
  });

  it("layout municipal desconhecido: qualquer tag de município, e ignora número de 7 dígitos que não é município", () => {
    const xml = `<NotaFiscalServicoEletronica><Numero>1234567</Numero><Valor>100.00</Valor><MunicipioDaPrestacao>4125506</MunicipioDaPrestacao></NotaFiscalServicoEletronica>`;
    expect(pistasDoXml(xml)).toEqual({ raiz: "NotaFiscalServicoEletronica", tipoProvavel: "nfse", municipio: "4125506" });
  });

  it("código fora da tabela de UFs não é município", () => {
    expect(pistasDoXml(`<Nfse><CodigoMunicipio>9999999</CodigoMunicipio></Nfse>`).municipio).toBeNull();
    expect(codigoDeMunicipioValido("4106902")).toBe(true);
    expect(codigoDeMunicipioValido("3400000")).toBe(false);
  });

  it("NF-e e CT-e pela raiz; o resto, desconhecido", () => {
    expect(pistasDoXml(`<nfeProc><NFe><infNFe Id="x"/></NFe></nfeProc>`).tipoProvavel).toBe("nfe");
    expect(pistasDoXml(`<cteProc><CTe/></cteProc>`).tipoProvavel).toBe("cte");
    expect(pistasDoXml(`<retConsulta><infNFe Id="x"></infNFe></retConsulta>`).tipoProvavel).toBe("nfe");
    expect(pistasDoXml(`<pedido><item>1</item></pedido>`)).toEqual({ raiz: "pedido", tipoProvavel: "desconhecido", municipio: null });
  });

  it("arquivo quebrado ainda dá pista: é o que precisa ser contado", () => {
    expect(pistasDoXml(`﻿<!-- gerado pelo sistema X --><ConsultarNfseResposta><ListaNfse><CodigoMunicipio>4106902<`)).toEqual({
      raiz: "ConsultarNfseResposta",
      tipoProvavel: "nfse",
      municipio: null,
    });
    expect(pistasDoXml("não é xml")).toEqual({ raiz: null, tipoProvavel: "desconhecido", municipio: null });
  });
});

describe("rótulos", () => {
  it("município com a UF, e o vazio dito", () => {
    expect(rotuloDoMunicipio("4106902")).toBe("PR · 4106902");
    expect(rotuloDoMunicipio(null)).toBe("Sem município no XML");
  });
  it("motivo conhecido traduzido; desconhecido passa como veio", () => {
    expect(rotuloDoMotivo("campo_obrigatorio_ausente")).toBe("Campo obrigatório ausente");
    expect(rotuloDoMotivo("outro")).toBe("outro");
  });
});

describe("resumirPorMunicipio", () => {
  const d = (dia: number) => new Date(Date.UTC(2026, 10, dia));
  it("soma os motivos, guarda o mais comum e a última data; sem município vai para o fim", () => {
    const r = resumirPorMunicipio([
      { municipio: null, motivo: "xml_invalido", quantidade: 9, ultima: d(5) },
      { municipio: "4106902", motivo: "campo_obrigatorio_ausente", quantidade: 3, ultima: d(2) },
      { municipio: "4106902", motivo: "documento_desconhecido", quantidade: 1, ultima: d(4) },
      { municipio: "4113700", motivo: "documento_desconhecido", quantidade: 2, ultima: d(1) },
    ]);
    expect(r).toEqual([
      { municipio: "4106902", arquivos: 4, ultima: d(4), motivoPrincipal: "campo_obrigatorio_ausente" },
      { municipio: "4113700", arquivos: 2, ultima: d(1), motivoPrincipal: "documento_desconhecido" },
      { municipio: null, arquivos: 9, ultima: d(5), motivoPrincipal: "xml_invalido" },
    ]);
  });
  it("empate de motivo resolve pelo nome, para a tela não trocar de uma visita para outra", () => {
    const r = resumirPorMunicipio([
      { municipio: "4106902", motivo: "xml_invalido", quantidade: 1, ultima: d(1) },
      { municipio: "4106902", motivo: "chave_ausente", quantidade: 1, ultima: d(1) },
    ]);
    expect(r[0].motivoPrincipal).toBe("chave_ausente");
  });
});
