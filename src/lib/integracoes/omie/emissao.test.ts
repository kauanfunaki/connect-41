import { describe, expect, it } from "vitest";

import { ErroDoOmie } from "./cliente";
import {
  clientesDaPagina,
  comoCancelar,
  competenciaPermitida,
  conferirEmissor,
  dataDoOmie,
  desfechoDoStatus,
  ehNaoEncontrada,
  ehOsJaCadastrada,
  ehSemResposta,
  lerRespostaDaOS,
  lerStatusDaOS,
  mensagensEmTexto,
  notaParaOAcervo,
  osDaPagina,
  parametrosDoIncluirOS,
  servicosDaPagina,
  sugestoesDasOS,
  validarPedido,
} from "./emissao";

// As respostas abaixo seguem a documentação pública do Omie (13/10/2026) e,
// onde está dito, a forma da prévia real da MULTI (13/10/2026) — com valores
// inventados, porque a prévia sai mascarada.

describe("listas do Omie para a tela", () => {
  it("lê os clientes, só dígitos no documento, e deixa o inativo de fora", () => {
    const r = clientesDaPagina({
      pagina: 1,
      total_de_paginas: 3,
      clientes_cadastro: [
        { codigo_cliente_omie: 2485994, razao_social: "TOMADOR UM LTDA", cnpj_cpf: "12.345.678/0001-90", cidade: "CURITIBA (PR)", estado: "PR", inativo: "N" },
        { codigo_cliente_omie: "777", razao_social: "", nome_fantasia: "Só Fantasia", cnpj_cpf: "123.456.789-09" },
        { codigo_cliente_omie: 999, razao_social: "INATIVO SA", inativo: "S" },
        { codigo_cliente_omie: 0, razao_social: "SEM CÓDIGO" },
        "lixo",
      ],
    });
    expect(r.totalDePaginas).toBe(3);
    expect(r.clientes).toEqual([
      { codigo: "2485994", nome: "TOMADOR UM LTDA", documento: "12345678000190", cidade: "CURITIBA (PR) / PR" },
      { codigo: "777", nome: "Só Fantasia", documento: "12345678909", cidade: null },
    ]);
    expect(r.bloqueados).toEqual([]);
  });

  it("cliente com faturamento bloqueado no Omie fica fora da lista, e o código volta à parte (forma da prévia real)", () => {
    const cliente = (codigo: number, bloquear: string) => ({
      codigo_cliente_omie: codigo,
      cnpj_cpf: "12.345.678/0001-90",
      razao_social: `CLIENTE ${codigo}`,
      nome_fantasia: "",
      inativo: "N",
      bloquear_faturamento: bloquear,
      pessoa_fisica: "N",
      tags: [],
    });
    const r = clientesDaPagina({ pagina: 1, total_de_paginas: 281, clientes_cadastro: [cliente(101, "N"), cliente(102, "S"), cliente(103, "")] });
    expect(r.clientes.map((c) => c.codigo)).toEqual(["101", "103"]);
    expect(r.bloqueados).toEqual(["102"]);
  });

  it("lê os serviços, com cabeçalho em objeto ou em lista", () => {
    const r = servicosDaPagina({
      nPagina: 1,
      nTotPaginas: 1,
      cadastros: [
        { intListar: { nCodServ: 2342423, cCodIntServ: "" }, cabecalho: { cDescricao: "Manutenção de máquinas", cCodigo: "SRV001", nPrecoUnit: 150.5, cCodCateg: "1.01.02" }, info: { inativo: "N" } },
        { intListar: { nCodServ: "11" }, cabecalho: [{ cDescricao: "Consultoria", nPrecoUnit: "1.234,56" }] },
        { intListar: { nCodServ: 12 }, cabecalho: { cDescricao: "Velho" }, info: { inativo: "S" } },
        { intListar: {}, cabecalho: { cDescricao: "Sem código" } },
      ],
    });
    expect(r.servicos).toEqual([
      {
        codigo: "2342423",
        codigoInterno: "SRV001",
        descricao: "Manutenção de máquinas",
        precoUnitario: 150.5,
        categoria: "1.01.02",
        codigoMunicipal: null,
        codigoLC116: null,
        naUltimaOS: null,
      },
      { codigo: "11", codigoInterno: null, descricao: "Consultoria", precoUnitario: 1234.56, categoria: null, codigoMunicipal: null, codigoLC116: null, naUltimaOS: null },
    ]);
  });

  it("o serviço da prévia real: sem categoria e sem código municipal no cadastro", () => {
    const r = servicosDaPagina({
      nPagina: 1,
      nTotPaginas: 23,
      cadastros: [
        {
          cabecalho: { cCodigo: "SRV00001", cDescricao: "Assessoria contábil", cCodCateg: "", cCodLC116: "17.19", cCodServMun: "", cIdTrib: "01", nPrecoUnit: 0 },
          info: { inativo: "N" },
          intListar: { nCodServ: 4455667788, cCodIntServ: "" },
          impostos: { nAliqISS: 2, cRetISS: "N" },
        },
      ],
    });
    expect(r.totalDePaginas).toBe(23);
    expect(r.servicos[0]).toMatchObject({ codigo: "4455667788", categoria: null, codigoMunicipal: null, codigoLC116: "17.19" });
  });

  it("resposta com outro formato vira lista vazia, sem quebrar", () => {
    expect(clientesDaPagina({ outra: [] })).toEqual({ clientes: [], bloqueados: [], totalDePaginas: 1 });
    expect(servicosDaPagina("texto")).toEqual({ servicos: [], totalDePaginas: 1 });
    expect(osDaPagina(null)).toEqual([]);
  });
});

