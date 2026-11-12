import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1" } as { tenantId: string | null; userId: string | null },
  pode: vi.fn(),
  audit: vi.fn(),
  lerRazao: vi.fn(),
  lerApoio: vi.fn(),
  lerSispag: vi.fn(),
  criar: vi.fn(),
  obter: vi.fn(),
  listar: vi.fn(),
  renomear: vi.fn(),
  excluir: vi.fn(),
  apoio: vi.fn(),
  vincular: vi.fn(),
  desfazer: vi.fn(),
}));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/audit", () => ({ logAudit: m.audit }));
vi.mock("@/lib/contabil-core/conciliacao/razaoPdf", () => ({ lerRazaoDoArquivo: m.lerRazao, lerRazaoApoioDoArquivo: m.lerApoio }));
vi.mock("@/lib/contabil-core/conciliacao/sispag", async (original) => ({ ...(await original<object>()), lerSispag: m.lerSispag }));
vi.mock("@/lib/contabil-core/servidor/revisao", () => ({
  criarRevisao: m.criar,
  obterRevisao: m.obter,
  listarRevisoes: m.listar,
  renomearRevisao: m.renomear,
  excluirRevisao: m.excluir,
  adicionarApoio: m.apoio,
  criarVinculo: m.vincular,
  desfazerVinculo: m.desfazer,
}));
const colecao = await import("./route");
const uma = await import("./[id]/route");
const apoio = await import("./[id]/apoio/route");
const vinculos = await import("./[id]/vinculos/route");
const desfazer = await import("./[id]/vinculos/[vinculoId]/desfazer/route");
const { RazaoInvalido } = await import("@/lib/contabil-core/conciliacao/razaoTipos");

// As rotas da revisão manual da conciliação: permissão (ver para ler, agir para alterar), a empresa
// conferida, o hash do arquivo, os códigos de erro do serviço e a auditoria que ele monta.

const EMPRESA = "00000000-0000-4000-8000-000000000001";
const AGENCIA = "00000000-0000-4000-8000-000000000002";
const REVISAO_ID = "00000000-0000-4000-8000-000000000003";
const VINCULO_ID = "00000000-0000-4000-8000-000000000004";
const LINHA = "00000000-0000-4000-8000-000000000005";
const TRANSACAO = "00000000-0000-4000-8000-000000000006";
const RAZAO = { contaCodigo: "2699", cnpj: null };
const RELATORIO = {
  resumo: { empresa: "Empresa A", periodoInicio: "2026-09-01", periodoFim: "2026-09-30" },
  pendencias: [{ tipo: "SO_RAZAO", razao: [{ data: "2026-09-02", valor: "-10.00", historico: "x", lote: "1", contrapartida: "" }], extrato: [], diferenca: "-10.00", sispagFaltando: [], composicoes: [] }],
};
const REVISAO = { id: REVISAO_ID, agenciaId: AGENCIA, versao: 2, relatorio: RELATORIO, vinculos: [] };
const AUDITORIA = { acao: "contabil.core.conciliacao.revisao.criada", dados: { agenciaId: AGENCIA, arquivo: "razao.xlsx" } };
const escrita = (acao: string, dados: Record<string, unknown> = {}) => ({ ok: true, valor: { revisao: REVISAO, auditoria: { acao, dados } } });
const params = (p: Record<string, string> = {}) => ({ params: Promise.resolve({ id: REVISAO_ID, vinculoId: VINCULO_ID, ...p }) });
const URL_BASE = "http://connect/api/contabil-core/conciliacao/revisoes";

function formulario(campos: Record<string, string | File | null>, url = URL_BASE) {
  const form = new FormData();
  for (const [k, v] of Object.entries(campos)) if (v !== null) form.set(k, v);
  return new NextRequest(url, { method: "POST", body: form });
}
const criacao = (campos: Record<string, string | File | null> = {}) =>
  formulario({ empresa: EMPRESA, agencia: AGENCIA, arquivo: new File(["razao"], "razao.xlsx"), ...campos });
