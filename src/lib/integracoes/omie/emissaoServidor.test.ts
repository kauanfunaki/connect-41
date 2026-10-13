import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// O caminho inteiro da emissão com o banco simulado e um Omie de mentira —
// nenhuma chamada sai daqui. As respostas do Omie seguem a documentação
// (13/10/2026); quando a prévia mostrar a resposta real, os casos se ajustam.

type Linha = Record<string, unknown> & { id: string };

const banco = {
  conexoes: [] as { tenantId: string; instanceKey: string; enabled: boolean; configEnc: string }[],
  empresas: [] as { id: string; tenantId: string; name: string; displayName: string | null; cnpj: string | null; cpf: string | null }[],
  emissoes: [] as Linha[],
  documentos: [] as Linha[],
};
let proximoId = 1;

function bate(linha: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
      const o = v as Record<string, unknown>;
      if ("in" in o) return (o.in as unknown[]).includes(linha[k]);
      if ("gte" in o) return (linha[k] as Date) >= (o.gte as Date);
      if ("startsWith" in o) return String(linha[k]).startsWith(String(o.startsWith));
      return true;
    }
    return String(linha[k]) === String(v);
  });
}

const prisma = {
  tenantIntegration: {
    findUnique: vi.fn(async ({ where }: { where: { tenantId_integrationCode_instanceKey: { tenantId: string; instanceKey: string } } }) => {
      const w = where.tenantId_integrationCode_instanceKey;
      return banco.conexoes.find((c) => c.tenantId === w.tenantId && c.instanceKey === w.instanceKey) ?? null;
    }),
    findMany: vi.fn(async ({ where }: { where: { tenantId: string } }) => banco.conexoes.filter((c) => c.tenantId === where.tenantId)),
  },
  company: {
    findFirst: vi.fn(async ({ where }: { where: { id: string; tenantId: string } }) => banco.empresas.find((e) => e.id === where.id && e.tenantId === where.tenantId) ?? null),
    findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => banco.empresas.filter((e) => where.id.in.includes(e.id))),
  },
  omieEmissao: {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => banco.emissoes.find((e) => bate(e, where)) ?? null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const linha = { id: `emissao-${proximoId++}`, createdAt: new Date(), omieCodigoOS: null, omieNumeroOS: null, nfseNumero: null, fiscalDocumentId: null, ...data };
      banco.emissoes.push(linha);
      return linha;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const linha = banco.emissoes.find((e) => e.id === where.id)!;
      for (const [k, v] of Object.entries(data)) {
        if (k === "consultas") continue;
        if (k === "fiscalDocument") linha.fiscalDocumentId = (v as { connect: { id: string } }).connect.id;
        else linha[k] = v;
      }
      return linha;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const alvo = banco.emissoes.filter((e) => bate(e, where));
      for (const l of alvo) Object.assign(l, data);
      return { count: alvo.length };
    }),
    findMany: vi.fn(async () => banco.emissoes.filter((e) => e.estado === "PROCESSANDO" || e.estado === "ENVIANDO")),
  },
  fiscalDocument: {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => banco.documentos.find((d) => bate(d, where)) ?? null),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const linha = { id: `doc-${proximoId++}`, ...data };
      banco.documentos.push(linha);
      return linha;
    }),
    findUnique: vi.fn(async () => null),
    updateMany: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const d = banco.documentos.find((x) => x.id === where.id);
      if (d) Object.assign(d, data);
      return { count: d ? 1 : 0 };
    }),
  },
  user: { findMany: vi.fn(async () => []) },
};
vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));
// A configuração "cifrada" do teste é o JSON puro.
vi.mock("@/lib/integracoes/data", () => ({ lerConfig: (enc: string) => JSON.parse(enc) as Record<string, string> }));
vi.mock("./sincronizacao", () => ({ empresasDoGrupo: async () => ({ cnpjs: new Set(), porCnpj: new Map() }) }));

// ─── O Omie de mentira ──────────────────────────────────────────────────────

type Chamada = { call: string; appKey: string; param: Record<string, unknown> };
let chamadas: Chamada[] = [];
let respostas: Record<string, (param: Record<string, unknown>) => { status?: number; corpo?: unknown; falhaDeRede?: boolean }> = {};

