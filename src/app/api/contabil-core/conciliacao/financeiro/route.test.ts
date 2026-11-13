import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1" } as { tenantId: string | null; userId: string | null },
  pode: vi.fn(),
  audit: vi.fn(),
  criar: vi.fn(),
  listar: vi.fn(),
  obter: vi.fn(),
  renomear: vi.fn(),
  excluir: vi.fn(),
  documento: vi.fn(),
  original: vi.fn(),
  sugestoes: vi.fn(),
  vincular: vi.fn(),
  lote: vi.fn(),
  desfazer: vi.fn(),
}));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/audit", () => ({ logAudit: m.audit }));
vi.mock("@/lib/contabil-core/servidor/financeiro", () => ({
  criarAnalise: m.criar,
  listarAnalises: m.listar,
  obterAnalise: m.obter,
  renomearAnalise: m.renomear,
  excluirAnalise: m.excluir,
  adicionarDocumento: m.documento,
  originalDoDocumento: m.original,
  sugestoesDaAnalise: m.sugestoes,
  vincular: m.vincular,
  vincularSugestoes: m.lote,
  desfazerVinculoFinanceiro: m.desfazer,
}));
const colecao = await import("./route");
const uma = await import("./[id]/route");
const documentos = await import("./[id]/documentos/route");
const arquivo = await import("./[id]/documentos/[fonteId]/arquivo/route");
const sugestoes = await import("./[id]/sugestoes/route");
const vinculos = await import("./[id]/vinculos/route");
const lote = await import("./[id]/vinculos/sugestoes/route");
const desfazer = await import("./[id]/vinculos/[vinculoId]/desfazer/route");
const { RazaoInvalido } = await import("@/lib/contabil-core/conciliacao/razaoTipos");
const { SispagInvalido } = await import("@/lib/contabil-core/conciliacao/sispag");
const { ACOES_AUDITADAS_NA_ROTA } = await import("@/lib/contabil-core/conciliacao/rotaDoFinanceiro");

// As rotas da conferência do financeiro: permissão (ver para ler, agir para alterar), a empresa
// conferida, a validação dos corpos, os códigos de erro do serviço, o download e a auditoria.

const EMPRESA = "00000000-0000-4000-8000-000000000001";
const AGENCIA = "00000000-0000-4000-8000-000000000002";
const ANALISE_ID = "00000000-0000-4000-8000-000000000003";
const VINCULO_ID = "00000000-0000-4000-8000-000000000004";
const FONTE_ID = "00000000-0000-4000-8000-000000000005";
const F1 = "00000000-0000-4000-8000-000000000006";
const E1 = "00000000-0000-4000-8000-000000000007";
const ANALISE = { id: ANALISE_ID, agenciaId: AGENCIA, versao: 2, titulo: "Setembro", fontes: [], linhas: [], titulosAbertos: [], vinculos: [], avisos: [], extratoValido: true };
const escrita = (acao: string, dados: Record<string, unknown> = {}) => ({ ok: true, valor: { analise: ANALISE, auditoria: { acao, dados } } });
const params = (p: Record<string, string> = {}) => ({ params: Promise.resolve({ id: ANALISE_ID, vinculoId: VINCULO_ID, fonteId: FONTE_ID, ...p }) });
const URL_BASE = "http://connect/api/contabil-core/conciliacao/financeiro";

const json = (method: string, corpo: unknown, url = `${URL_BASE}/${ANALISE_ID}`) =>
  new NextRequest(url, { method, body: typeof corpo === "string" ? corpo : JSON.stringify(corpo), headers: { "Content-Type": "application/json" } });
