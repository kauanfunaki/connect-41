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
  parametrosDoIncluirOS,
  servicosDaPagina,
  validarPedido,
} from "./emissao";

// As respostas abaixo seguem a documentação pública do Omie (13/10/2026), não
// resposta real — é o que a prévia vai confirmar ou corrigir.

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
      { codigo: "2342423", codigoInterno: "SRV001", descricao: "Manutenção de máquinas", precoUnitario: 150.5, categoria: "1.01.02" },
      { codigo: "11", codigoInterno: null, descricao: "Consultoria", precoUnitario: 1234.56, categoria: null },
    ]);
  });

  it("resposta com outro formato vira lista vazia, sem quebrar", () => {
    expect(clientesDaPagina({ outra: [] })).toEqual({ clientes: [], totalDePaginas: 1 });
    expect(servicosDaPagina("texto")).toEqual({ servicos: [], totalDePaginas: 1 });
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
  const bruto = { tomadorCodigo: "2485994", servicoCodigo: "2342423", valorCentavos: 15050, competencia: "2026-10", descricao: "  Manutenção preventiva de outubro  " };

  it("aceita o pedido completo e limpa a descrição", () => {
    expect(validarPedido(bruto, "2026-10")).toEqual({
      ok: true,
      pedido: { tomadorCodigo: "2485994", servicoCodigo: "2342423", valorCentavos: 15050, competencia: "2026-10", descricao: "Manutenção preventiva de outubro" },
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

  it("só a competência do mês corrente — o Omie não recebe competência pela API", () => {
    expect(competenciaPermitida("2026-10", "2026-10")).toBeNull();
    expect(competenciaPermitida("2026-09", "2026-10")).toContain("10/2026");
    expect(competenciaPermitida("2026-13", "2026-10")).toBe("Competência inválida.");
    expect(validarPedido({ ...bruto, competencia: "2026-09" }, "2026-10")).toMatchObject({ ok: false });
  });

  it("monta o IncluirOS com o id da emissão como código de integração", () => {
    const ok = validarPedido(bruto, "2026-10");
    if (!ok.ok) throw new Error("pedido devia passar");
    expect(parametrosDoIncluirOS({ emissaoId: "emissao-1", pedido: ok.pedido, categoria: "1.01.02", hoje: "13/10/2026" })).toEqual({
      Cabecalho: { cCodIntOS: "emissao-1", nCodCli: 2485994, dDtPrevisao: "13/10/2026", cEtapa: "10", nQtdeParc: 1 },
      InformacoesAdicionais: { cCodCateg: "1.01.02" },
      ServicosPrestados: [{ nCodServico: 2342423, nQtde: 1, nValUnit: 150.5, cDescServ: "Manutenção preventiva de outubro" }],
    });
  });

  it("sem descrição nem categoria, deixa o cadastro do Omie valer", () => {
    const p = parametrosDoIncluirOS({
      emissaoId: "e",
      pedido: { tomadorCodigo: "1", servicoCodigo: "2", valorCentavos: 100, competencia: "2026-10", descricao: null },
      categoria: null,
      hoje: "01/10/2026",
    });
    expect(p).not.toHaveProperty("InformacoesAdicionais");
    expect((p.ServicosPrestados as Record<string, unknown>[])[0]).not.toHaveProperty("cDescServ");
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

  it("lê o StatusOS com o RPS e as mensagens da prefeitura", () => {
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