const CNPJ_DA_CONTA = "11222333000181";

function omiePadrao() {
  respostas = {
    ListarEmpresas: () => ({ corpo: { empresas_cadastro: [{ cnpj: "11.222.333/0001-81", razao_social: "ER DIAS COMERCIAL LTDA" }] } }),
    ListarClientes: () => ({ corpo: { total_de_paginas: 1, clientes_cadastro: [{ codigo_cliente_omie: 2485994, razao_social: "TOMADOR UM LTDA", cnpj_cpf: "98.765.432/0001-10" }] } }),
    ListarCadastroServico: () => ({ corpo: { nTotPaginas: 1, cadastros: [{ intListar: { nCodServ: 2342423 }, cabecalho: { cDescricao: "Manutenção", cCodCateg: "1.01.02" } }] } }),
    IncluirOS: (p) => ({ corpo: { cCodIntOS: (p.Cabecalho as { cCodIntOS: string }).cCodIntOS, nCodOS: 3156789012, cNumOS: "000123", cCodStatus: "0", cDescStatus: "OS cadastrada." } }),
    FaturarOS: () => ({ corpo: { nCodOS: 3156789012, cCodStatus: "0", cDescStatus: "OS faturada." } }),
    StatusOS: () => ({
      corpo: { nCodOS: 3156789012, cNumOS: "000123", cFaturada: "S", cCancelada: "N", cAmbiente: "P", dDtFat: "13/10/2026", cHrFat: "10:00:00", ListaRpsNfse: [{ cStatusRps: "004", nNfse: "456", cCodVerif: "AB12", cCNPJ: CNPJ_DA_CONTA, cUrlNfse: "https://prefeitura.exemplo/456" }] },
    }),
    CancelarOS: () => ({ corpo: { nCodOS: 3156789012, cCodStatus: "0", cDescStatus: "OS cancelada." } }),
  };
}

const fetchFalso = vi.fn(async (_url: string, init: RequestInit) => {
  const corpo = JSON.parse(String(init.body)) as { call: string; app_key: string; param: Record<string, unknown>[] };
  chamadas.push({ call: corpo.call, appKey: corpo.app_key, param: corpo.param[0] });
  const r = respostas[corpo.call]?.(corpo.param[0]) ?? { status: 500, corpo: { faultstring: `método ${corpo.call} não simulado` } };
  if (r.falhaDeRede) throw new TypeError("fetch failed");
  return new Response(JSON.stringify(r.corpo ?? {}), { status: r.status ?? 200 });
});

const { emitirNfse, acompanharEmissoes, cancelarEmissao, esquecerListas, outrasEmpresasDaMesmaConta } = await import("./emissaoServidor");
const { esquecerFilasEPausas } = await import("./fila");

const PEDIDO = { tomadorCodigo: "2485994", servicoCodigo: "2342423", valorCentavos: 1000, competencia: "2026-10", descricao: null };
const AGORA = new Date("2026-10-13T15:00:00Z");

function conta(companyId: string, appKey: string) {
  return { tenantId: "t1", instanceKey: `empresa:${companyId}`, enabled: true, configEnc: JSON.stringify({ appKey, appSecret: "s" }) };
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchFalso);
  chamadas = [];
  proximoId = 1;
  omiePadrao();
  // ER DIAS é a dona da conta; ELIO RUBENS foi cadastrada com a mesma App Key (13/10/2026).
  banco.conexoes = [conta("erdias", "chave-compartilhada"), conta("elio", "chave-compartilhada")];
  banco.empresas = [
    { id: "erdias", tenantId: "t1", name: "ER DIAS COMERCIAL LTDA", displayName: null, cnpj: "11.222.333/0001-81", cpf: null },
    { id: "elio", tenantId: "t1", name: "ELIO RUBENS TONDIN FERREIRA DIAS", displayName: null, cnpj: null, cpf: "123.456.789-09" },
  ];
  banco.emissoes = [];
  banco.documentos = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
  esquecerListas();
  esquecerFilasEPausas();
});