describe("o que as OS já emitidas sugerem (forma do ListarOS da prévia real)", () => {
  const os = (p: { nCodOS: number; cNumOS: string; cancelada?: string; faturada?: string; categ?: string; itens?: Record<string, unknown>[] }) => ({
    Cabecalho: { nCodOS: p.nCodOS, cNumOS: p.cNumOS, nCodCli: 101, cEtapa: "60", nQtdeParc: 1, nValorTotal: 1500, cCodParc: "000" },
    InfoCadastro: { cFaturada: p.faturada ?? "S", cCancelada: p.cancelada ?? "N", cAmbiente: "P" },
    InformacoesAdicionais: { cCodCateg: p.categ ?? "", nCodCC: 998877, cCidPrestServ: "CURITIBA (PR)", cNumPedido: "", cContato: "" },
    Parcelas: [],
    ServicosPrestados: p.itens ?? [],
    Email: { cEnvBoleto: "N", cEnvLink: "N", cEnvRecibo: "N" },
  });
  const item = (nCodServico: number, mun: string, lc: string) => ({
    nCodServico,
    cCodServLC116: lc,
    cCodServMun: mun,
    cTribServ: "01",
    cRetemISS: "N",
    cDescServ: "x",
    nQtde: 1,
    nValUnit: 1500,
    impostos: {},
  });

  it("lê a lista e põe a OS mais nova primeiro, mesmo se o Omie ignorar a ordem pedida", () => {
    const lista = osDaPagina({ pagina: 1, total_de_paginas: 19, osCadastro: [os({ nCodOS: 900, cNumOS: "9" }), os({ nCodOS: 1200, cNumOS: "12" }), os({ nCodOS: 1100, cNumOS: "11" })] });
    expect(lista.map((o) => o.codigo)).toEqual(["1200", "1100", "900"]);
    expect(lista[0]).toMatchObject({ numero: "12", faturada: true, cancelada: false, categoria: null, servicos: [] });
  });

  it("sugere a categoria da OS mais recente não cancelada — a cancelada pode ter caído pelo código errado", () => {
    const lista = osDaPagina({
      osCadastro: [
        os({ nCodOS: 1300, cNumOS: "13", cancelada: "S", categ: "9.99.99" }),
        os({ nCodOS: 1200, cNumOS: "12", categ: "1.01.02" }),
        os({ nCodOS: 1100, cNumOS: "11", categ: "1.01.03" }),
      ],
    });
    expect(sugestoesDasOS(lista).categoria).toEqual({ codigo: "1.01.02", numeroOS: "12" });
  });

  it("e, por serviço, os códigos fiscais da OS mais recente que o usou", () => {
    const lista = osDaPagina({
      osCadastro: [
        os({ nCodOS: 1300, cNumOS: "13", cancelada: "S", itens: [item(55, "0000", "9.99")] }),
        os({ nCodOS: 1200, cNumOS: "12", itens: [item(55, "010701", "1.07"), item(66, "", "")] }),
        os({ nCodOS: 1100, cNumOS: "11", itens: [item(55, "999999", "1.07"), item(66, "171901", "")] }),
      ],
    });
    expect(sugestoesDasOS(lista).porServico).toEqual({
      "55": { codigoMunicipal: "010701", codigoLC116: "1.07", numeroOS: "12" },
      "66": { codigoMunicipal: "171901", codigoLC116: null, numeroOS: "11" },
    });
  });

  it("sem OS com categoria, não sugere nada", () => {
    expect(sugestoesDasOS(osDaPagina({ osCadastro: [os({ nCodOS: 1, cNumOS: "1" })] }))).toEqual({ categoria: null, porServico: {} });
    expect(sugestoesDasOS([])).toEqual({ categoria: null, porServico: {} });
  });
});

