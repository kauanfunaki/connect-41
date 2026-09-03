import { describe, expect, it } from "vitest";
import { lerXmlFiscal, chaveDeAcessoValida, modeloDaChave } from "./xml";

// Chaves com dígito verificador correto, calculado fora deste código para o
// teste não conferir a implementação contra ela mesma.
const CHAVE_NFE = "41260917122471000175550010000001231123456781";
const CHAVE_NFCE = "41260917122471000175650020000004561876543211";
const CHAVE_CTE = "41260939952818000140570010000007891112233449";

function nfe(
  opcoes: { chave?: string; embrulhada?: boolean; comDestinatario?: boolean; prefixo?: string } = {}
) {
  const { chave = CHAVE_NFE, embrulhada = true, comDestinatario = true, prefixo = "" } = opcoes;
  const p = prefixo ? `${prefixo}:` : "";
  const ns = prefixo ? ` xmlns:${prefixo}="http://www.portalfiscal.inf.br/nfe"` : "";
  const dest = comDestinatario
    ? `<${p}dest><${p}CNPJ>39952818000140</${p}CNPJ><${p}xNome>ZAHRA PERFUMES LTDA</${p}xNome></${p}dest>`
    : "";
  const miolo = `<${p}NFe${ns}>
      <${p}infNFe Id="NFe${chave}" versao="4.00">
        <${p}ide>
          <${p}nNF>000123</${p}nNF><${p}serie>1</${p}serie><${p}mod>55</${p}mod>
          <${p}dhEmi>2026-09-01T10:30:00-03:00</${p}dhEmi>
          <${p}NFref><${p}refNFe>99999999999999999999999999999999999999999999</${p}refNFe></${p}NFref>
        </${p}ide>
        <${p}emit><${p}CNPJ>17.122.471/0001-75</${p}CNPJ><${p}xNome>BLD LOGISTICA LTDA</${p}xNome></${p}emit>
        ${dest}
        <${p}total><${p}ICMSTot><${p}vProd>900.00</${p}vProd><${p}vNF>1234.50</${p}vNF></${p}ICMSTot></${p}total>
      </${p}infNFe>
    </${p}NFe>`;
  return `<?xml version="1.0" encoding="UTF-8"?>${embrulhada ? `<nfeProc versao="4.00">${miolo}</nfeProc>` : miolo}`;
}

const nfce = `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe${CHAVE_NFCE}">
  <ide><nNF>456</nNF><serie>2</serie><mod>65</mod><dhEmi>2026-09-02T14:00:00-03:00</dhEmi></ide>
  <emit><CNPJ>17122471000175</CNPJ><xNome>BLD LOGISTICA LTDA</xNome></emit>
  <total><ICMSTot><vNF>75.90</vNF></ICMSTot></total>
</infNFe></NFe></nfeProc>`;

const cte = `<?xml version="1.0"?><cteProc><CTe><infCte Id="CTe${CHAVE_CTE}">
  <ide><nCT>789</nCT><serie>1</serie><dhEmi>2026-09-03T08:15:00-03:00</dhEmi></ide>
  <emit><CNPJ>39952818000140</CNPJ><xNome>BLD EXPRESS LTDA</xNome></emit>
  <dest><CNPJ>41397500000196</CNPJ><xNome>QUEM RECEBE A CARGA</xNome></dest>
  <toma4><CNPJ>17122471000175</CNPJ><xNome>QUEM PAGA O FRETE</xNome></toma4>
  <vPrest><vTPrest>310.00</vTPrest></vPrest>
  <infCTeNorm><infDoc><infNFe><chave>11111111111111111111111111111111111111111111</chave></infNFe></infDoc></infCTeNorm>
</infCte></CTe></cteProc>`;

function extraido(xml: string) {
  const r = lerXmlFiscal(xml);
  if (!r.ok) throw new Error(`esperava sucesso, veio ${r.motivo}: ${r.detalhe}`);
  return r.documento;
}

