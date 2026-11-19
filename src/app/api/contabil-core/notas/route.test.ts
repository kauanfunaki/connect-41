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
  importar: vi.fn(),
  associar: vi.fn(),
  desassociar: vi.fn(),
  cancelar: vi.fn(),
  transacoes: vi.fn(),
}));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/audit", () => ({ logAudit: m.audit }));
vi.mock("@/lib/contabil-core/servidor/notas", () => ({
  ACOES_DAS_NOTAS: {
    criada: "contabil.core.nota.criada",
    importadas: "contabil.core.notas.importadas",
    associada: "contabil.core.nota.associada",
    desassociada: "contabil.core.nota.desassociada",
    cancelada: "contabil.core.nota.cancelada",
  },
  listarNotas: m.listar,
  obterNota: m.obter,
  criarNota: m.criar,
  importarArquivo: m.importar,
  associarNota: m.associar,
  desassociarNota: m.desassociar,
  cancelarNota: m.cancelar,
  transacoesParaAssociar: m.transacoes,
}));
const colecao = await import("./route");
const importar = await import("./importar/route");
const transacoes = await import("./transacoes/route");
const uma = await import("./[id]/route");
const associar = await import("./[id]/associar/route");
const cancelar = await import("./[id]/cancelar/route");
const { ACOES_AUDITADAS_NA_ROTA } = await import("@/lib/contabil-core/notas/rotaDasNotas");

// As rotas das notas fiscais: permissão (ver para ler, agir para alterar), a empresa e a nota
// conferidas, a consulta da lista, o upload com limite, os códigos de erro do serviço e a auditoria.

const EMPRESA = "00000000-0000-4000-8000-000000000001";
const NOTA_ID = "00000000-0000-4000-8000-000000000002";
const TRANSACAO = "00000000-0000-4000-8000-000000000003";
const NOTA = { id: NOTA_ID, numero: "1", status: "pendente" };
const URL_BASE = "http://connect/api/contabil-core/notas";
const params = { params: Promise.resolve({ id: NOTA_ID }) };
const escrita = (acao: string, dados: Record<string, unknown> = {}) => ({ ok: true, valor: { nota: NOTA, auditoria: { acao, dados } } });
const json = (method: string, corpo: unknown, url = `${URL_BASE}/${NOTA_ID}`) =>
  new NextRequest(url, { method, body: typeof corpo === "string" ? corpo : JSON.stringify(corpo), headers: { "Content-Type": "application/json" } });
function envio(campos: Record<string, string | File | null>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(campos)) if (v !== null) form.set(k, v);
  return new NextRequest(`${URL_BASE}/importar`, { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = { tenantId: "t1", userId: "u1" };
  m.pode.mockResolvedValue(true);
  m.listar.mockResolvedValue({ ok: true, valor: { itens: [], total: 0, pagina: 1, porPagina: 50 } });
  m.obter.mockResolvedValue({ ok: true, valor: NOTA });
  m.criar.mockResolvedValue(escrita("contabil.core.nota.criada", { nome: "1" }));
  m.importar.mockResolvedValue({
    ok: true,
    valor: {
      resultado: { importadas: 1, duplicadas: 1, erros: ["b.xml: XML malformado."], notas: [NOTA_ID] },
      mensagem: "1 nota(s) importada(s), 1 duplicada(s) ignorada(s).",
      auditoria: { acao: "contabil.core.notas.importadas", dados: { nome: "a.zip", importadas: 1 } },
    },
  });
  m.associar.mockResolvedValue(escrita("contabil.core.nota.associada"));
  m.desassociar.mockResolvedValue(escrita("contabil.core.nota.desassociada"));
  m.cancelar.mockResolvedValue(escrita("contabil.core.nota.cancelada"));
  m.transacoes.mockResolvedValue({ ok: true, valor: [] });
});

