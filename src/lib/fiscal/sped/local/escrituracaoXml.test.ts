import { describe, expect, it } from "vitest";
import { escrituracaoSchema, juntarParticipantes, lerEscrituracaoXml } from "./escrituracaoXml";
import { lerDocumentoXml } from "./importacao";

// O que o EFD ICMS/IPI exige do XML e o documento escriturado não guarda
// (06/11/2026). XMLs fictícios, no leiaute da NF-e 4.00 e do CT-e 4.00.

const NFE = `<?xml version="1.0" encoding="UTF-8"?><nfeProc><NFe><infNFe Id="NFe41260939952818000140550010000004561123456784"><ide><mod>55</mod><nNF>456</nNF><serie>1</serie><tpNF>1</tpNF><dhEmi>2026-09-10T10:00:00-03:00</dhEmi></ide>
<emit><CNPJ>39952818000140</CNPJ><xNome>EMPRESA FICTICIA LTDA</xNome><enderEmit><xLgr>RUA DE TESTE</xLgr><nro>100</nro><xCpl>SALA 2</xCpl><xBairro>CENTRO</xBairro><cMun>4106902</cMun></enderEmit><IE>1234567890</IE></emit>
<dest><CNPJ>44555666000199</CNPJ><xNome>CLIENTE FICTICIO &amp; FILHOS</xNome><enderDest><xLgr>AV DOS TESTES</xLgr><nro>2000</nro><xBairro>INDUSTRIAL</xBairro><cMun>4113700</cMun></enderDest><IE>9876543210</IE></dest>
<det nItem="1"><prod><cProd>A1</cProd><xProd>Peça &amp; acessório</xProd><NCM>40112090</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>2</qCom><vProd>100.00</vProd><vDesc>5.00</vDesc></prod><imposto><ICMS><ICMS10><orig>2</orig><CST>10</CST><vBC>95.00</vBC><pICMS>18.00</pICMS><vICMS>17.10</vICMS><vICMSST>3.40</vICMSST></ICMS10></ICMS></imposto></det>
<det nItem="2"><prod><cProd>B2</cProd><xProd>Serviço avulso</xProd><NCM>00000000</NCM><CFOP>5102</CFOP><uCom>KG</uCom><qCom>1</qCom><vProd>10.5</vProd></prod><imposto><ICMS><ICMS40><orig>0</orig><CST>40</CST></ICMS40></ICMS></imposto></det>
<total><ICMSTot><vDesc>5.00</vDesc><vNF>105.50</vNF></ICMSTot></total><infAdic><infCpl>Pedido 77 &amp; entrega parcial</infCpl></infAdic></infNFe></NFe></nfeProc>`;

const cte = (tomador: string) => `<?xml version="1.0" encoding="UTF-8"?><cteProc><CTe><infCte Id="CTe41260939952818000140570010000007891123456789"><ide><mod>57</mod><nCT>789</nCT><serie>1</serie><CFOP>5353</CFOP><tpCTe>1</tpCTe><dhEmi>2026-09-12T08:00:00-03:00</dhEmi><cMunIni>4106902</cMunIni><cMunFim>3550308</cMunFim>${tomador}</ide>
<emit><CNPJ>39952818000140</CNPJ><xNome>EMPRESA FICTICIA LTDA</xNome><enderEmit><xLgr>RUA DE TESTE</xLgr><nro>100</nro><xBairro>CENTRO</xBairro><cMun>4106902</cMun></enderEmit><IE>1234567890</IE></emit>
<rem><CNPJ>11222333000181</CNPJ><xNome>REMETENTE FICTICIO</xNome><enderReme><xLgr>RUA A</xLgr><nro>1</nro><xBairro>B</xBairro><cMun>4106902</cMun></enderReme></rem>
<dest><CPF>12345678909</CPF><xNome>DESTINATARIO FICTICIO</xNome><enderDest><xLgr>RUA C</xLgr><nro>3</nro><xBairro>D</xBairro><cMun>3550308</cMun></enderDest></dest>
<vPrest><vTPrest>250.00</vTPrest></vPrest><imp><ICMS><ICMS00><CST>00</CST><vBC>250.00</vBC><pICMS>12.00</pICMS><vICMS>30.00</vICMS></ICMS00></ICMS></imp>
<infCteComp><chCTe>41260939952818000140570010000007001123456782</chCTe></infCteComp></infCte></CTe></cteProc>`;