describe("chaveDeAcessoValida", () => {
  it("aceita chave com dígito verificador correto", () => {
    expect(chaveDeAcessoValida(CHAVE_NFE)).toBe(true);
    expect(chaveDeAcessoValida(CHAVE_CTE)).toBe(true);
  });

  it("recusa dígito verificador trocado", () => {
    const errada = CHAVE_NFE.slice(0, 43) + (CHAVE_NFE[43] === "0" ? "1" : "0");
    expect(chaveDeAcessoValida(errada)).toBe(false);
  });

  it("recusa tamanho fora de 44 e conteúdo não numérico", () => {
    expect(chaveDeAcessoValida(CHAVE_NFE.slice(0, 43))).toBe(false);
    expect(chaveDeAcessoValida("x".repeat(44))).toBe(false);
  });

  it("lê o modelo das posições 21-22", () => {
    expect(modeloDaChave(CHAVE_NFE)).toBe("55");
    expect(modeloDaChave(CHAVE_NFCE)).toBe("65");
    expect(modeloDaChave(CHAVE_CTE)).toBe("57");
  });
});

describe("NF-e", () => {
  it("lê os campos que o módulo precisa", () => {
    const d = extraido(nfe());
    expect(d.tipo).toBe("NFE");
    expect(d.chaveAcesso).toBe(CHAVE_NFE);
    expect(d.numero).toBe("000123");
    expect(d.serie).toBe("1");
    expect(d.emitente).toEqual({ nome: "BLD LOGISTICA LTDA", documento: "17122471000175" });
    expect(d.destinatario).toEqual({ nome: "ZAHRA PERFUMES LTDA", documento: "39952818000140" });
    expect(d.emitidoEm.toISOString()).toBe("2026-09-01T13:30:00.000Z");
  });

  // A armadilha central deste layout: <refNFe> dentro de <NFref> é a chave de
  // OUTRA nota (devolução, complemento). Ler "a primeira chave que aparecer"
  // pegaria ela e o acervo inteiro deduplicaria pelo documento errado.
  it("não confunde a chave da nota com a da nota referenciada", () => {
    const d = extraido(nfe());
    expect(d.chaveAcesso).toBe(CHAVE_NFE);
    expect(d.chaveAcesso).not.toContain("999999999999");
  });

  // Dinheiro nunca passa por float: "1234.50" tem de chegar assim ao Decimal.
  it("preserva o valor como veio, sem virar número", () => {
    const d = extraido(nfe());
    expect(d.valorTotal).toBe("1234.50");
    expect(typeof d.valorTotal).toBe("string");
  });

  it("usa vNF e não vProd — vProd ignora frete, seguro e desconto", () => {
    expect(extraido(nfe()).valorTotal).not.toBe("900.00");
  });

  it("lê tanto o arquivo da SEFAZ (nfeProc) quanto o do emissor (NFe solto)", () => {
    expect(extraido(nfe({ embrulhada: false })).chaveAcesso).toBe(CHAVE_NFE);
  });

  it("ignora prefixo de namespace, que cada emissor põe do seu jeito", () => {
    expect(extraido(nfe({ prefixo: "ns2" })).numero).toBe("000123");
  });

  it("limpa a pontuação do CNPJ do emitente", () => {
    expect(extraido(nfe()).emitente.documento).toBe("17122471000175");
  });

  it("número com zeros à esquerda não vira número", () => {
    expect(extraido(nfe()).numero).toBe("000123");
  });
});

describe("NFC-e", () => {
  it("é distinguida da NF-e pelo modelo na chave, não pela tag mod", () => {
    const d = extraido(nfce);
    expect(d.tipo).toBe("NFCE");
    expect(d.chaveAcesso).toBe(CHAVE_NFCE);
  });

  it("venda ao consumidor não identificado não tem destinatário, e isso não é erro", () => {
    const d = extraido(nfe({ comDestinatario: false }));
    expect(d.destinatario).toEqual({ nome: null, documento: null });
  });
});