const get = (url: string) => new NextRequest(url);
function formulario(campos: Record<string, string | File | null>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(campos)) if (v !== null) form.set(k, v);
  return new NextRequest(`${URL_BASE}/${ANALISE_ID}/documentos`, { method: "POST", body: form });
}
const envio = (campos: Record<string, string | File | null> = {}) =>
  formulario({ empresa: EMPRESA, versao: "2", tipo: "FINANCEIRO", arquivo: new File(["pagamentos"], "pagamentos.xlsx", { type: "application/vnd.ms-excel" }), ...campos });

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = { tenantId: "t1", userId: "u1" };
  m.pode.mockResolvedValue(true);
  m.criar.mockResolvedValue(escrita("contabil.core.financeiro.analise.criada", { agenciaId: AGENCIA }));
  m.listar.mockResolvedValue({ ok: true, valor: { itens: [], total: 0, pagina: 1, porPagina: 20 } });
  m.obter.mockResolvedValue({ ok: true, valor: ANALISE });
  m.renomear.mockResolvedValue(escrita("contabil.core.financeiro.analise.renomeada"));
  m.excluir.mockResolvedValue({ ok: true, valor: { analise: null, auditoria: { acao: "contabil.core.financeiro.analise.excluida", dados: { exclusaoLogica: true } } } });
  m.documento.mockResolvedValue(escrita("contabil.core.financeiro.documento.adicionado", { fonteId: FONTE_ID, tipo: "FINANCEIRO" }));
  m.original.mockResolvedValue({ ok: true, valor: { nome: "Relatório \"set\"\r\n ção.pdf", mediaType: "application/pdf", bytes: new Uint8Array([37, 80, 68, 70]) } });
  m.sugestoes.mockResolvedValue({ ok: true, valor: { versao: 2, tipoComparacao: "EXTRATO", itens: [], avisos: [] } });
  m.vincular.mockResolvedValue(escrita("contabil.core.financeiro.vinculo.confirmado"));
  m.lote.mockResolvedValue(escrita("contabil.core.financeiro.vinculos.confirmados", { vinculos: [] }));
  m.desfazer.mockResolvedValue(escrita("contabil.core.financeiro.vinculo.desfeito"));
});

describe("lista e criação das análises", () => {
  it("quem só lê lista, paginado (20 por página, como o original) e com filtro de conta", async () => {
    const r = await colecao.GET(get(`${URL_BASE}?empresa=${EMPRESA.toUpperCase()}&agencia=${AGENCIA}&pagina=2&porPagina=10`));
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(await r.json()).toEqual({ ok: true, lista: { itens: [], total: 0, pagina: 1, porPagina: 20 } });
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "ver");
    expect(m.listar).toHaveBeenCalledWith("t1", EMPRESA, AGENCIA, 2, 10);
    await colecao.GET(get(`${URL_BASE}?empresa=${EMPRESA}`));
    expect(m.listar).toHaveBeenLastCalledWith("t1", EMPRESA, null, 1, 20);
  });

  it("consulta malformada e quem não pode ver são recusados antes do serviço", async () => {
    for (const q of ["empresa=x", `empresa=${EMPRESA}&agencia=x`, `empresa=${EMPRESA}&pagina=0`, `empresa=${EMPRESA}&porPagina=101`]) {
      expect((await colecao.GET(get(`${URL_BASE}?${q}`))).status).toBe(400);
    }
    m.pode.mockResolvedValueOnce(false);
    expect((await colecao.GET(get(`${URL_BASE}?empresa=${EMPRESA}`))).status).toBe(403);
    m.ctx = { tenantId: null, userId: null };
    expect((await colecao.GET(get(`${URL_BASE}?empresa=${EMPRESA}`))).status).toBe(401);
    expect(m.listar).not.toHaveBeenCalled();
  });

  it("cria com conta, período e título validados, e audita na rota", async () => {
    const r = await colecao.POST(json("POST", { empresa: EMPRESA, agenciaId: AGENCIA, periodoInicio: "2026-09-01", periodoFim: "2026-09-30", titulo: "  Setembro  " }, URL_BASE));
    expect(r.status).toBe(200);
    expect((await r.json()).analise).toEqual(ANALISE);
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "agir");
    expect(m.criar).toHaveBeenCalledWith("t1", "u1", EMPRESA, { agenciaId: AGENCIA, periodoInicio: "2026-09-01", periodoFim: "2026-09-30", titulo: "Setembro" });
    expect(m.audit).toHaveBeenCalledWith({
      tenantId: "t1",
      userId: "u1",
      action: "contabil.core.financeiro.analise.criada",
      entityType: "CoreFinanceiroAnalise",
      entityId: ANALISE_ID,
      metadata: { agenciaId: AGENCIA },
    });
  });

  it("período invertido, data inexistente, conta inválida, sem empresa ou quem só lê: nada é criado", async () => {
    const certo = { empresa: EMPRESA, agenciaId: AGENCIA, periodoInicio: "2026-09-01", periodoFim: "2026-09-30" };
    const malformados: unknown[] = [
      { ...certo, periodoFim: "2026-08-31" },
      { ...certo, periodoInicio: "2026-02-30" },
      { ...certo, agenciaId: "x" },
      { ...certo, empresa: undefined },
      "não é json",
    ];
    for (const corpo of malformados) expect((await colecao.POST(json("POST", corpo, URL_BASE))).status).toBe(400);
    m.pode.mockResolvedValueOnce(false);
    expect((await colecao.POST(json("POST", certo, URL_BASE))).status).toBe(403);
    expect(m.criar).not.toHaveBeenCalled();
  });

  it("conta de outra empresa vira 404 pelo código; erro inesperado não vaza", async () => {
    m.criar.mockResolvedValueOnce({ ok: false, erro: "Conta bancária ativa não encontrada nesta empresa.", codigo: "NAO_ENCONTRADA" });
    const corpo = { empresa: EMPRESA, agenciaId: AGENCIA, periodoInicio: "2026-09-01", periodoFim: "2026-09-30" };
    expect((await colecao.POST(json("POST", corpo, URL_BASE))).status).toBe(404);
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    m.criar.mockRejectedValueOnce(new Error("segredo do banco"));
    const r = await colecao.POST(json("POST", corpo, URL_BASE));
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("segredo");
    expect(JSON.stringify(erro.mock.calls)).not.toContain("segredo");
    erro.mockRestore();
    expect(m.audit).not.toHaveBeenCalled();
  });
});