describe("lista", () => {
  it("quem só lê lista, com os filtros, a página (50 por padrão, como o original) e sem cache", async () => {
    const q = `empresa=${EMPRESA.toUpperCase()}&tipo=nfe&status=pendente&numero=12&chave=3526&cnpj=12.345&emitente=sao&de=2026-03-01&ate=2026-03-31&pagina=2&porPagina=20`;
    const r = await colecao.GET(new NextRequest(`${URL_BASE}?${q}`));
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "ver");
    const [tenant, empresa, filtros, pagina, porPagina] = m.listar.mock.calls[0];
    expect([tenant, empresa, pagina, porPagina]).toEqual(["t1", EMPRESA, 2, 20]);
    expect(filtros).toMatchObject({ tipo: "nfe", status: "pendente", numero: "12", chaveAcesso: "3526", cnpj: "12.345", emitente: "sao" });
    // O dia inteiro no fuso do escritório.
    expect(filtros.dataDe.toISOString()).toBe("2026-03-01T03:00:00.000Z");
    expect(filtros.dataAte.toISOString()).toBe("2026-04-01T02:59:59.999Z");
    await colecao.GET(new NextRequest(`${URL_BASE}?empresa=${EMPRESA}`));
    expect(m.listar.mock.calls[1].slice(3)).toEqual([1, 50]);
  });

  it("consulta malformada, quem não pode ver e quem não entrou são recusados antes do serviço", async () => {
    for (const q of ["empresa=x", `empresa=${EMPRESA}&pagina=0`, `empresa=${EMPRESA}&porPagina=201`, `empresa=${EMPRESA}&de=ontem`, `empresa=${EMPRESA}&ate=2026-02-30`]) {
      expect((await colecao.GET(new NextRequest(`${URL_BASE}?${q}`))).status).toBe(400);
    }
    m.pode.mockResolvedValueOnce(false);
    expect((await colecao.GET(new NextRequest(`${URL_BASE}?empresa=${EMPRESA}`))).status).toBe(403);
    m.ctx = { tenantId: null, userId: null };
    expect((await colecao.GET(new NextRequest(`${URL_BASE}?empresa=${EMPRESA}`))).status).toBe(401);
    expect(m.listar).not.toHaveBeenCalled();
  });

  it("a empresa de outro escritório é 'não encontrada', e o erro inesperado não vaza", async () => {
    m.listar.mockResolvedValueOnce({ ok: false, erro: "Empresa não encontrada no Contábil Core.", codigo: "NAO_ENCONTRADA" });
    expect((await colecao.GET(new NextRequest(`${URL_BASE}?empresa=${EMPRESA}`))).status).toBe(404);
    const espiao = vi.spyOn(console, "error").mockImplementation(() => {});
    m.listar.mockRejectedValueOnce(new Error("SELECT * FROM core_notas_fiscais com o CNPJ 12.345.678/0001-95"));
    const r = await colecao.GET(new NextRequest(`${URL_BASE}?empresa=${EMPRESA}`));
    expect(r.status).toBe(500);
    const corpo = JSON.stringify(await r.json());
    expect(corpo).not.toContain("SELECT");
    expect(JSON.stringify(espiao.mock.calls)).not.toContain("12.345.678");
    espiao.mockRestore();
  });

  it("uma nota: ver, id conferido", async () => {
    const r = await uma.GET(new NextRequest(`${URL_BASE}/${NOTA_ID}?empresa=${EMPRESA}`), params);
    expect(await r.json()).toEqual({ ok: true, nota: NOTA });
    expect((await uma.GET(new NextRequest(`${URL_BASE}/x?empresa=${EMPRESA}`), { params: Promise.resolve({ id: "x" }) })).status).toBe(404);
  });
});

describe("cadastro à mão", () => {
  it("pede agir, aceita os nomes do original e audita na rota", async () => {
    const r = await colecao.POST(json("POST", { empresa: EMPRESA, tipo: "nfe", numero: "1", cnpj_emitente: "x", valor: 10, dataEmissao: "2026-03-05" }, URL_BASE));
    expect(r.status).toBe(200);
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "agir");
    expect(m.criar).toHaveBeenCalledWith("t1", "u1", EMPRESA, expect.objectContaining({ tipo: "nfe", numero: "1", cnpjEmitente: "x", valor: 10, dataEmissao: "2026-03-05" }));
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "contabil.core.nota.criada", entityType: "CoreNotaFiscal", entityId: NOTA_ID }));
  });

  it("recusas: validação 400, duplicada 409, sem auditoria", async () => {
    m.criar.mockResolvedValueOnce({ ok: false, erro: "Chave de acesso deve ter 44 dígitos.", codigo: "INVALIDA" });
    expect((await colecao.POST(json("POST", { empresa: EMPRESA }, URL_BASE))).status).toBe(400);
    m.criar.mockResolvedValueOnce({ ok: false, erro: "Esta nota fiscal já foi cadastrada nesta empresa.", codigo: "CONFLITO" });
    const r = await colecao.POST(json("POST", { empresa: EMPRESA }, URL_BASE));
    expect(r.status).toBe(409);
    expect((await r.json()).error).toBe("Esta nota fiscal já foi cadastrada nesta empresa.");
    expect((await colecao.POST(json("POST", "não é json", URL_BASE))).status).toBe(400);
    expect(m.audit).not.toHaveBeenCalled();
  });
});