describe("CT-e", () => {
  it("lê os campos do conhecimento de transporte", () => {
    const d = extraido(cte);
    expect(d.tipo).toBe("CTE");
    expect(d.chaveAcesso).toBe(CHAVE_CTE);
    expect(d.numero).toBe("789");
    expect(d.valorTotal).toBe("310.00");
  });

  // Quem paga o frete é o tomador, não quem recebe a carga. Pendurar no `dest`
  // mandaria a conta para a empresa errada.
  it("a contraparte é o tomador do serviço, não o destinatário da carga", () => {
    const d = extraido(cte);
    expect(d.destinatario.nome).toBe("QUEM PAGA O FRETE");
    expect(d.destinatario.documento).toBe("17122471000175");
  });

  // O CT-e lista as NF-e transportadas; nenhuma delas é a chave dele.
  it("não pega a chave de uma nota transportada", () => {
    expect(extraido(cte).chaveAcesso).not.toContain("111111111111");
  });
});

describe("recusas", () => {
  it("arquivo vazio", () => {
    expect(lerXmlFiscal("")).toMatchObject({ ok: false, motivo: "xml_invalido" });
    expect(lerXmlFiscal("   ")).toMatchObject({ ok: false, motivo: "xml_invalido" });
  });

  it("XML de outra coisa não vira documento fiscal", () => {
    const r = lerXmlFiscal('<?xml version="1.0"?><boleto><valor>10</valor></boleto>');
    expect(r).toMatchObject({ ok: false, motivo: "documento_desconhecido" });
  });

  it("chave com dígito verificador errado é recusada, não corrigida", () => {
    const errada = CHAVE_NFE.slice(0, 43) + (CHAVE_NFE[43] === "0" ? "1" : "0");
    expect(lerXmlFiscal(nfe({ chave: errada }))).toMatchObject({ ok: false, motivo: "chave_invalida" });
  });

  it("Id sem 44 dígitos é chave ausente", () => {
    const xml = `<?xml version="1.0"?><NFe><infNFe Id="NFe123"><ide><nNF>1</nNF></ide></infNFe></NFe>`;
    expect(lerXmlFiscal(xml)).toMatchObject({ ok: false, motivo: "chave_ausente" });
  });

  it("nota sem valor total é recusada — não se assume zero", () => {
    const xml = `<?xml version="1.0"?><NFe><infNFe Id="NFe${CHAVE_NFE}">
      <ide><nNF>1</nNF><dhEmi>2026-09-01T10:00:00-03:00</dhEmi></ide>
      <emit><CNPJ>17122471000175</CNPJ></emit></infNFe></NFe>`;
    expect(lerXmlFiscal(xml)).toMatchObject({ ok: false, motivo: "campo_obrigatorio_ausente" });
  });

  it("data ausente ou inválida é recusada — não se assume hoje", () => {
    const xml = `<?xml version="1.0"?><NFe><infNFe Id="NFe${CHAVE_NFE}">
      <ide><nNF>1</nNF><dhEmi>ontem</dhEmi></ide>
      <total><ICMSTot><vNF>10.00</vNF></ICMSTot></total></infNFe></NFe>`;
    expect(lerXmlFiscal(xml)).toMatchObject({ ok: false, motivo: "campo_obrigatorio_ausente" });
  });

  it("recusa carrega o motivo legível, para a tela de entrada dizer o que houve", () => {
    const r = lerXmlFiscal('<?xml version="1.0"?><boleto/>');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detalhe).toContain("boleto");
  });
});

// ── NFS-e (etapa 5) ─────────────────────────────────────────────────────────
//
// Duas famílias de layout cobrem quase tudo: ABRASF (a maioria das prefeituras)
// e o padrão nacional. O que muda entre elas é nome de tag, não conceito.