describe("uma análise: abrir, renomear e excluir", () => {
  it("abre com permissão de leitura; inexistente é 404 com o código", async () => {
    const r = await uma.GET(get(`${URL_BASE}/${ANALISE_ID}?empresa=${EMPRESA}`), params());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, analise: ANALISE });
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "ver");
    expect(m.obter).toHaveBeenCalledWith("t1", EMPRESA, ANALISE_ID);
    m.obter.mockResolvedValueOnce({ ok: false, erro: "Análise do financeiro não encontrada nesta empresa.", codigo: "NAO_ENCONTRADA" });
    expect((await uma.GET(get(`${URL_BASE}/${ANALISE_ID}?empresa=${EMPRESA}`), params())).status).toBe(404);
    expect((await uma.GET(get(`${URL_BASE}/x?empresa=${EMPRESA}`), params({ id: "x" }))).status).toBe(404);
    expect((await uma.GET(get(`${URL_BASE}/${ANALISE_ID}`), params())).status).toBe(400);
  });

  it("renomeia só o título, com a versão; campo a mais é recusado; versão velha é 409", async () => {
    const r = await uma.PATCH(json("PATCH", { empresa: EMPRESA, versao: 2, titulo: "  Outubro " }), params());
    expect(r.status).toBe(200);
    expect(m.renomear).toHaveBeenCalledWith("t1", "u1", EMPRESA, ANALISE_ID, { versao: 2, titulo: "Outubro" });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "contabil.core.financeiro.analise.renomeada", entityId: ANALISE_ID }));
    expect((await uma.PATCH(json("PATCH", { empresa: EMPRESA, versao: 2, titulo: "x", periodoFim: "2026-10-31" }), params())).status).toBe(400);
    m.renomear.mockResolvedValueOnce({ ok: false, erro: "Outra pessoa alterou esta análise.", codigo: "VERSAO_DESATUALIZADA" });
    const r2 = await uma.PATCH(json("PATCH", { empresa: EMPRESA, versao: 1, titulo: "x" }), params());
    expect(r2.status).toBe(409);
    expect((await r2.json()).codigo).toBe("VERSAO_DESATUALIZADA");
  });

  it("exclui com a versão (exclusão lógica) e registra", async () => {
    const r = await uma.DELETE(json("DELETE", { empresa: EMPRESA, versao: 2 }), params());
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(m.excluir).toHaveBeenCalledWith("t1", "u1", EMPRESA, ANALISE_ID, 2);
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "contabil.core.financeiro.analise.excluida", entityType: "CoreFinanceiroAnalise" }));
    expect((await uma.DELETE(json("DELETE", { empresa: EMPRESA }), params())).status).toBe(400);
    m.pode.mockResolvedValueOnce(false);
    expect((await uma.DELETE(json("DELETE", { empresa: EMPRESA, versao: 2 }), params())).status).toBe(403);
  });
});