describe("quem emite: a empresa precisa ser a da conta do Omie", () => {
  const conta = [{ cnpj: "11222333000181", razaoSocial: "ER DIAS COMERCIAL LTDA", nomeFantasia: null }];

  it("libera a empresa cujo CNPJ está na conta", () => {
    expect(conferirEmissor(conta, "11.222.333/0001-81")).toEqual({ pode: true, empresasNaConta: 1 });
  });

  it("barra a outra empresa do Connect cadastrada com a mesma chave (ELIO RUBENS × ER DIAS, 13/10/2026)", () => {
    const r = conferirEmissor(conta, "98765432000110");
    expect(r.pode).toBe(false);
    if (!r.pode) {
      expect(r.motivo).toContain("11.222.333/0001-81");
      expect(r.motivo).toContain("ER DIAS COMERCIAL LTDA");
    }
    // Pessoa física: confere pelo CPF, que também não está na conta.
    expect(conferirEmissor(conta, "12345678909").pode).toBe(false);
  });

  it("sem documento ou sem empresa na conta, não há como conferir — e não emite", () => {
    expect(conferirEmissor(conta, null).pode).toBe(false);
    expect(conferirEmissor([], "11222333000181").pode).toBe(false);
  });

  it("conta com várias empresas libera, e diz quantas — a tela avisa", () => {
    const varias = [...conta, { cnpj: "11222333000262", razaoSocial: "ER DIAS FILIAL", nomeFantasia: null }];
    expect(conferirEmissor(varias, "11222333000262")).toEqual({ pode: true, empresasNaConta: 2 });
  });
});