describe("emitir", () => {
  it("cria a OS com o id da emissão, fatura em seguida e fica processando", async () => {
    const r = await emitirNfse({ tenantId: "t1", companyId: "erdias", userId: "u1", pedido: PEDIDO, agora: AGORA });
    expect(r).toMatchObject({ ok: true, estado: "PROCESSANDO", mensagem: "OS faturada." });
    expect(chamadas.map((c) => c.call)).toEqual(["ListarEmpresas", "ListarClientes", "ListarCadastroServico", "IncluirOS", "FaturarOS"]);
    const incluir = chamadas.find((c) => c.call === "IncluirOS")!;
    expect(incluir.param).toMatchObject({
      Cabecalho: { cCodIntOS: banco.emissoes[0].id, nCodCli: 2485994, dDtPrevisao: "13/10/2026" },
      InformacoesAdicionais: { cCodCateg: "1.01.02" },
      ServicosPrestados: [{ nCodServico: 2342423, nQtde: 1, nValUnit: 10 }],
    });
    expect(chamadas.find((c) => c.call === "FaturarOS")!.param).toEqual({ nCodOS: 3156789012 });
    expect(banco.emissoes[0]).toMatchObject({ estado: "PROCESSANDO", omieCodigoOS: "3156789012", omieNumeroOS: "000123", pedidoPorId: "u1", valor: "10.00" });
  });

  it("a outra empresa cadastrada com a mesma chave não emite — a nota sairia pelo CNPJ da conta", async () => {
    const r = await emitirNfse({ tenantId: "t1", companyId: "elio", userId: "u1", pedido: PEDIDO, agora: AGORA });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("ER DIAS COMERCIAL LTDA");
    expect(banco.emissoes).toHaveLength(0);
    expect(chamadas.map((c) => c.call)).not.toContain("IncluirOS");
    expect(await outrasEmpresasDaMesmaConta("t1", "elio")).toEqual(["ER DIAS COMERCIAL LTDA"]);
  });

  it("as duas empresas leem as listas da mesma conta uma vez só", async () => {
    await emitirNfse({ tenantId: "t1", companyId: "elio", userId: "u1", pedido: PEDIDO, agora: AGORA });
    await emitirNfse({ tenantId: "t1", companyId: "erdias", userId: "u1", pedido: PEDIDO, agora: AGORA });
    expect(chamadas.filter((c) => c.call === "ListarClientes")).toHaveLength(1);
  });

  it("recusa do Omie na OS: rejeitada com a mensagem como veio, e sem faturar", async () => {
    respostas.IncluirOS = () => ({ status: 500, corpo: { faultstring: "ERROR: Categoria [1.01.02] não cadastrada!", faultcode: "SOAP-ENV:Client-103" } });
    const r = await emitirNfse({ tenantId: "t1", companyId: "erdias", userId: "u1", pedido: PEDIDO, agora: AGORA });
    expect(r).toMatchObject({ ok: true, estado: "REJEITADA", mensagem: "ERROR: Categoria [1.01.02] não cadastrada!" });
    expect(chamadas.map((c) => c.call)).not.toContain("FaturarOS");
  });

  it("sem resposta na OS: fica enviando, para o acompanhamento perguntar — sem repetir o pedido", async () => {
    respostas.IncluirOS = () => ({ falhaDeRede: true });
    const r = await emitirNfse({ tenantId: "t1", companyId: "erdias", userId: "u1", pedido: PEDIDO, agora: AGORA });
    expect(r).toMatchObject({ ok: true, estado: "ENVIANDO" });
    expect(chamadas.filter((c) => c.call === "IncluirOS")).toHaveLength(1);
    expect(chamadas.map((c) => c.call)).not.toContain("FaturarOS");
  });

  it("recusa no faturamento: rejeitada, dizendo que a OS ficou no Omie sem nota", async () => {
    respostas.FaturarOS = () => ({ status: 500, corpo: { faultstring: "ERROR: Certificado digital vencido" } });
    const r = await emitirNfse({ tenantId: "t1", companyId: "erdias", userId: "u1", pedido: PEDIDO, agora: AGORA });
    expect(r).toMatchObject({ ok: true, estado: "REJEITADA" });
    if (r.ok) expect(r.mensagem).toContain("ficou criada no Omie, sem nota");
    expect(banco.emissoes[0].omieCodigoOS).toBe("3156789012");
  });

  it("bloqueio do Omie: a primeira fica rejeitada com a mensagem, e a próxima nem vira linha até a pausa passar", async () => {
    respostas.IncluirOS = () => ({ status: 425, corpo: { faultstring: "API bloqueada por consumo indevido." } });
    const primeira = await emitirNfse({ tenantId: "t1", companyId: "erdias", userId: "u1", pedido: PEDIDO, agora: AGORA });
    expect(primeira).toMatchObject({ ok: true, estado: "REJEITADA" });
    const segunda = await emitirNfse({ tenantId: "t1", companyId: "erdias", userId: "u1", pedido: { ...PEDIDO, valorCentavos: 2000 }, agora: AGORA });
    expect(segunda.ok).toBe(false);
    if (!segunda.ok) expect(segunda.erro).toContain("pausa");
    expect(banco.emissoes).toHaveLength(1);
    expect(chamadas.filter((c) => c.call === "IncluirOS")).toHaveLength(1);
  });

  it("clique duplo não vira duas notas", async () => {
    await emitirNfse({ tenantId: "t1", companyId: "erdias", userId: "u1", pedido: PEDIDO, agora: AGORA });
    const segunda = await emitirNfse({ tenantId: "t1", companyId: "erdias", userId: "u1", pedido: PEDIDO, agora: AGORA });
    expect(segunda.ok).toBe(false);
    expect(chamadas.filter((c) => c.call === "IncluirOS")).toHaveLength(1);
  });
});