describe("lerEscrituracaoXml — NF-e", () => {
  const lido = lerEscrituracaoXml(NFE)!;

  it("traz o tipo, o desconto e a informação complementar, com as entidades decodificadas", () => {
    expect(lido.documento).toMatchObject({ tpNF: "1", vDesc: "5.00", infCpl: "Pedido 77 & entrega parcial" });
    // Referência numérica também (o parser só decodificava as nomeadas).
    expect(lerEscrituracaoXml(NFE.replace("Pedido 77 &amp;", "Pedido 77 &#x26; caf&#233;"))?.documento.infCpl).toBe("Pedido 77 & café entrega parcial");
  });

  it("a descrição do item importada vem decodificada; o código fica como veio", () => {
    expect(lerDocumentoXml(NFE).itens[0]).toMatchObject({ codigo: "A1", descricao: "Peça & acessório" });
    expect(lerDocumentoXml(NFE.replace("<cProd>A1</cProd>", "<cProd>A&amp;1</cProd>")).itens[0].codigo).toBe("A&amp;1");
  });

  it("traz unidade, origem, valor bruto, desconto e ST de cada item, na ordem da escrituração", () => {
    expect(lido.documento.itens).toEqual([
      { ordem: 1, unidade: "UN", origem: "2", vProd: "100.00", vDesc: "5.00", vICMSST: "3.40" },
      { ordem: 2, unidade: "KG", origem: "0", vProd: "10.50", vDesc: "0.00", vICMSST: "0.00" },
    ]);
    // A mesma ordem do item escriturado: o motor casa pelo `ordem`.
    expect(lerDocumentoXml(NFE).itens.map((i) => i.ordem)).toEqual([1, 2]);
  });

  it("traz emitente e destinatário com IE, município e endereço", () => {
    expect(lido.participantes).toEqual([
      { documento: "39952818000140", nome: "EMPRESA FICTICIA LTDA", ie: "1234567890", codMun: "4106902", endereco: "RUA DE TESTE", numero: "100", complemento: "SALA 2", bairro: "CENTRO" },
      { documento: "44555666000199", nome: "CLIENTE FICTICIO & FILHOS", ie: "9876543210", codMun: "4113700", endereco: "AV DOS TESTES", numero: "2000", complemento: "", bairro: "INDUSTRIAL" },
    ]);
  });

  it("recusa DOCTYPE, como a importação", () => {
    expect(() => lerEscrituracaoXml(`<!DOCTYPE x [<!ENTITY a "b">]>${NFE}`)).toThrow();
  });
});

describe("lerEscrituracaoXml — CT-e", () => {
  it("o tomador sai do papel do toma3 (0 = remetente), com os municípios e a chave do complementado", () => {
    const lido = lerEscrituracaoXml(cte("<toma3><toma>0</toma></toma3>"))!;
    expect(lido.documento.cte).toEqual({ tpCTe: "1", chaveRef: "41260939952818000140570010000007001123456782", tomador: "11222333000181", munIni: "4106902", munFim: "3550308" });
    expect(lido.participantes.map((p) => p.documento)).toEqual(["39952818000140", "11222333000181", "12345678909"]);
  });

  it("toma3 = 3 é o destinatário, mesmo pessoa física", () => {
    expect(lerEscrituracaoXml(cte("<toma3><toma>3</toma></toma3>"))!.documento.cte?.tomador).toBe("12345678909");
  });

  it("toma4 traz outro tomador, com o próprio cadastro, que entra nos participantes", () => {
    const lido = lerEscrituracaoXml(cte("<toma4><toma>4</toma><CNPJ>55666777000144</CNPJ><xNome>TOMADOR FICTICIO</xNome><enderToma><xLgr>RUA T</xLgr><nro>9</nro><xBairro>T</xBairro><cMun>4106902</cMun></enderToma></toma4>"))!;
    expect(lido.documento.cte?.tomador).toBe("55666777000144");
    expect(lido.participantes.find((p) => p.documento === "55666777000144")).toMatchObject({ nome: "TOMADOR FICTICIO", codMun: "4106902" });
  });

  it("sem tomador identificável: nulo, e o motor recusa dizendo isso", () => {
    expect(lerEscrituracaoXml(cte(""))!.documento.cte?.tomador).toBeNull();
  });
});

describe("juntarParticipantes e o bloco inteiro", () => {
  it("um por documento, ficando o cadastro mais completo", () => {
    const sem = { documento: "44555666000199", nome: "CLIENTE", ie: "", codMun: "", endereco: "", numero: "", complemento: "", bairro: "" };
    const com = { ...sem, ie: "9876543210", codMun: "4113700", endereco: "AV DOS TESTES" };
    expect(juntarParticipantes([sem, com, sem])).toEqual([com]);
  });

  it("o bloco montado passa no schema do pacote", () => {
    const n = lerEscrituracaoXml(NFE)!;
    const bloco = {
      estabelecimento: { razaoSocial: "EMPRESA FICTICIA LTDA", nomeFantasia: "", codMun: "4106902", cep: "80000000", endereco: "RUA DE TESTE", numero: "100", complemento: "", bairro: "CENTRO", telefone: "", email: "", indPerfil: "A", indAtiv: "1", contador: { nome: "CONTADOR FICTICIO", cpf: "98765432100", crc: "PR-000000/O-0" }, icms: { codReceita: "1015", diaVencimento: 12 }, codCta: "", codInf: "" },
      participantes: juntarParticipantes(n.participantes),
      documentos: [{ id: "doc-1", ...n.documento }],
    };
    expect(escrituracaoSchema.safeParse(bloco).success).toBe(true);
  });
});