describe("o pedido", () => {
  const bruto = {
    tomadorCodigo: "2485994",
    servicoCodigo: "2342423",
    valorCentavos: 15050,
    competencia: "2026-10",
    descricao: "  Manutenção preventiva de outubro  ",
    categoria: " 1.01.02 ",
    codigoServicoMunicipal: "",
    codigoLC116: "",
  };

  it("aceita o pedido completo e limpa a descrição", () => {
    expect(validarPedido(bruto, "2026-10")).toEqual({
      ok: true,
      pedido: {
        tomadorCodigo: "2485994",
        servicoCodigo: "2342423",
        valorCentavos: 15050,
        competencia: "2026-10",
        descricao: "Manutenção preventiva de outubro",
        categoria: "1.01.02",
        codigoServicoMunicipal: null,
        codigoLC116: null,
      },
    });
    const semDescricao = validarPedido({ ...bruto, descricao: "   " }, "2026-10");
    expect(semDescricao.ok && semDescricao.pedido.descricao).toBeNull();
  });

  it("recusa o que falta ou não é do Omie", () => {
    expect(validarPedido({ ...bruto, tomadorCodigo: "" }, "2026-10")).toMatchObject({ ok: false });
    expect(validarPedido({ ...bruto, servicoCodigo: "abc" }, "2026-10")).toMatchObject({ ok: false });
    expect(validarPedido({ ...bruto, valorCentavos: 0 }, "2026-10")).toMatchObject({ ok: false });
    expect(validarPedido({ ...bruto, valorCentavos: null }, "2026-10")).toMatchObject({ ok: false });
    expect(validarPedido({ ...bruto, descricao: "x".repeat(2001) }, "2026-10")).toMatchObject({ ok: false });
  });

  it("sem categoria a OS não sai — o serviço da MULTI não tem, e a OS real tem", () => {
    expect(validarPedido({ ...bruto, categoria: "  " }, "2026-10")).toEqual({ ok: false, erro: "Informe a categoria no Omie: a ordem de serviço não sai sem ela." });
    expect(validarPedido({ ...bruto, categoria: "1.01 02" }, "2026-10")).toMatchObject({ ok: false });
    expect(validarPedido({ ...bruto, categoria: "1".repeat(21) }, "2026-10")).toMatchObject({ ok: false });
  });

  it("os códigos de serviço são opcionais, e conferidos quando vêm", () => {
    const com = validarPedido({ ...bruto, codigoServicoMunicipal: " 010701 ", codigoLC116: "1.07" }, "2026-10");
    expect(com).toMatchObject({ ok: true, pedido: { codigoServicoMunicipal: "010701", codigoLC116: "1.07" } });
    expect(validarPedido({ ...bruto, codigoServicoMunicipal: "01 07" }, "2026-10")).toMatchObject({ ok: false });
    expect(validarPedido({ ...bruto, codigoLC116: "x".repeat(21) }, "2026-10")).toMatchObject({ ok: false });
  });

  it("só a competência do mês corrente — o Omie não recebe competência pela API", () => {
    expect(competenciaPermitida("2026-10", "2026-10")).toBeNull();
    expect(competenciaPermitida("2026-09", "2026-10")).toContain("10/2026");
    expect(competenciaPermitida("2026-13", "2026-10")).toBe("Competência inválida.");
    expect(validarPedido({ ...bruto, competencia: "2026-09" }, "2026-10")).toMatchObject({ ok: false });
  });

  it("monta o IncluirOS com o id da emissão como código de integração", () => {
    const ok = validarPedido(bruto, "2026-10");
    if (!ok.ok) throw new Error("pedido devia passar");
    expect(parametrosDoIncluirOS({ emissaoId: "emissao-1", pedido: ok.pedido, hoje: "13/10/2026" })).toEqual({
      Cabecalho: { cCodIntOS: "emissao-1", nCodCli: 2485994, dDtPrevisao: "13/10/2026", cEtapa: "10", nQtdeParc: 1 },
      InformacoesAdicionais: { cCodCateg: "1.01.02" },
      ServicosPrestados: [{ nCodServico: 2342423, nQtde: 1, nValUnit: 150.5, cDescServ: "Manutenção preventiva de outubro" }],
    });
  });

  const minimo = {
    tomadorCodigo: "1",
    servicoCodigo: "2",
    valorCentavos: 100,
    competencia: "2026-10",
    descricao: null,
    categoria: "1.01.02",
    codigoServicoMunicipal: null,
    codigoLC116: null,
  };

  it("sem descrição nem códigos, deixa o cadastro do Omie valer — mas a categoria vai sempre", () => {
    const p = parametrosDoIncluirOS({ emissaoId: "e", pedido: minimo, hoje: "01/10/2026" });
    expect(p.InformacoesAdicionais).toEqual({ cCodCateg: "1.01.02" });
    const item = (p.ServicosPrestados as Record<string, unknown>[])[0];
    expect(item).toEqual({ nCodServico: 2, nQtde: 1, nValUnit: 1 });
  });

  it("os códigos informados vão no item da OS, com os nomes da documentação", () => {
    const p = parametrosDoIncluirOS({ emissaoId: "e", pedido: { ...minimo, codigoServicoMunicipal: "010701", codigoLC116: "1.07" }, hoje: "01/10/2026" });
    expect((p.ServicosPrestados as Record<string, unknown>[])[0]).toMatchObject({ cCodServMun: "010701", cCodServLC116: "1.07" });
  });

  it("a data do Omie é a de Brasília", () => {
    // 01h de 14/10 em UTC ainda é 13/10 em Brasília.
    expect(dataDoOmie(new Date("2026-10-14T01:00:00Z"))).toBe("13/10/2026");
  });
});

