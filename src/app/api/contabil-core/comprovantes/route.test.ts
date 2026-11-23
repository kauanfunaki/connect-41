import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1" } as { tenantId: string | null; userId: string | null },
  pode: vi.fn(),
  audit: vi.fn(),
  listar: vi.fn(),
  obter: vi.fn(),
  criar: vi.fn(),
  extrair: vi.fn(),
  associar: vi.fn(),
  desassociar: vi.fn(),
  excluir: vi.fn(),
  arquivo: vi.fn(),
  transacoes: vi.fn(),
}));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/audit", () => ({ logAudit: m.audit }));
vi.mock("@/lib/contabil-core/servidor/comprovantes", () => ({
  listarComprovantes: m.listar,
  obterComprovante: m.obter,
  criarComprovante: m.criar,
  extrairDoArquivo: m.extrair,
  associarComprovante: m.associar,
  desassociarComprovante: m.desassociar,
  excluirComprovante: m.excluir,
  arquivoDoComprovante: m.arquivo,
}));
vi.mock("@/lib/contabil-core/servidor/notas", () => ({ transacoesParaAssociar: m.transacoes }));
const colecao = await import("./route");
const extrair = await import("./extrair/route");
const transacoes = await import("./transacoes/route");
const um = await import("./[id]/route");
const associar = await import("./[id]/associar/route");
const arquivo = await import("./[id]/arquivo/route");
const { ACOES_AUDITADAS_NA_ROTA } = await import("@/lib/contabil-core/comprovantes/rotaDosComprovantes");

// As rotas dos comprovantes de pagamento: permissão (ver para ler, agir para alterar e para ler o arquivo
// com a IA), a empresa e o comprovante conferidos, a consulta da lista, o cadastro em JSON e em
// formulário, os códigos do serviço (com os detalhes do duplicado), o download e a auditoria.

const EMPRESA = "00000000-0000-4000-8000-000000000001";
const ID = "00000000-0000-4000-8000-000000000002";
const TRANSACAO = "00000000-0000-4000-8000-000000000003";
const COMPROVANTE = { id: ID, valorPago: "1500.00", transacaoId: null };
const URL_BASE = "http://connect/api/contabil-core/comprovantes";
const params = { params: Promise.resolve({ id: ID }) };
const escrita = (acao: string, dados: Record<string, unknown> = {}) => ({ ok: true, valor: { comprovante: COMPROVANTE, auditoria: { acao, dados } } });
const json = (method: string, corpo: unknown, url = `${URL_BASE}/${ID}`) =>
  new NextRequest(url, { method, body: typeof corpo === "string" ? corpo : JSON.stringify(corpo), headers: { "Content-Type": "application/json" } });
function envio(url: string, campos: Record<string, string | File | null>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(campos)) if (v !== null) form.set(k, v);
  return new NextRequest(url, { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = { tenantId: "t1", userId: "u1" };
  m.pode.mockResolvedValue(true);
  m.listar.mockResolvedValue({ ok: true, valor: { itens: [], total: 0, pagina: 1, porPagina: 50 } });
  m.obter.mockResolvedValue({ ok: true, valor: COMPROVANTE });
  m.criar.mockResolvedValue(escrita("contabil.core.comprovante.criado", { nome: "R$ 1.500,00" }));
  m.extrair.mockResolvedValue({ ok: true, valor: { valorPago: "150.00", confianca: "regex" } });
  m.associar.mockResolvedValue(escrita("contabil.core.comprovante.associado"));
  m.desassociar.mockResolvedValue(escrita("contabil.core.comprovante.desassociado"));
  m.excluir.mockResolvedValue({ ok: true, valor: { comprovante: null, auditoria: { acao: "contabil.core.comprovante.excluido", dados: {} } } });
  m.arquivo.mockResolvedValue({ ok: true, valor: { nome: "pix ç.pdf", tipo: "application/pdf", bytes: Buffer.from("%PDF-1.4") } });
  m.transacoes.mockResolvedValue({ ok: true, valor: [] });
});