const abrasf2 = `<?xml version="1.0"?>
<ConsultarNfseResposta><ListaNfse><CompNfse><Nfse><InfNfse>
  <Numero>4321</Numero>
  <CodigoVerificacao>XPTO-9</CodigoVerificacao>
  <DataEmissao>2026-09-05T09:00:00</DataEmissao>
  <Competencia>2026-08-01T00:00:00</Competencia>
  <DeclaracaoPrestacaoServico><InfDeclaracaoPrestacaoServico>
    <Rps><IdentificacaoRps><Numero>77</Numero><Serie>A</Serie></IdentificacaoRps></Rps>
    <Servico><Valores><ValorServicos>2500.00</ValorServicos><ValorIss>125.00</ValorIss></Valores></Servico>
  </InfDeclaracaoPrestacaoServico></DeclaracaoPrestacaoServico>
  <ValoresNfse><ValorLiquidoNfse>2375.00</ValorLiquidoNfse></ValoresNfse>
  <PrestadorServico>
    <IdentificacaoPrestador><CpfCnpj><Cnpj>17.122.471/0001-75</Cnpj></CpfCnpj></IdentificacaoPrestador>
    <RazaoSocial>BLD LOGISTICA LTDA</RazaoSocial>
  </PrestadorServico>
  <TomadorServico>
    <IdentificacaoTomador><CpfCnpj><Cnpj>39952818000140</Cnpj></CpfCnpj></IdentificacaoTomador>
    <RazaoSocial>ZAHRA PERFUMES LTDA</RazaoSocial>
  </TomadorServico>
</InfNfse></Nfse></CompNfse></ListaNfse></ConsultarNfseResposta>`;

const abrasf1 = `<?xml version="1.0"?><CompNfse><Nfse><InfNfse>
  <Numero>9</Numero><Serie>1</Serie>
  <DataEmissao>2026-07-10T14:20:00</DataEmissao>
  <Servico><Valores><ValorServicos>430.00</ValorServicos></Valores></Servico>
  <PrestadorServico><IdentificacaoPrestador><Cnpj>17122471000175</Cnpj></IdentificacaoPrestador><RazaoSocial>BLD</RazaoSocial></PrestadorServico>
  <TomadorServico><IdentificacaoTomador><CpfCnpj><Cpf>529.982.247-25</Cpf></CpfCnpj></IdentificacaoTomador><RazaoSocial>Pessoa Fisica</RazaoSocial></TomadorServico>
</InfNfse></Nfse></CompNfse>`;

const nacional = `<?xml version="1.0"?><NFSe xmlns="http://www.sped.fazenda.gov.br/nfse"><infNFSe>
  <nNFSe>1010</nNFSe>
  <dhProc>2026-09-06T08:00:00-03:00</dhProc>
  <emit><CNPJ>17122471000175</CNPJ><xNome>BLD LOGISTICA LTDA</xNome></emit>
  <DPS><infDPS>
    <serie>5</serie><nDPS>88</nDPS><dCompet>2026-09-01</dCompet>
    <toma><CNPJ>39952818000140</CNPJ><xNome>ZAHRA PERFUMES LTDA</xNome></toma>
    <serv><valores><vServPrest><vServ>1800.00</vServ></vServPrest></valores></serv>
  </infDPS></DPS>
</infNFSe></NFSe>`;

const cancelada = `<?xml version="1.0"?><CompNfse>
  <Nfse><InfNfse>
    <Numero>5</Numero><DataEmissao>2026-09-01T10:00:00</DataEmissao>
    <Servico><Valores><ValorServicos>100.00</ValorServicos></Valores></Servico>
    <PrestadorServico><IdentificacaoPrestador><CpfCnpj><Cnpj>17122471000175</Cnpj></CpfCnpj></IdentificacaoPrestador></PrestadorServico>
  </InfNfse></Nfse>
  <NfseCancelamento><Confirmacao><DataHora>2026-09-02T11:00:00</DataHora></Confirmacao></NfseCancelamento>
</CompNfse>`;