describe("respostas da OS", () => {
  it("lê a resposta do IncluirOS", () => {
    expect(lerRespostaDaOS({ cCodIntOS: "e", nCodOS: 3156789012, cNumOS: "000123", cCodStatus: "0", cDescStatus: "Ordem de Serviço cadastrada com sucesso!" })).toEqual({
      codigoOS: "3156789012",
      numeroOS: "000123",
      codigoStatus: "0",
      descricaoStatus: "Ordem de Serviço cadastrada com sucesso!",
    });
    expect(lerRespostaDaOS({})).toEqual({ codigoOS: null, numeroOS: null, codigoStatus: null, descricaoStatus: null });
  });

  const statusBase = {
    nCodOS: 3156789012,
    cNumOS: "123",
    cFaturada: "S",
    cCancelada: "N",
    cAmbiente: "P",
    dDtFat: "31/10/2026",
    cHrFat: "22:30:00",
  };

  // A forma do StatusOS da prévia real (13/10/2026): o link vem em `danfe`, não
  // em `cUrlNfse`; as mensagens sem `cSituacao`; `nNfse` em texto.
  const rpsReal = (p: { status: string; nNfse: string; danfe?: string; xml_distr?: string }) => ({
    cCNPJ: "11222333000181",
    cCodVerif: "AB12CD34",
    cInscrMunicipal: 123456,
    cProtocolo: "987654321",
    cStatusLote: p.status,
    cStatusRps: p.status,
    danfe: p.danfe ?? "",
    xml_distr: p.xml_distr ?? "",
    mensagens: [{ cCodigo: "L000", cDescricao: "Lote processado", cCorrecao: "" }],
    nLote: 77,
    nNfse: p.nNfse,
    nRps: "1234",
  });
  const statusReal = { cEtapa: "60", cCancelada: "N", cFaturada: "S", cAmbiente: "P", dDtFat: "13/10/2026", cUrlPdfRecibo: "https://app.omie.com.br/recibo/x" };

  it("nota autorizada na forma real: o link é o `danfe`", () => {
    const s = lerStatusDaOS({
      ...statusReal,
      ListaRpsNfse: [rpsReal({ status: "004", nNfse: "000000456", danfe: "https://app.omie.com.br/nfse/456.pdf", xml_distr: "https://app.omie.com.br/nfse/456.xml" })],
    });
    expect(s.rps[0]).toEqual({
      status: "004",
      numeroNfse: "456",
      codigoVerificacao: "AB12CD34",
      cnpjPrestador: "11222333000181",
      url: "https://app.omie.com.br/nfse/456.pdf",
      mensagens: [{ codigo: "L000", descricao: "Lote processado", correcao: null, situacao: null }],
    });
    expect(desfechoDoStatus(s)).toMatchObject({ estado: "AUTORIZADA", nfse: { numero: "456", url: "https://app.omie.com.br/nfse/456.pdf" } });
  });

  it("OS faturada e cancelada na forma real (005/005): cancelada", () => {
    const s = lerStatusDaOS({ ...statusReal, cCancelada: "S", ListaRpsNfse: [rpsReal({ status: "005", nNfse: "455", danfe: "https://app.omie.com.br/nfse/455.pdf" })] });
    expect(desfechoDoStatus(s).estado).toBe("CANCELADA");
  });

  it("só link http(s) vira link — o `href` da tela não recebe outra coisa", () => {
    const url = (danfe: string, extra: Record<string, unknown> = {}) =>
      lerStatusDaOS({ ...statusReal, ListaRpsNfse: [{ ...rpsReal({ status: "004", nNfse: "1", danfe }), ...extra }] }).rps[0].url;
    expect(url("javascript:alert(1)")).toBeNull();
    expect(url("<?xml version='1.0'?><nfse/>")).toBeNull();
    // Sem `danfe`, as alternativas da documentação.
    expect(url("", { cUrlNfse: "https://prefeitura.exemplo/nfse?n=1" })).toBe("https://prefeitura.exemplo/nfse?n=1");
    expect(url("", { cUrlPdfDest: "http://prefeitura.exemplo/pdf/1" })).toBe("http://prefeitura.exemplo/pdf/1");
    expect(url("")).toBeNull();
  });

  it("lê o StatusOS com o RPS e as mensagens da prefeitura (forma da documentação)", () => {
    const s = lerStatusDaOS({
      ...statusBase,
      ListaRpsNfse: [
        {
          cStatusRps: "004",
          nNfse: "000000456",
          cCodVerif: "AB12-CD34",
          cCNPJ: "11.222.333/0001-81",
          cUrlNfse: "https://prefeitura.exemplo/nfse?n=456",
          mensagens: [{ cCodigo: "L000", cDescricao: "Processado com sucesso", cSituacao: "SUCESSO" }],
        },
      ],
    });
    expect(s).toMatchObject({ codigoOS: "3156789012", faturada: true, cancelada: false, ambiente: "P", dataDoFaturamento: "31/10/2026" });
    // 22h30 do último dia do mês em Brasília já é novembro em UTC.
    expect(s.faturadaEm?.toISOString()).toBe("2026-11-01T01:30:00.000Z");
    expect(s.rps[0]).toEqual({
      status: "004",
      numeroNfse: "456",
      codigoVerificacao: "AB12-CD34",
      cnpjPrestador: "11222333000181",
      url: "https://prefeitura.exemplo/nfse?n=456",
      mensagens: [{ codigo: "L000", descricao: "Processado com sucesso", correcao: null, situacao: "SUCESSO" }],
    });
  });

  it("autorizada quando o RPS traz o número da NFS-e", () => {
    const d = desfechoDoStatus(lerStatusDaOS({ ...statusBase, ListaRpsNfse: [{ cStatusRps: "004", nNfse: "456", cCNPJ: "11222333000181" }] }));
    expect(d).toMatchObject({ estado: "AUTORIZADA", nfse: { numero: "456", cnpjPrestador: "11222333000181" } });
  });

  it("rejeitada com a mensagem da prefeitura como veio, os erros primeiro", () => {
    const d = desfechoDoStatus(
      lerStatusDaOS({
        ...statusBase,
        ListaRpsNfse: [
          {
            cStatusRps: "003",
            mensagens: [
              { cCodigo: "A1", cDescricao: "Alíquota informada difere", cSituacao: "ALERTA" },
              { cCodigo: "E160", cDescricao: "Código de serviço não permitido para o prestador", cCorrecao: "Confira o código municipal", cSituacao: "ERRO" },
            ],
          },
        ],
      })
    );
    expect(d).toEqual({
      estado: "REJEITADA",
      mensagem: "E160: Código de serviço não permitido para o prestador — Confira o código municipal\nA1: Alíquota informada difere",
    });
  });

  it("vale o RPS mais recente — o reenvio que deu certo depois de um erro", () => {
    const d = desfechoDoStatus(
      lerStatusDaOS({ ...statusBase, ListaRpsNfse: [{ cStatusRps: "003", mensagens: [{ cDescricao: "erro" }] }, { cStatusRps: "004", nNfse: "457" }] })
    );
    expect(d.estado).toBe("AUTORIZADA");
  });

  it("segue processando enquanto a prefeitura não respondeu, ou o Omie não faturou", () => {
    expect(desfechoDoStatus(lerStatusDaOS({ ...statusBase, ListaRpsNfse: [{ cStatusRps: "002" }] }))).toEqual({ estado: "PROCESSANDO", mensagem: null, aguardandoFaturamento: false });
    expect(desfechoDoStatus(lerStatusDaOS({ ...statusBase, cFaturada: "N" }))).toEqual({
      estado: "PROCESSANDO",
      mensagem: "O Omie ainda não faturou a OS.",
      aguardandoFaturamento: true,
    });
  });

  it("status que o Connect não conhece fica processando, com o código na mensagem", () => {
    const d = desfechoDoStatus(lerStatusDaOS({ ...statusBase, ListaRpsNfse: [{ cStatusRps: "009" }] }));
    expect(d.estado).toBe("PROCESSANDO");
    if (d.estado === "PROCESSANDO") expect(d.mensagem).toContain("009");
  });

  it("cancelada no Omie ou RPS cancelado", () => {
    expect(desfechoDoStatus(lerStatusDaOS({ ...statusBase, cCancelada: "S" })).estado).toBe("CANCELADA");
    expect(desfechoDoStatus(lerStatusDaOS({ ...statusBase, ListaRpsNfse: [{ cStatusRps: "005", nNfse: "456" }] })).estado).toBe("CANCELADA");
  });

  it("resposta vazia não inventa nada", () => {
    const s = lerStatusDaOS(null);
    expect(s).toEqual({ codigoOS: null, numeroOS: null, faturada: null, cancelada: null, ambiente: null, faturadaEm: null, dataDoFaturamento: null, rps: [] });
    expect(desfechoDoStatus(s)).toMatchObject({ estado: "PROCESSANDO", aguardandoFaturamento: true });
    expect(mensagensEmTexto([])).toBeNull();
  });
});