describe("documentos", () => {
  it("confere a análise antes de ler o arquivo e manda os bytes, o tipo, a versão e a confirmação", async () => {
    const r = await documentos.POST(envio({ confirmarEmpresa: "true" }), params());
    expect(r.status).toBe(200);
    expect(m.obter.mock.invocationCallOrder[0]).toBeLessThan(m.documento.mock.invocationCallOrder[0]);
    expect(m.documento).toHaveBeenCalledWith("t1", "u1", EMPRESA, ANALISE_ID, {
      tipo: "FINANCEIRO",
      conteudo: new Uint8Array(Buffer.from("pagamentos")),
      nomeArquivo: "pagamentos.xlsx",
      mediaType: "application/vnd.ms-excel",
      versao: 2,
      confirmarEmpresa: true,
    });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "contabil.core.financeiro.documento.adicionado", metadata: { fonteId: FONTE_ID, tipo: "FINANCEIRO" } }));
  });

  it("análise de outra empresa não chega ao serviço de leitura", async () => {
    m.obter.mockResolvedValueOnce({ ok: false, erro: "Análise do financeiro não encontrada nesta empresa.", codigo: "NAO_ENCONTRADA" });
    expect((await documentos.POST(envio(), params())).status).toBe(404);
    expect(m.documento).not.toHaveBeenCalled();
  });

  it("versão, tipo (o Extrato não se envia) ou arquivo faltando são 400; quem só lê, 403", async () => {
    const malformados: Record<string, string | File | null>[] = [
      { versao: null },
      { versao: "0" },
      { tipo: "EXTRATO" },
      { tipo: "financeiro" },
      { tipo: null },
      { arquivo: null },
      { arquivo: new File([], "vazio.xlsx") },
      { empresa: "x" },
    ];
    for (const campos of malformados) expect((await documentos.POST(envio(campos), params())).status).toBe(400);
    m.pode.mockResolvedValueOnce(false);
    expect((await documentos.POST(envio(), params())).status).toBe(403);
    expect(m.documento).not.toHaveBeenCalled();
  });

  it("documento recusado pelo leitor vira 400 com a mensagem dele; sem CNPJ pede confirmação; repetido é 409", async () => {
    m.documento.mockRejectedValueOnce(new SispagInvalido("A consulta não é do Itaú."));
    const r = await documentos.POST(envio({ tipo: "SISPAG" }), params());
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("A consulta não é do Itaú.");
    m.documento.mockRejectedValueOnce(new RazaoInvalido("O razão traz mais de uma conta."));
    expect((await documentos.POST(envio({ tipo: "RAZAO" }), params())).status).toBe(400);
    const recusado = new Error("Layout do financeiro não reconhecido.");
    recusado.name = "FinanceiroInvalido";
    m.documento.mockRejectedValueOnce(recusado);
    expect((await (await documentos.POST(envio(), params())).json()).error).toBe("Layout do financeiro não reconhecido.");
    m.documento.mockResolvedValueOnce({ ok: false, erro: "Confirme a empresa.", codigo: "CONFIRMAR_EMPRESA" });
    const r2 = await documentos.POST(envio(), params());
    expect(r2.status).toBe(400);
    expect((await r2.json()).codigo).toBe("CONFIRMAR_EMPRESA");
    m.documento.mockResolvedValueOnce({ ok: false, erro: "Este arquivo já foi adicionado à análise.", codigo: "CONFLITO" });
    expect((await documentos.POST(envio(), params())).status).toBe(409);
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    m.documento.mockRejectedValueOnce(new Error("conteúdo da linha 7"));
    const r3 = await documentos.POST(envio(), params());
    expect(r3.status).toBe(500);
    expect(JSON.stringify(await r3.json())).not.toContain("linha 7");
    erro.mockRestore();
    expect(m.audit).not.toHaveBeenCalled();
  });
});