const json = (method: string, corpo: unknown, url = `${URL_BASE}/${REVISAO_ID}`) =>
  new NextRequest(url, { method, body: typeof corpo === "string" ? corpo : JSON.stringify(corpo), headers: { "Content-Type": "application/json" } });
const lista = (q: string) => new NextRequest(`${URL_BASE}?${q}`);

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = { tenantId: "t1", userId: "u1" };
  m.pode.mockResolvedValue(true);
  m.lerRazao.mockResolvedValue(RAZAO);
  m.lerApoio.mockResolvedValue({ contas: [] });
  m.lerSispag.mockReturnValue({ conta: "", cnpj: "", pagamentos: [] });
  m.criar.mockResolvedValue({ ok: true, valor: { revisao: REVISAO, auditoria: AUDITORIA } });
  m.obter.mockResolvedValue({ ok: true, valor: REVISAO });
  m.listar.mockResolvedValue({ ok: true, valor: { itens: [], total: 0, pagina: 1, porPagina: 50 } });
  m.renomear.mockResolvedValue(escrita("contabil.core.conciliacao.revisao.renomeada", { titulo: "Setembro" }));
  m.excluir.mockResolvedValue({ ok: true, valor: { revisao: null, auditoria: { acao: "contabil.core.conciliacao.revisao.excluida", dados: {} } } });
  m.apoio.mockResolvedValue(escrita("contabil.core.conciliacao.apoio.adicionado", { arquivo: "fgts.xlsx" }));
  m.vincular.mockResolvedValue(escrita("contabil.core.conciliacao.vinculo.confirmado"));
  m.desfazer.mockResolvedValue(escrita("contabil.core.conciliacao.vinculo.desfeito"));
});

describe("lista das revisões salvas", () => {
  it("quem só lê o módulo lista, paginado e com filtro de conta", async () => {
    const r = await colecao.GET(lista(`empresa=${EMPRESA.toUpperCase()}&agencia=${AGENCIA}&pagina=2&porPagina=10`));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, lista: { itens: [], total: 0, pagina: 1, porPagina: 50 } });
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "ver");
    expect(m.listar).toHaveBeenCalledWith("t1", EMPRESA, AGENCIA, 2, 10);
    await colecao.GET(lista(`empresa=${EMPRESA}`));
    expect(m.listar).toHaveBeenLastCalledWith("t1", EMPRESA, null, 1, 50);
  });

  it("consulta malformada é recusada antes do serviço", async () => {
    for (const q of ["empresa=x", `empresa=${EMPRESA}&agencia=x`, `empresa=${EMPRESA}&pagina=0`, `empresa=${EMPRESA}&porPagina=101`, `empresa=${EMPRESA}&pagina=1.5`]) {
      expect((await colecao.GET(lista(q))).status).toBe(400);
    }
    m.pode.mockResolvedValueOnce(false);
    expect((await colecao.GET(lista(`empresa=${EMPRESA}`))).status).toBe(403);
    expect(m.listar).not.toHaveBeenCalled();
  });
});