describe("acompanhar", () => {
  it("nota autorizada: guarda o número e entra no acervo com origem OMIE e a dedupKey de NFS-e", async () => {
    await emitirNfse({ tenantId: "t1", companyId: "erdias", userId: "u1", pedido: PEDIDO, agora: AGORA });
    const resumo = await acompanharEmissoes(new Date(AGORA.getTime() + 10 * 60_000));
    expect(resumo).toMatchObject({ consultadas: 1, autorizadas: 1, falhas: [] });
    expect(chamadas.filter((c) => c.call === "StatusOS")[0].param).toEqual({ nCodOS: 3156789012 });
    expect(banco.documentos).toHaveLength(1);
    expect(banco.documentos[0]).toMatchObject({
      dedupKey: `NFSE:${CNPJ_DA_CONTA}::456:2026-10`,
      origin: "OMIE",
      type: "NFSE",
      companyId: "erdias",
      issuerDocument: CNPJ_DA_CONTA,
      recipientDocument: "98765432000110",
      situation: "AUTORIZADA",
      renderizavel: false,
    });
    expect(banco.emissoes[0]).toMatchObject({ estado: "AUTORIZADA", nfseNumero: "456", nfseUrl: "https://prefeitura.exemplo/456", fiscalDocumentId: banco.documentos[0].id });
  });

  it("a nota que o SPED já trouxe é reconhecida, não duplicada — mesmo com série", async () => {
    banco.documentos.push({ id: "do-sped", tenantId: "t1", type: "NFSE", issuerDocument: CNPJ_DA_CONTA, number: "456", competence: "2026-10", series: "A1", origin: "SPED" });
    await emitirNfse({ tenantId: "t1", companyId: "erdias", userId: "u1", pedido: PEDIDO, agora: AGORA });
    await acompanharEmissoes(new Date(AGORA.getTime() + 10 * 60_000));
    expect(banco.documentos).toHaveLength(1);
    expect(banco.emissoes[0].fiscalDocumentId).toBe("do-sped");
  });

  it("homologação não entra no acervo", async () => {
    const statusNormal = respostas.StatusOS;
    respostas.StatusOS = (p) => {
      const r = statusNormal(p);
      return { corpo: { ...(r.corpo as object), cAmbiente: "H" } };
    };
    await emitirNfse({ tenantId: "t1", companyId: "erdias", userId: "u1", pedido: PEDIDO, agora: AGORA });
    await acompanharEmissoes(new Date(AGORA.getTime() + 10 * 60_000));
    expect(banco.documentos).toHaveLength(0);
    expect(banco.emissoes[0]).toMatchObject({ estado: "AUTORIZADA", ambiente: "H" });
    expect(String(banco.emissoes[0].mensagem)).toContain("homologação");
  });

  it("ENVIANDO que o Omie não conhece: rejeitada, nada foi emitido", async () => {
    respostas.IncluirOS = () => ({ falhaDeRede: true });
    await emitirNfse({ tenantId: "t1", companyId: "erdias", userId: "u1", pedido: PEDIDO, agora: AGORA });
    respostas.StatusOS = () => ({ status: 500, corpo: { faultstring: "ERROR: Ordem de Serviço não cadastrada para o Código de Integração [x]" } });
    await acompanharEmissoes(new Date(AGORA.getTime() + 10 * 60_000));
    // Sem o código da OS, a pergunta vai pelo código de integração.
    expect(chamadas.filter((c) => c.call === "StatusOS")[0].param).toEqual({ cCodIntOS: banco.emissoes[0].id });
    expect(banco.emissoes[0].estado).toBe("REJEITADA");
    expect(String(banco.emissoes[0].mensagem)).toContain("nada foi emitido");
  });

  it("ENVIANDO cuja OS existe sem faturamento: rejeitada, e o cron não fatura sozinho", async () => {
    respostas.IncluirOS = () => ({ falhaDeRede: true });
    await emitirNfse({ tenantId: "t1", companyId: "erdias", userId: "u1", pedido: PEDIDO, agora: AGORA });
    respostas.StatusOS = () => ({ corpo: { nCodOS: 3156789012, cNumOS: "000123", cFaturada: "N", cCancelada: "N", ListaRpsNfse: [] } });
    await acompanharEmissoes(new Date(AGORA.getTime() + 10 * 60_000));
    expect(chamadas.map((c) => c.call)).not.toContain("FaturarOS");
    expect(banco.emissoes[0]).toMatchObject({ estado: "REJEITADA", omieCodigoOS: "3156789012" });
  });
});