describe("importação", () => {
  it("um arquivo por envio; devolve importadas, duplicadas, erros e a mensagem do original, e audita", async () => {
    const r = await importar.POST(envio({ empresa: EMPRESA, arquivo: new File(["<x/>"], "a.zip") }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      ok: true,
      importacao: { importadas: 1, duplicadas: 1, erros: ["b.xml: XML malformado."], mensagem: "1 nota(s) importada(s), 1 duplicada(s) ignorada(s)." },
    });
    const [, , empresa, arquivo] = m.importar.mock.calls[0];
    expect(empresa).toBe(EMPRESA);
    expect(arquivo.nome).toBe("a.zip");
    expect(new TextDecoder().decode(arquivo.conteudo)).toBe("<x/>");
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "contabil.core.notas.importadas", entityType: "CoreEmpresa", entityId: EMPRESA }));
  });

  it("sem nota importada não audita; sem arquivo, sem empresa, grande demais ou sem permissão, recusa", async () => {
    m.importar.mockResolvedValueOnce({ ok: true, valor: { resultado: { importadas: 0, duplicadas: 1, erros: [], notas: [] }, mensagem: "", auditoria: null } });
    expect((await importar.POST(envio({ empresa: EMPRESA, arquivo: new File(["x"], "a.xml") }))).status).toBe(200);
    expect(m.audit).not.toHaveBeenCalled();
    expect((await importar.POST(envio({ empresa: EMPRESA, arquivo: null }))).status).toBe(400);
    expect((await importar.POST(envio({ empresa: EMPRESA, arquivo: new File([], "a.xml") }))).status).toBe(400);
    expect((await importar.POST(envio({ empresa: "x", arquivo: new File(["x"], "a.xml") }))).status).toBe(400);
    const grande = new File([new Uint8Array(25 * 1024 * 1024 + 1)], "a.pdf");
    const r = await importar.POST(envio({ empresa: EMPRESA, arquivo: grande }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toBe("O arquivo passa de 25 MB.");
    m.pode.mockResolvedValueOnce(false);
    expect((await importar.POST(envio({ empresa: EMPRESA, arquivo: new File(["x"], "a.xml") }))).status).toBe(403);
    expect(m.importar).toHaveBeenCalledTimes(1);
  });

  it("erro inesperado (a IA fora do ar, o banco) vira 500 sem detalhe", async () => {
    const espiao = vi.spyOn(console, "error").mockImplementation(() => {});
    m.importar.mockRejectedValueOnce(new Error("chave sk-123 recusada"));
    const r = await importar.POST(envio({ empresa: EMPRESA, arquivo: new File(["x"], "a.pdf") }));
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("sk-123");
    espiao.mockRestore();
  });
});

describe("associar, desassociar e cancelar", () => {
  it("associa com a transação conferida e audita", async () => {
    const r = await associar.POST(json("POST", { empresa: EMPRESA, transacaoId: TRANSACAO.toUpperCase() }), params);
    expect(r.status).toBe(200);
    expect(m.associar).toHaveBeenCalledWith("t1", EMPRESA, NOTA_ID, TRANSACAO);
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "contabil.core.nota.associada", entityId: NOTA_ID }));
    expect((await associar.POST(json("POST", { empresa: EMPRESA, transacaoId: "x" }), params)).status).toBe(400);
  });

  it("os códigos do serviço: cancelada 400, já associada 409, transação de fora 404", async () => {
    for (const [codigo, status] of [["INVALIDA", 400], ["CONFLITO", 409], ["NAO_ENCONTRADA", 404]] as const) {
      m.associar.mockResolvedValueOnce({ ok: false, erro: "x", codigo });
      expect((await associar.POST(json("POST", { empresa: EMPRESA, transacao_id: TRANSACAO }), params)).status).toBe(status);
    }
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("desassocia pelo DELETE e cancela, auditando", async () => {
    expect((await associar.DELETE(json("DELETE", { empresa: EMPRESA }), params)).status).toBe(200);
    expect(m.desassociar).toHaveBeenCalledWith("t1", EMPRESA, NOTA_ID);
    expect((await cancelar.POST(json("POST", { empresa: EMPRESA }), params)).status).toBe(200);
    expect(m.cancelar).toHaveBeenCalledWith("t1", EMPRESA, NOTA_ID);
    expect(m.audit.mock.calls.map((c) => c[0].action)).toEqual(["contabil.core.nota.desassociada", "contabil.core.nota.cancelada"]);
  });

  it("quem só lê não altera", async () => {
    m.pode.mockResolvedValue(false);
    expect((await associar.POST(json("POST", { empresa: EMPRESA, transacaoId: TRANSACAO }), params)).status).toBe(403);
    expect((await associar.DELETE(json("DELETE", { empresa: EMPRESA }), params)).status).toBe(403);
    expect((await cancelar.POST(json("POST", { empresa: EMPRESA }), params)).status).toBe(403);
    expect((await transacoes.GET(new NextRequest(`${URL_BASE}/transacoes?empresa=${EMPRESA}`))).status).toBe(403);
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "agir");
  });

  it("as transações pendentes para associar, com a busca", async () => {
    const r = await transacoes.GET(new NextRequest(`${URL_BASE}/transacoes?empresa=${EMPRESA}&busca=%20pagto%20`));
    expect(await r.json()).toEqual({ ok: true, transacoes: [] });
    expect(m.transacoes).toHaveBeenCalledWith("t1", EMPRESA, "pagto");
  });
});

it("as ações auditadas na rota são as do serviço (`ACOES_DAS_NOTAS`, lido do arquivo)", () => {
  const fonte = readFileSync(path.join(process.cwd(), "src/lib/contabil-core/servidor/notas.ts"), "utf8");
  const bloco = fonte.match(/export const ACOES_DAS_NOTAS = \{([\s\S]*?)\}/)![1];
  const doServico = [...bloco.matchAll(/"(contabil\.core\.[a-z.]+)"/g)].map((x) => x[1]);
  expect(doServico).toHaveLength(5);
  expect([...ACOES_AUDITADAS_NA_ROTA].sort()).toEqual(doServico.sort());
});