describe("salvar a análise para revisão", () => {
  it("lê o Razão, guarda o SHA-256 dos bytes e devolve a revisão com as somas da tela", async () => {
    const r = await colecao.POST(criacao({ confirmarEmpresa: "true" }));
    expect(r.status).toBe(200);
    const corpo = await r.json();
    expect(corpo.revisao).toEqual(REVISAO);
    expect(corpo.somas).toEqual([{ totalExtrato: "0", totalRazao: "-10.00", composicoes: [] }]);
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "agir");
    expect(m.criar).toHaveBeenCalledWith("t1", "u1", EMPRESA, {
      agenciaId: AGENCIA,
      razao: RAZAO,
      nomeArquivo: "razao.xlsx",
      hashArquivo: createHash("sha256").update("razao").digest("hex"),
      sispag: null,
      hashSispag: null,
      confirmarEmpresa: true,
    });
    expect(m.audit).toHaveBeenCalledWith({
      tenantId: "t1",
      userId: "u1",
      action: "contabil.core.conciliacao.revisao.criada",
      entityType: "CoreConciliacaoRevisao",
      entityId: REVISAO_ID,
      metadata: AUDITORIA.dados,
    });
    expect(JSON.stringify(m.audit.mock.calls[0][0].metadata)).not.toContain("Empresa A");
  });

  it("o SISPAG vem com o hash dele; campo vazio é como se não viesse", async () => {
    await colecao.POST(criacao({ sispag: new File([], "") }));
    expect(m.lerSispag).not.toHaveBeenCalled();
    await colecao.POST(criacao({ sispag: new File(["sispag"], "sispag.xls") }));
    expect(m.criar).toHaveBeenLastCalledWith(
      "t1",
      "u1",
      EMPRESA,
      expect.objectContaining({ sispag: { conta: "", cnpj: "", pagamentos: [] }, hashSispag: createHash("sha256").update("sispag").digest("hex"), confirmarEmpresa: false }),
    );
  });

  it("a mesma análise já salva volta sem auditoria nova", async () => {
    m.criar.mockResolvedValueOnce({ ok: true, valor: { revisao: REVISAO, auditoria: null } });
    expect((await colecao.POST(criacao())).status).toBe(200);
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("Razão sem CNPJ pede confirmação da empresa pelo código", async () => {
    m.criar.mockResolvedValueOnce({ ok: false, erro: "Confirme a empresa.", codigo: "CONFIRMAR_EMPRESA" });
    const r = await colecao.POST(criacao());
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "Confirme a empresa.", codigo: "CONFIRMAR_EMPRESA" });
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("sem login, sem permissão de operar ou com entrada malformada, nada é lido", async () => {
    m.ctx = { tenantId: null, userId: null };
    expect((await colecao.POST(criacao())).status).toBe(401);
    m.ctx = { tenantId: "t1", userId: "u1" };
    m.pode.mockResolvedValueOnce(false);
    expect((await colecao.POST(criacao())).status).toBe(403);
    const malformados: Record<string, string | File | null>[] = [{ empresa: "x" }, { agencia: "" }, { arquivo: null }, { arquivo: new File([], "vazio.xlsx") }];
    for (const campos of malformados) {
      expect((await colecao.POST(criacao(campos))).status).toBe(400);
    }
    expect(m.lerRazao).not.toHaveBeenCalled();
    expect(m.criar).not.toHaveBeenCalled();
  });

  it("Razão inválido vira 400 com a mensagem do leitor; erro inesperado não vaza", async () => {
    m.lerRazao.mockRejectedValueOnce(new RazaoInvalido("O razão traz mais de uma conta."));
    const r1 = await colecao.POST(criacao());
    expect(r1.status).toBe(400);
    expect((await r1.json()).error).toBe("O razão traz mais de uma conta.");
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    m.lerRazao.mockRejectedValueOnce(new Error("segredo do arquivo na linha 3"));
    const r2 = await colecao.POST(criacao());
    expect(r2.status).toBe(500);
    expect(JSON.stringify(await r2.json())).not.toContain("segredo");
    expect(JSON.stringify(erro.mock.calls)).not.toContain("segredo");
    erro.mockRestore();
    expect(m.criar).not.toHaveBeenCalled();
  });
});

describe("uma revisão: abrir, renomear e excluir", () => {
  it("abre com permissão de leitura; inexistente é 404 com o código", async () => {
    const r = await uma.GET(new NextRequest(`${URL_BASE}/${REVISAO_ID}?empresa=${EMPRESA}`), params());
    expect(r.status).toBe(200);
    expect((await r.json()).revisao).toEqual(REVISAO);
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "ver");
    expect(m.obter).toHaveBeenCalledWith("t1", EMPRESA, REVISAO_ID);
    m.obter.mockResolvedValueOnce({ ok: false, erro: "Revisão de conciliação não encontrada nesta empresa.", codigo: "NAO_ENCONTRADA" });
    const r2 = await uma.GET(new NextRequest(`${URL_BASE}/${REVISAO_ID}?empresa=${EMPRESA}`), params());
    expect(r2.status).toBe(404);
    expect((await r2.json()).codigo).toBe("NAO_ENCONTRADA");
    expect((await uma.GET(new NextRequest(`${URL_BASE}/x?empresa=${EMPRESA}`), params({ id: "x" }))).status).toBe(404);
    expect((await uma.GET(new NextRequest(`${URL_BASE}/${REVISAO_ID}`), params())).status).toBe(400);
  });

  it("renomeia só o título, com a versão; versão velha é 409", async () => {
    const r = await uma.PATCH(json("PATCH", { empresa: EMPRESA, versao: 2, titulo: "  Setembro  " }), params());
    expect(r.status).toBe(200);
    expect(m.renomear).toHaveBeenCalledWith("t1", "u1", EMPRESA, REVISAO_ID, { versao: 2, titulo: "Setembro" });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "contabil.core.conciliacao.revisao.renomeada", entityId: REVISAO_ID }));
    m.renomear.mockResolvedValueOnce({ ok: false, erro: "Outra pessoa alterou esta revisão.", codigo: "VERSAO_DESATUALIZADA" });
    const r2 = await uma.PATCH(json("PATCH", { empresa: EMPRESA, versao: 1, titulo: "Setembro" }), params());
    expect(r2.status).toBe(409);
    expect((await r2.json()).codigo).toBe("VERSAO_DESATUALIZADA");
  });

  it("renomear recusa campo a mais, título vazio, corpo que não é JSON e quem só lê", async () => {
    const malformados: unknown[] = [
      { empresa: EMPRESA, versao: 2, titulo: "x", agenciaId: AGENCIA },
      { empresa: EMPRESA, versao: 2, titulo: "   " },
      { empresa: EMPRESA, versao: 0, titulo: "x" },
      { versao: 2, titulo: "x" },
      "não é json",
    ];
    for (const corpo of malformados) expect((await uma.PATCH(json("PATCH", corpo), params())).status).toBe(400);
    m.pode.mockResolvedValueOnce(false);
    expect((await uma.PATCH(json("PATCH", { empresa: EMPRESA, versao: 2, titulo: "x" }), params())).status).toBe(403);
    expect(m.renomear).not.toHaveBeenCalled();
  });

  it("exclui com a versão e registra; a revisão pode não voltar", async () => {
    const r = await uma.DELETE(json("DELETE", { empresa: EMPRESA, versao: 2 }), params());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(m.excluir).toHaveBeenCalledWith("t1", "u1", EMPRESA, REVISAO_ID, 2);
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "contabil.core.conciliacao.revisao.excluida", entityType: "CoreConciliacaoRevisao" }));
    expect((await uma.DELETE(json("DELETE", { empresa: EMPRESA }), params())).status).toBe(400);
    expect((await uma.DELETE(json("DELETE", { empresa: EMPRESA, versao: 2, motivo: "x" }), params())).status).toBe(400);
  });
});