describe("cancelar", () => {
  it("nota autorizada: cancela na prefeitura e marca a nota do acervo", async () => {
    await emitirNfse({ tenantId: "t1", companyId: "erdias", userId: "u1", pedido: PEDIDO, agora: AGORA });
    await acompanharEmissoes(new Date(AGORA.getTime() + 10 * 60_000));
    const r = await cancelarEmissao({ tenantId: "t1", emissaoId: banco.emissoes[0].id, userId: "u2" });
    expect(r).toEqual({ ok: true, naPrefeitura: true, mensagem: "OS cancelada." });
    expect(chamadas.find((c) => c.call === "CancelarOS")!.param).toEqual({ nCodOS: 3156789012, cCancelarNfse: "S" });
    expect(banco.emissoes[0]).toMatchObject({ estado: "CANCELADA", canceladaPorId: "u2" });
    expect(banco.documentos[0].situation).toBe("CANCELADA");
  });

  it("recusa do Omie no cancelamento não muda nada aqui", async () => {
    await emitirNfse({ tenantId: "t1", companyId: "erdias", userId: "u1", pedido: PEDIDO, agora: AGORA });
    await acompanharEmissoes(new Date(AGORA.getTime() + 10 * 60_000));
    respostas.CancelarOS = () => ({ status: 500, corpo: { faultstring: "ERROR: Prazo de cancelamento expirado" } });
    const r = await cancelarEmissao({ tenantId: "t1", emissaoId: banco.emissoes[0].id, userId: "u2" });
    expect(r).toEqual({ ok: false, erro: "ERROR: Prazo de cancelamento expirado" });
    expect(banco.emissoes[0].estado).toBe("AUTORIZADA");
    expect(banco.documentos[0].situation).toBe("AUTORIZADA");
  });

  it("o que ainda está em voo não se cancela", async () => {
    await emitirNfse({ tenantId: "t1", companyId: "erdias", userId: "u1", pedido: PEDIDO, agora: AGORA });
    const r = await cancelarEmissao({ tenantId: "t1", emissaoId: banco.emissoes[0].id, userId: "u2" });
    expect(r.ok).toBe(false);
    expect(chamadas.map((c) => c.call)).not.toContain("CancelarOS");
  });
});