describe("lista e leitura", () => {
  it("quem só lê lista, com os filtros, a página (50 por padrão, como o original) e sem cache", async () => {
    const q = `empresa=${EMPRESA.toUpperCase()}&status=associado&agencia=${TRANSACAO}&transacao=${TRANSACAO.toUpperCase()}&pagina=2&porPagina=20`;
    const r = await colecao.GET(new NextRequest(`${URL_BASE}?${q}`));
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "ver");
    expect(m.listar).toHaveBeenCalledWith("t1", EMPRESA, { agenciaId: TRANSACAO, transacaoId: TRANSACAO, status: "associado" }, 2, 20);
    await colecao.GET(new NextRequest(`${URL_BASE}?empresa=${EMPRESA}`));
    expect(m.listar.mock.calls[1].slice(2)).toEqual([{ agenciaId: null, transacaoId: null, status: null }, 1, 50]);
  });

  it("consulta malformada, quem não pode ver e quem não entrou são recusados antes do serviço", async () => {
    for (const q of ["empresa=x", `empresa=${EMPRESA}&pagina=0`, `empresa=${EMPRESA}&porPagina=201`, `empresa=${EMPRESA}&agencia=x`, `empresa=${EMPRESA}&transacao=1`]) {
      expect((await colecao.GET(new NextRequest(`${URL_BASE}?${q}`))).status).toBe(400);
    }
    m.pode.mockResolvedValueOnce(false);
    expect((await colecao.GET(new NextRequest(`${URL_BASE}?empresa=${EMPRESA}`))).status).toBe(403);
    m.ctx = { tenantId: null, userId: null };
    expect((await colecao.GET(new NextRequest(`${URL_BASE}?empresa=${EMPRESA}`))).status).toBe(401);
    expect(m.listar).not.toHaveBeenCalled();
  });

  it("um comprovante: ver, id conferido; o erro inesperado não vaza", async () => {
    const r = await um.GET(new NextRequest(`${URL_BASE}/${ID}?empresa=${EMPRESA}`), params);
    expect(await r.json()).toEqual({ ok: true, comprovante: COMPROVANTE });
    expect((await um.GET(new NextRequest(`${URL_BASE}/x?empresa=${EMPRESA}`), { params: Promise.resolve({ id: "x" }) })).status).toBe(404);
    const espiao = vi.spyOn(console, "error").mockImplementation(() => {});
    m.obter.mockRejectedValueOnce(new Error("SELECT * FROM core_comprovantes com o CNPJ 12.345.678/0001-95"));
    const r2 = await um.GET(new NextRequest(`${URL_BASE}/${ID}?empresa=${EMPRESA}`), params);
    expect(r2.status).toBe(500);
    expect(JSON.stringify(await r2.json())).not.toContain("SELECT");
    expect(JSON.stringify(espiao.mock.calls)).not.toContain("12.345.678");
    espiao.mockRestore();
  });

  it("o arquivo: ver, na tela quando é PDF ou imagem, com nosniff e sem cache; sem arquivo, 404", async () => {
    const r = await arquivo.GET(new NextRequest(`${URL_BASE}/${ID}/arquivo?empresa=${EMPRESA}`), params);
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("application/pdf");
    expect(r.headers.get("Content-Disposition")).toBe("inline; filename*=UTF-8''pix%20%C3%A7.pdf");
    expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(r.headers.get("Cache-Control")).toBe("private, no-store");
    expect(new TextDecoder().decode(await r.arrayBuffer())).toBe("%PDF-1.4");
    m.arquivo.mockResolvedValueOnce({ ok: true, valor: { nome: "x.bin", tipo: "application/octet-stream", bytes: Buffer.from("x") } });
    expect((await arquivo.GET(new NextRequest(`${URL_BASE}/${ID}/arquivo?empresa=${EMPRESA}`), params)).headers.get("Content-Disposition")).toMatch(/^attachment;/);
    m.arquivo.mockResolvedValueOnce({ ok: false, erro: "Este comprovante não possui arquivo anexado.", codigo: "NAO_ENCONTRADA" });
    const r2 = await arquivo.GET(new NextRequest(`${URL_BASE}/${ID}/arquivo?empresa=${EMPRESA}`), params);
    expect(r2.status).toBe(404);
    expect((await r2.json()).error).toBe("Este comprovante não possui arquivo anexado.");
  });
});