describe("Razão de apoio", () => {
  const envio = (campos: Record<string, string | File | null> = {}) =>
    formulario({ empresa: EMPRESA, versao: "2", arquivo: new File(["apoio"], "fgts.xlsx"), ...campos }, `${URL_BASE}/${REVISAO_ID}/apoio`);

  it("confere a revisão antes de ler o arquivo, e lê com a versão e a confirmação", async () => {
    const r = await apoio.POST(envio({ confirmarEmpresa: "true" }), params());
    expect(r.status).toBe(200);
    expect(m.obter.mock.invocationCallOrder[0]).toBeLessThan(m.lerApoio.mock.invocationCallOrder[0]);
    expect(m.lerApoio).toHaveBeenCalledWith(expect.any(Uint8Array), "fgts.xlsx");
    expect(m.apoio).toHaveBeenCalledWith("t1", "u1", EMPRESA, REVISAO_ID, { razao: { contas: [] }, nomeArquivo: "fgts.xlsx", versao: 2, confirmarEmpresa: true });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "contabil.core.conciliacao.apoio.adicionado", metadata: { arquivo: "fgts.xlsx" } }));
  });

  it("revisão de outra empresa não chega ao leitor", async () => {
    m.obter.mockResolvedValueOnce({ ok: false, erro: "Revisão de conciliação não encontrada nesta empresa.", codigo: "NAO_ENCONTRADA" });
    expect((await apoio.POST(envio(), params())).status).toBe(404);
    expect(m.lerApoio).not.toHaveBeenCalled();
  });

  it("versão ausente, arquivo vazio ou apoio inválido são 400; sem CNPJ pede confirmação", async () => {
    const malformados: Record<string, string | File | null>[] = [{ versao: null }, { versao: "0" }, { arquivo: new File([], "v.xlsx") }];
    for (const campos of malformados) expect((await apoio.POST(envio(campos), params())).status).toBe(400);
    m.lerApoio.mockRejectedValueOnce(new RazaoInvalido("Não é um Razão."));
    const r = await apoio.POST(envio(), params());
    expect((await r.json()).error).toBe("Não é um Razão.");
    m.apoio.mockResolvedValueOnce({ ok: false, erro: "Confirme a empresa.", codigo: "CONFIRMAR_EMPRESA" });
    const r2 = await apoio.POST(envio(), params());
    expect(r2.status).toBe(400);
    expect((await r2.json()).codigo).toBe("CONFIRMAR_EMPRESA");
  });
});