describe("erros que mudam o caminho", () => {
  it("OS repetida, OS não encontrada e falta de resposta", () => {
    expect(ehOsJaCadastrada(new ErroDoOmie("ERROR: Ordem de Serviço já cadastrada para o código de integração [abc]", null, 500))).toBe(true);
    expect(ehNaoEncontrada(new ErroDoOmie("ERROR: Ordem de Serviço não cadastrada para o código de integração [abc]", null, 500))).toBe(true);
    expect(ehNaoEncontrada(new ErroDoOmie("ERROR: Cliente bloqueado", null, 500))).toBe(false);

    // Sem resposta: o pedido pode ter chegado.
    expect(ehSemResposta(new Error("fetch failed"))).toBe(true);
    expect(ehSemResposta(new DOMException("tempo", "TimeoutError"))).toBe(true);
    expect(ehSemResposta(new ErroDoOmie("PROTO_BYEBYE", null, 500))).toBe(true);
    expect(ehSemResposta(new ErroDoOmie("O Omie respondeu HTTP 502.", null, 502))).toBe(true);
    // Com a mensagem do Omie, é recusa; a pausa da fila nem chamou.
    expect(ehSemResposta(new ErroDoOmie("ERROR: Cliente não cadastrado", "SOAP-ENV:Client-103", 500))).toBe(false);
    expect(ehSemResposta(new ErroDoOmie("pausa", "PAUSA", 0))).toBe(false);
  });
});