describe("cadastro", () => {
  it("JSON: pede agir, aceita os nomes do original e audita na rota", async () => {
    const r = await colecao.POST(json("POST", { empresa: EMPRESA, valor_pago: 1500, favorecido: "ACME", dataPagamento: "2026-03-10", permitir_duplicado: true }, URL_BASE));
    expect(r.status).toBe(200);
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "agir");
    expect(m.criar).toHaveBeenCalledWith("t1", EMPRESA, { valorPago: 1500, favorecido: "ACME", dataPagamento: "2026-03-10", permitirDuplicado: true }, null);
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "contabil.core.comprovante.criado", entityType: "CoreComprovante", entityId: ID }));
  });

  it("formulário: os campos em `dados` e o arquivo", async () => {
    const r = await colecao.POST(envio(URL_BASE, { empresa: EMPRESA, dados: JSON.stringify({ valorPago: "10,00" }), arquivo: new File(["%PDF-1.4"], "pix.pdf", { type: "application/pdf" }) }));
    expect(r.status).toBe(200);
    const [, , campos, enviado] = m.criar.mock.calls[0];
    expect(campos).toEqual({ valorPago: "10,00" });
    expect(enviado.nome).toBe("pix.pdf");
    expect(enviado.tipo).toBe("application/pdf");
    expect(new TextDecoder().decode(enviado.conteudo)).toBe("%PDF-1.4");
    const grande = new File([new Uint8Array(25 * 1024 * 1024 + 1)], "a.pdf");
    const r2 = await colecao.POST(envio(URL_BASE, { empresa: EMPRESA, dados: "{}", arquivo: grande }));
    expect(r2.status).toBe(400);
    expect((await r2.json()).error).toBe("O arquivo passa de 25 MB.");
    expect((await colecao.POST(envio(URL_BASE, { empresa: EMPRESA, dados: "não é json" }))).status).toBe(400);
    expect((await colecao.POST(envio(URL_BASE, { empresa: "x", dados: "{}" }))).status).toBe(400);
  });

  it("recusas: validação 400; arquivo repetido e possível duplicado 409 com os detalhes; sem auditoria", async () => {
    m.criar.mockResolvedValueOnce({ ok: false, erro: "O valor pago deve ser maior que zero.", codigo: "INVALIDA" });
    expect((await colecao.POST(json("POST", { empresa: EMPRESA }, URL_BASE))).status).toBe(400);
    const detalhes = { comprovante_id: ID, favorecido: "ACME", valor_pago: "1500.00", data_pagamento: null, arquivo_nome: null, associado: false };
    for (const codigo of ["COMPROVANTE_JA_IMPORTADO", "COMPROVANTE_POSSIVEL_DUPLICADO"]) {
      m.criar.mockResolvedValueOnce({ ok: false, erro: "Já existe um comprovante de R$ 1.500,00 para ACME.", codigo, detalhes });
      const r = await colecao.POST(json("POST", { empresa: EMPRESA }, URL_BASE));
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({ error: "Já existe um comprovante de R$ 1.500,00 para ACME.", codigo, detalhes });
    }
    expect((await colecao.POST(json("POST", "não é json", URL_BASE))).status).toBe(400);
    expect(m.audit).not.toHaveBeenCalled();
  });
});