describe("conferências manuais", () => {
  const vinculo = { empresa: EMPRESA, versao: 2, extratoIds: [TRANSACAO], razaoItens: [{ linhaId: LINHA, dc: "C" }], observacao: "  ok  " };

  it("registra a conferência validada e devolve a revisão nova", async () => {
    const r = await vinculos.POST(json("POST", vinculo, `${URL_BASE}/${REVISAO_ID}/vinculos`), params());
    expect(r.status).toBe(200);
    expect(m.vincular).toHaveBeenCalledWith("t1", "u1", EMPRESA, REVISAO_ID, { versao: 2, extratoIds: [TRANSACAO], razaoItens: [{ linhaId: LINHA, dc: "C" }], observacao: "ok" });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "contabil.core.conciliacao.vinculo.confirmado" }));
  });

  it("seleção vazia, D/C inválido ou id malformado são recusados; conflito e fonte alterada são 409", async () => {
    for (const corpo of [{ ...vinculo, extratoIds: [] }, { ...vinculo, razaoItens: [{ linhaId: LINHA, dc: "X" }] }, { ...vinculo, extratoIds: ["x"] }]) {
      expect((await vinculos.POST(json("POST", corpo), params())).status).toBe(400);
    }
    expect(m.vincular).not.toHaveBeenCalled();
    for (const codigo of ["CONFLITO", "FONTE_ALTERADA", "VERSAO_DESATUALIZADA"]) {
      m.vincular.mockResolvedValueOnce({ ok: false, erro: "Atualize a tela.", codigo });
      const r = await vinculos.POST(json("POST", vinculo), params());
      expect(r.status).toBe(409);
      expect((await r.json()).codigo).toBe(codigo);
    }
    m.vincular.mockResolvedValueOnce({ ok: false, erro: "Explique a diferença na observação." });
    expect((await vinculos.POST(json("POST", vinculo), params())).status).toBe(400);
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("desfazer pede motivo e registra", async () => {
    const url = `${URL_BASE}/${REVISAO_ID}/vinculos/${VINCULO_ID}/desfazer`;
    expect((await desfazer.POST(json("POST", { empresa: EMPRESA, versao: 2, motivo: "   " }, url), params())).status).toBe(400);
    expect((await desfazer.POST(json("POST", { empresa: EMPRESA, versao: 2, motivo: "x" }, url), params({ vinculoId: "x" }))).status).toBe(404);
    expect(m.desfazer).not.toHaveBeenCalled();
    const r = await desfazer.POST(json("POST", { empresa: EMPRESA, versao: 2, motivo: " lançado em dobro " }, url), params());
    expect(r.status).toBe(200);
    expect(m.desfazer).toHaveBeenCalledWith("t1", "u1", EMPRESA, REVISAO_ID, VINCULO_ID, { versao: 2, motivo: "lançado em dobro" });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "contabil.core.conciliacao.vinculo.desfeito", entityId: REVISAO_ID }));
  });
});