describe("NFS-e", () => {
  it("lê o ABRASF 2.x dentro do envelope de consulta", () => {
    const d = extraido(abrasf2);
    expect(d.tipo).toBe("NFSE");
    expect(d.numero).toBe("4321");
    expect(d.serie).toBe("A");
    expect(d.emitente).toEqual({ nome: "BLD LOGISTICA LTDA", documento: "17122471000175" });
    expect(d.destinatario).toEqual({ nome: "ZAHRA PERFUMES LTDA", documento: "39952818000140" });
  });

  // Não existe chave nacional. É por isso que a identidade do acervo é a
  // dedupKey composta, e não esta coluna.
  it("nunca tem chave de acesso", () => {
    for (const xml of [abrasf2, abrasf1, nacional]) {
      expect(extraido(xml).chaveAcesso).toBeNull();
    }
  });

  // O serviço prestado em agosto pode ser faturado em setembro. Derivar da data
  // de emissão jogaria a nota no mês errado — que é o mês que o contador fecha.
  it("a competência declarada vence a data de emissão", () => {
    const d = extraido(abrasf2);
    expect(d.emitidoEm.getUTCMonth()).toBe(8); // setembro
    expect(d.competenciaDeclarada).toBe("2026-08");
  });

  it("competência do padrão nacional sai do dCompet", () => {
    expect(extraido(nacional).competenciaDeclarada).toBe("2026-09");
  });

  it("sem competência declarada, fica nulo e quem deriva é o chamador", () => {
    expect(extraido(abrasf1).competenciaDeclarada).toBeNull();
  });

  // ValorLiquidoNfse é o serviço menos retenções; retenção é assunto do
  // lançamento. O valor da nota é o contratado, que é o que sai no DANFSE.
  it("usa o valor do serviço, não o líquido", () => {
    expect(extraido(abrasf2).valorTotal).toBe("2500.00");
    expect(extraido(abrasf2).valorTotal).not.toBe("2375.00");
  });

  it("lê o CpfCnpj embrulhado e o Cnpj solto — municípios fazem dos dois jeitos", () => {
    expect(extraido(abrasf1).emitente.documento).toBe("17122471000175");
    expect(extraido(abrasf1).destinatario.documento).toBe("52998224725");
  });

  it("lê o padrão nacional, com tags e aninhamento próprios", () => {
    const d = extraido(nacional);
    expect(d.numero).toBe("1010");
    expect(d.serie).toBe("5");
    expect(d.valorTotal).toBe("1800.00");
    expect(d.emitente.documento).toBe("17122471000175");
    expect(d.destinatario.documento).toBe("39952818000140");
  });

  // O cancelamento vem ao lado da nota, no mesmo envelope — não dentro dela.
  // Ignorar colocaria uma nota cancelada na fila de lançamento.
  it("reconhece a nota que já vem cancelada no arquivo", () => {
    expect(extraido(cancelada).cancelada).toBe(true);
    expect(extraido(abrasf2).cancelada).toBe(false);
  });

  it("NFS-e sem prestador não entra — sem ele não há identidade para deduplicar", () => {
    const xml = `<?xml version="1.0"?><CompNfse><Nfse><InfNfse>
      <Numero>1</Numero><DataEmissao>2026-09-01T10:00:00</DataEmissao>
      <Servico><Valores><ValorServicos>10.00</ValorServicos></Valores></Servico>
    </InfNfse></Nfse></CompNfse>`;
    expect(lerXmlFiscal(xml)).toMatchObject({ ok: false, motivo: "campo_obrigatorio_ausente" });
  });

  // A armadilha que o protótipo levou: `<Numero>` casado por prefixo pega
  // `<NumeroLote>`. Com parser de verdade os nomes são exatos, e o teste trava.
  it("não confunde o número da nota com o número do lote", () => {
    const xml = `<?xml version="1.0"?><ConsultarNfseResposta><NumeroLote>999888</NumeroLote>
      <ListaNfse><CompNfse><Nfse><InfNfse>
        <Numero>7</Numero><DataEmissao>2026-09-01T10:00:00</DataEmissao>
        <Servico><Valores><ValorServicos>10.00</ValorServicos></Valores></Servico>
        <PrestadorServico><IdentificacaoPrestador><CpfCnpj><Cnpj>17122471000175</Cnpj></CpfCnpj></IdentificacaoPrestador></PrestadorServico>
      </InfNfse></Nfse></CompNfse></ListaNfse></ConsultarNfseResposta>`;
    expect(extraido(xml).numero).toBe("7");
  });
});