describe("baixar o original", () => {
  const url = `${URL_BASE}/${ANALISE_ID}/documentos/${FONTE_ID}/arquivo?empresa=${EMPRESA}`;

  it("sempre como anexo, com o nome sem quebrar o cabeçalho, nosniff e sem cache", async () => {
    const r = await arquivo.GET(get(url), params());
    expect(r.status).toBe(200);
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "ver");
    expect(m.original).toHaveBeenCalledWith("t1", EMPRESA, ANALISE_ID, FONTE_ID);
    expect(r.headers.get("Content-Type")).toBe("application/pdf");
    const disposicao = r.headers.get("Content-Disposition") ?? "";
    expect(disposicao.startsWith("attachment; ")).toBe(true);
    expect(disposicao).not.toMatch(/[\r\n]/);
    expect(disposicao).toContain(`filename="Relatorio _set___ cao.pdf"`);
    expect(disposicao).toContain("filename*=UTF-8''Relat%C3%B3rio%20%22set%22%0D%0A%20%C3%A7%C3%A3o.pdf");
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(r.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it("tipo guardado fora dos formatos aceitos sai como bytes genéricos", async () => {
    m.original.mockResolvedValueOnce({ ok: true, valor: { nome: "x.html", mediaType: "text/html", bytes: new Uint8Array([60]) } });
    expect((await arquivo.GET(get(url), params())).headers.get("Content-Type")).toBe("application/octet-stream");
  });

  it("documento de outra análise é 404; id malformado nem chega ao serviço", async () => {
    m.original.mockResolvedValueOnce({ ok: false, erro: "Arquivo original não encontrado nesta análise.", codigo: "NAO_ENCONTRADA" });
    expect((await arquivo.GET(get(url), params())).status).toBe(404);
    expect((await arquivo.GET(get(url), params({ fonteId: "x" }))).status).toBe(404);
    expect((await arquivo.GET(get(`${URL_BASE}/${ANALISE_ID}/documentos/${FONTE_ID}/arquivo`), params())).status).toBe(400);
    expect(m.original).toHaveBeenCalledTimes(1);
  });
});

describe("sugestões", () => {
  it("lê com permissão de leitura e o tipo da comparação", async () => {
    const r = await sugestoes.GET(get(`${URL_BASE}/${ANALISE_ID}/sugestoes?empresa=${EMPRESA}&tipo=RAZAO_SISPAG`), params());
    expect(r.status).toBe(200);
    expect((await r.json()).sugestoes).toEqual({ versao: 2, tipoComparacao: "EXTRATO", itens: [], avisos: [] });
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "ver");
    expect(m.sugestoes).toHaveBeenCalledWith("t1", EMPRESA, ANALISE_ID, "RAZAO_SISPAG");
  });

  it("tipo inválido é 400; extrato mudado é 409", async () => {
    for (const q of [`empresa=${EMPRESA}`, `empresa=${EMPRESA}&tipo=extrato`, `empresa=${EMPRESA}&tipo=EXTRATO_DETALHADO`]) {
      expect((await sugestoes.GET(get(`${URL_BASE}/${ANALISE_ID}/sugestoes?${q}`), params())).status).toBe(400);
    }
    m.sugestoes.mockResolvedValueOnce({ ok: false, erro: "O extrato mudou.", codigo: "EXTRATO_ALTERADO" });
    const r = await sugestoes.GET(get(`${URL_BASE}/${ANALISE_ID}/sugestoes?empresa=${EMPRESA}&tipo=EXTRATO`), params());
    expect(r.status).toBe(409);
    expect((await r.json()).codigo).toBe("EXTRATO_ALTERADO");
  });
});

describe("conferências", () => {
  const vinculo = { empresa: EMPRESA, versao: 2, financeiroIds: [F1], comparacaoIds: [E1], observacao: "  ok  " };

  it("registra a conferência validada e devolve a análise nova", async () => {
    const r = await vinculos.POST(json("POST", vinculo, `${URL_BASE}/${ANALISE_ID}/vinculos`), params());
    expect(r.status).toBe(200);
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "agir");
    expect(m.vincular).toHaveBeenCalledWith("t1", "u1", EMPRESA, ANALISE_ID, { versao: 2, sugestaoId: null, financeiroIds: [F1], comparacaoIds: [E1], observacao: "ok" });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "contabil.core.financeiro.vinculo.confirmado", entityId: ANALISE_ID }));
  });

  it("lado vazio ou id malformado são recusados; conflito e extrato mudado são 409", async () => {
    for (const corpo of [{ ...vinculo, financeiroIds: [] }, { ...vinculo, comparacaoIds: ["x"] }, { ...vinculo, versao: 0 }]) {
      expect((await vinculos.POST(json("POST", corpo), params())).status).toBe(400);
    }
    expect(m.vincular).not.toHaveBeenCalled();
    for (const codigo of ["CONFLITO", "EXTRATO_ALTERADO", "VERSAO_DESATUALIZADA"]) {
      m.vincular.mockResolvedValueOnce({ ok: false, erro: "Atualize a tela.", codigo });
      expect((await vinculos.POST(json("POST", vinculo), params())).status).toBe(409);
    }
    m.vincular.mockResolvedValueOnce({ ok: false, erro: "Explique a diferença na observação." });
    expect((await vinculos.POST(json("POST", vinculo), params())).status).toBe(400);
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("sugestões em lote vão juntas; repetida ou lista vazia são recusadas", async () => {
    const corpo = {
      empresa: EMPRESA,
      versao: 2,
      observacao: "",
      sugestoes: [
        { sugestaoId: "a", financeiroIds: [F1], comparacaoIds: [E1] },
        { sugestaoId: "b", financeiroIds: [E1], comparacaoIds: [F1] },
      ],
    };
    const url = `${URL_BASE}/${ANALISE_ID}/vinculos/sugestoes`;
    const r = await lote.POST(json("POST", corpo, url), params());
    expect(r.status).toBe(200);
    expect(m.lote).toHaveBeenCalledWith("t1", "u1", EMPRESA, ANALISE_ID, { versao: 2, observacao: "", sugestoes: corpo.sugestoes });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "contabil.core.financeiro.vinculos.confirmados", metadata: { vinculos: [] } }));
    expect((await lote.POST(json("POST", { ...corpo, sugestoes: [] }, url), params())).status).toBe(400);
    expect((await lote.POST(json("POST", { ...corpo, sugestoes: [corpo.sugestoes[0], corpo.sugestoes[0]] }, url), params())).status).toBe(400);
    expect(m.lote).toHaveBeenCalledTimes(1);
  });

  it("desfazer pede motivo e registra", async () => {
    const url = `${URL_BASE}/${ANALISE_ID}/vinculos/${VINCULO_ID}/desfazer`;
    expect((await desfazer.POST(json("POST", { empresa: EMPRESA, versao: 2, motivo: "   " }, url), params())).status).toBe(400);
    expect((await desfazer.POST(json("POST", { empresa: EMPRESA, versao: 2, motivo: "x" }, url), params({ vinculoId: "x" }))).status).toBe(404);
    expect(m.desfazer).not.toHaveBeenCalled();
    const r = await desfazer.POST(json("POST", { empresa: EMPRESA, versao: 2, motivo: " lançado em dobro " }, url), params());
    expect(r.status).toBe(200);
    expect(m.desfazer).toHaveBeenCalledWith("t1", "u1", EMPRESA, ANALISE_ID, VINCULO_ID, { versao: 2, motivo: "lançado em dobro" });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "contabil.core.financeiro.vinculo.desfeito", entityId: ANALISE_ID }));
    m.desfazer.mockResolvedValueOnce({ ok: false, erro: "Esta conferência já foi desfeita.", codigo: "CONFLITO" });
    expect((await desfazer.POST(json("POST", { empresa: EMPRESA, versao: 2, motivo: "x" }, url), params())).status).toBe(409);
  });
});

describe("auditoria", () => {
  it("a rota grava por extenso exatamente as ações que o serviço devolve (ACOES_DO_FINANCEIRO)", () => {
    const fonte = readFileSync(path.join(process.cwd(), "src/lib/contabil-core/servidor/financeiro.ts"), "utf8");
    const bloco = fonte.match(/export const ACOES_DO_FINANCEIRO = \{([\s\S]*?)\} as const/)?.[1] ?? "";
    const doServico = [...bloco.matchAll(/"(contabil\.core\.financeiro\.[a-z_.]+)"/g)].map((x) => x[1]);
    expect(doServico.length).toBeGreaterThan(0);
    expect([...ACOES_AUDITADAS_NA_ROTA].sort()).toEqual([...doServico].sort());
  });
});