describe("cancelar", () => {
  it("nota autorizada cancela na prefeitura; OS recusada sem nota cancela só a OS", () => {
    expect(comoCancelar({ estado: "AUTORIZADA", omieCodigoOS: "1", nfseNumero: "456" })).toEqual({ pode: true, naPrefeitura: true });
    expect(comoCancelar({ estado: "REJEITADA", omieCodigoOS: "1", nfseNumero: null })).toEqual({ pode: true, naPrefeitura: false });
  });

  it("não cancela o que não existe no Omie, o que está em voo, nem o já cancelado", () => {
    expect(comoCancelar({ estado: "REJEITADA", omieCodigoOS: null, nfseNumero: null }).pode).toBe(false);
    expect(comoCancelar({ estado: "ENVIANDO", omieCodigoOS: "1", nfseNumero: null }).pode).toBe(false);
    expect(comoCancelar({ estado: "PROCESSANDO", omieCodigoOS: "1", nfseNumero: null }).pode).toBe(false);
    expect(comoCancelar({ estado: "CANCELADA", omieCodigoOS: "1", nfseNumero: "456" }).pode).toBe(false);
  });
});

describe("a nota no acervo", () => {
  it("usa a mesma dedupKey de NFS-e do SPED e do upload, com a competência do faturamento", () => {
    expect(
      notaParaOAcervo({
        numero: "456",
        cnpjPrestador: "11222333000181",
        dataDoFaturamento: "31/10/2026",
        faturadaEm: new Date("2026-11-01T01:30:00Z"),
        agora: new Date("2026-11-02T12:00:00Z"),
      })
    ).toEqual({ dedupKey: "NFSE:11222333000181::456:2026-10", competencia: "2026-10", emitidaEm: new Date("2026-11-01T01:30:00Z") });
  });

  it("sem data de faturamento, usa agora em Brasília", () => {
    const r = notaParaOAcervo({ numero: "9", cnpjPrestador: "11222333000181", dataDoFaturamento: null, faturadaEm: null, agora: new Date("2026-11-01T01:30:00Z") });
    expect(r?.competencia).toBe("2026-10");
  });
});

describe("filtrosDeBuscaDeCliente", () => {
  it("CNPJ ou CPF completo, com ou sem pontuação, vai pelo documento formatado", async () => {
    const { filtrosDeBuscaDeCliente } = await import("./emissao");
    expect(filtrosDeBuscaDeCliente("12.345.678/0001-95")).toEqual([{ cnpj_cpf: "12.345.678/0001-95" }]);
    expect(filtrosDeBuscaDeCliente("12345678909")).toEqual([{ cnpj_cpf: "123.456.789-09" }]);
  });

  it("nome com números é nome, e termo curto não busca", async () => {
    const { filtrosDeBuscaDeCliente } = await import("./emissao");
    expect(filtrosDeBuscaDeCliente("Loja 12345678909")).toEqual([{ razao_social: "Loja 12345678909" }, { nome_fantasia: "Loja 12345678909" }]);
    expect(filtrosDeBuscaDeCliente(" ab ")).toEqual([]);
  });

  it("o cadastro consultado segue a regra da lista", async () => {
    const { clienteDaConsulta } = await import("./emissao");
    expect(clienteDaConsulta({ codigo_cliente_omie: 7, razao_social: "X", inativo: "S" })).toEqual({ cliente: null, bloqueado: false });
    expect(clienteDaConsulta({ codigo_cliente_omie: 7, razao_social: "X", bloquear_faturamento: "S" })).toEqual({ cliente: null, bloqueado: true });
  });
});