describe("ler o arquivo para pré-preencher", () => {
  it("pede agir, não audita e devolve a extração", async () => {
    const r = await extrair.POST(envio(`${URL_BASE}/extrair`, { empresa: EMPRESA, arquivo: new File(["%PDF-1.4"], "blob", { type: "application/pdf" }) }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, extracao: { valorPago: "150.00", confianca: "regex" } });
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "agir");
    expect(m.extrair.mock.calls[0][1]).toBe("u1");
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("a nota fiscal volta com o código próprio; sem arquivo e sem permissão, recusa", async () => {
    m.extrair.mockResolvedValueOnce({ ok: false, erro: "Este arquivo é uma nota fiscal…", codigo: "DOCUMENTO_NAO_E_COMPROVANTE" });
    const r = await extrair.POST(envio(`${URL_BASE}/extrair`, { empresa: EMPRESA, arquivo: new File(["x"], "nota.pdf") }));
    expect(r.status).toBe(400);
    expect((await r.json()).codigo).toBe("DOCUMENTO_NAO_E_COMPROVANTE");
    expect((await extrair.POST(envio(`${URL_BASE}/extrair`, { empresa: EMPRESA, arquivo: null }))).status).toBe(400);
    m.pode.mockResolvedValueOnce(false);
    expect((await extrair.POST(envio(`${URL_BASE}/extrair`, { empresa: EMPRESA, arquivo: new File(["x"], "a.pdf") }))).status).toBe(403);
    expect(m.extrair).toHaveBeenCalledTimes(1);
  });
});

describe("associar, desassociar e excluir", () => {
  it("associa com a transação conferida e audita; transação malformada é 400", async () => {
    const r = await associar.POST(json("POST", { empresa: EMPRESA, transacaoId: TRANSACAO.toUpperCase() }), params);
    expect(r.status).toBe(200);
    expect(m.associar).toHaveBeenCalledWith("t1", EMPRESA, ID, TRANSACAO);
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "contabil.core.comprovante.associado", entityId: ID }));
    expect((await associar.POST(json("POST", { empresa: EMPRESA, transacaoId: "x" }), params)).status).toBe(400);
  });

  it("os códigos do serviço: já associado 409, transação de fora 404", async () => {
    for (const [codigo, status] of [["CONFLITO", 409], ["NAO_ENCONTRADA", 404]] as const) {
      m.associar.mockResolvedValueOnce({ ok: false, erro: "x", codigo });
      expect((await associar.POST(json("POST", { empresa: EMPRESA, transacao_id: TRANSACAO }), params)).status).toBe(status);
    }
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("desassocia pelo DELETE e exclui, auditando", async () => {
    expect((await associar.DELETE(json("DELETE", { empresa: EMPRESA }), params)).status).toBe(200);
    expect(m.desassociar).toHaveBeenCalledWith("t1", EMPRESA, ID);
    const r = await um.DELETE(json("DELETE", { empresa: EMPRESA }), params);
    expect(await r.json()).toEqual({ ok: true });
    expect(m.excluir).toHaveBeenCalledWith("t1", EMPRESA, ID);
    expect(m.audit.mock.calls.map((c) => c[0].action)).toEqual(["contabil.core.comprovante.desassociado", "contabil.core.comprovante.excluido"]);
  });

  it("quem só lê não altera nem lista as transações para associar", async () => {
    m.pode.mockResolvedValue(false);
    expect((await associar.POST(json("POST", { empresa: EMPRESA, transacaoId: TRANSACAO }), params)).status).toBe(403);
    expect((await associar.DELETE(json("DELETE", { empresa: EMPRESA }), params)).status).toBe(403);
    expect((await um.DELETE(json("DELETE", { empresa: EMPRESA }), params)).status).toBe(403);
    expect((await transacoes.GET(new NextRequest(`${URL_BASE}/transacoes?empresa=${EMPRESA}`))).status).toBe(403);
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "agir");
  });

  it("as transações pendentes para associar, com a busca", async () => {
    const r = await transacoes.GET(new NextRequest(`${URL_BASE}/transacoes?empresa=${EMPRESA}&busca=%20pagto%20`));
    expect(await r.json()).toEqual({ ok: true, transacoes: [] });
    expect(m.transacoes).toHaveBeenCalledWith("t1", EMPRESA, "pagto");
  });
});

it("as ações auditadas na rota são as do serviço (`ACOES_DOS_COMPROVANTES`, lido do arquivo)", () => {
  const fonte = readFileSync(path.join(process.cwd(), "src/lib/contabil-core/servidor/comprovantes.ts"), "utf8");
  const bloco = fonte.match(/export const ACOES_DOS_COMPROVANTES = \{([\s\S]*?)\}/)![1];
  const doServico = [...bloco.matchAll(/"(contabil\.core\.[a-z.]+)"/g)].map((x) => x[1]);
  expect(doServico).toHaveLength(4);
  expect([...ACOES_AUDITADAS_NA_ROTA].sort()).toEqual(doServico.sort());
});
