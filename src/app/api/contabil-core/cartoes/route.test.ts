import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1" } as { tenantId: string | null; userId: string | null },
  pode: vi.fn(),
  audit: vi.fn(),
  after: vi.fn(),
  listarCartoes: vi.fn(),
  criarCartao: vi.fn(),
  removerCartao: vi.fn(),
  associarPagamento: vi.fn(),
  importarCsv: vi.fn(),
  importarPdf: vi.fn(),
  obterDistribuicao: vi.fn(),
  aplicarDistribuicao: vi.fn(),
  adicionarDocumento: vi.fn(),
  processarDocumento: vi.fn(),
  arquivoDoDocumento: vi.fn(),
}));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/audit", () => ({ logAudit: m.audit }));
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), after: m.after }));
vi.mock("@/lib/contabil-core/servidor/cartoes", () => ({
  listarCartoes: m.listarCartoes,
  criarCartao: m.criarCartao,
  removerCartao: m.removerCartao,
  associarPagamento: m.associarPagamento,
  importarCsv: m.importarCsv,
  importarPdf: m.importarPdf,
}));
vi.mock("@/lib/contabil-core/servidor/faturas", () => ({
  obterDistribuicao: m.obterDistribuicao,
  aplicarDistribuicao: m.aplicarDistribuicao,
  adicionarDocumento: m.adicionarDocumento,
  processarDocumento: m.processarDocumento,
  arquivoDoDocumento: m.arquivoDoDocumento,
}));
const colecao = await import("./route");
const umCartao = await import("./[cartaoId]/route");
const pagamento = await import("./[cartaoId]/faturas/[faturaId]/pagamento/route");
const importar = await import("./[cartaoId]/faturas/[faturaId]/lancamentos/importar/route");
const distribuicao = await import("./[cartaoId]/faturas/[faturaId]/distribuicao/route");
const aplicar = await import("./[cartaoId]/faturas/[faturaId]/distribuicao/aplicar/route");
const documentos = await import("./[cartaoId]/faturas/[faturaId]/documentos/route");
const arquivo = await import("./[cartaoId]/faturas/[faturaId]/documentos/[documentoId]/arquivo/route");
const { ACOES_AUDITADAS_NA_ROTA } = await import("@/lib/contabil-core/cartoes/rotaDosCartoes");

// As rotas dos cartões (Fase C3): permissão (ver para ler, agir para alterar), a empresa e os ids do caminho
// conferidos, o corpo com os nomes do original, os códigos do serviço (404, 409, 422), a leitura do PDF depois
// da resposta, o download e a auditoria (as ações da rota são as do serviço).

const EMPRESA = "00000000-0000-4000-8000-000000000001";
const CARTAO = "00000000-0000-4000-8000-000000000002";
const FATURA = "00000000-0000-4000-8000-000000000003";
const TRANSACAO = "00000000-0000-4000-8000-000000000004";
const DOCUMENTO = "00000000-0000-4000-8000-000000000005";
const BASE = "http://connect/api/contabil-core/cartoes";
const naFatura = { params: Promise.resolve({ cartaoId: CARTAO, faturaId: FATURA }) };
const noDocumento = { params: Promise.resolve({ cartaoId: CARTAO, faturaId: FATURA, documentoId: DOCUMENTO }) };
const auditoria = (acao: string) => ({ entidade: "CoreFaturaCartao", entidadeId: FATURA, acao, dados: { fatura_id: FATURA } });
const json = (method: string, corpo: unknown, url = BASE) => new NextRequest(url, { method, body: JSON.stringify(corpo), headers: { "Content-Type": "application/json" } });
function envio(url: string, campos: Record<string, string | File>) {
  const form = new FormData();
  for (const [k, v] of Object.entries(campos)) form.set(k, v);
  return new NextRequest(url, { method: "POST", body: form });
}

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = { tenantId: "t1", userId: "u1" };
  m.pode.mockResolvedValue(true);
  m.listarCartoes.mockResolvedValue({ ok: true, valor: [] });
  m.criarCartao.mockResolvedValue({ ok: true, valor: { valor: { id: CARTAO }, auditoria: [{ ...auditoria("contabil.core.cartao.criado"), entidade: "CoreCartaoCredito", entidadeId: CARTAO }] } });
  m.removerCartao.mockResolvedValue({ ok: false, erro: "Cartão possui 1 fatura(s) em aberto. Quite-as antes de remover.", codigo: "CONFLITO" });
  m.associarPagamento.mockResolvedValue({ ok: true, valor: { valor: { id: FATURA, status: "paga" }, auditoria: [auditoria("contabil.core.fatura.paga")] } });
  m.importarCsv.mockResolvedValue({ ok: true, valor: { valor: { importados: 1, duplicados: 0, erros: [] }, auditoria: [auditoria("contabil.core.fatura.lancamentos.importados")] } });
  m.importarPdf.mockResolvedValue({ ok: false, erro: "Arquivo PDF inválido: PDF sem páginas.", codigo: "INVALIDA" });
  m.obterDistribuicao.mockResolvedValue({ ok: true, valor: { versao: 0, itens: [] } });
  m.aplicarDistribuicao.mockResolvedValue({
    ok: true,
    valor: { valor: { versao: 2 }, auditoria: [{ entidade: "CoreTransacao", entidadeId: TRANSACAO, acao: "contabil.core.composicao.alterada", dados: {} }, auditoria("contabil.core.fatura.distribuicao.aplicada")] },
  });
  m.adicionarDocumento.mockResolvedValue({ ok: true, valor: { valor: { id: DOCUMENTO, status: "processando" }, auditoria: [auditoria("contabil.core.fatura.documento.adicionado")] } });
  m.arquivoDoDocumento.mockResolvedValue({ ok: true, valor: Buffer.from("%PDF-1.4") });
});

it("sem sessão é 401; sem permissão é 403 (ver para ler, agir para alterar)", async () => {
  m.ctx = { tenantId: null, userId: null };
  expect((await colecao.GET(new NextRequest(`${BASE}?empresa=${EMPRESA}`))).status).toBe(401);
  m.ctx = { tenantId: "t1", userId: "u1" };
  m.pode.mockImplementation(async (_c: unknown, _m: string, nivel: string) => nivel === "ver");
  expect((await colecao.GET(new NextRequest(`${BASE}?empresa=${EMPRESA}`))).status).toBe(200);
  expect((await colecao.POST(json("POST", { empresa: EMPRESA, nome: "Cartão" }))).status).toBe(403);
  expect(m.criarCartao).not.toHaveBeenCalled();
});

it("a empresa e os ids do caminho são conferidos antes do serviço", async () => {
  expect((await colecao.GET(new NextRequest(`${BASE}?empresa=nada`))).status).toBe(400);
  const r = await umCartao.DELETE(new NextRequest(`${BASE}/x?empresa=${EMPRESA}`, { method: "DELETE" }), { params: Promise.resolve({ cartaoId: "x" }) });
  expect(r.status).toBe(404);
  expect(m.removerCartao).not.toHaveBeenCalled();
});

it("o cadastro aceita os nomes do original e audita", async () => {
  const r = await colecao.POST(json("POST", { empresa: EMPRESA, nome: "Cartão", bandeira: "visa", dia_fechamento: 5, dia_vencimento: 12, ultimos_digitos: "1234" }));
  expect(r.status).toBe(201);
  expect(m.criarCartao).toHaveBeenCalledWith("t1", EMPRESA, expect.objectContaining({ diaFechamento: 5, diaVencimento: 12, ultimosDigitos: "1234" }));
  expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "contabil.core.cartao.criado", entityType: "CoreCartaoCredito", entityId: CARTAO }));
});

it("as recusas do serviço viram 409 e 422, com a frase", async () => {
  const r = await umCartao.DELETE(new NextRequest(`${BASE}/${CARTAO}?empresa=${EMPRESA}`, { method: "DELETE" }), { params: Promise.resolve({ cartaoId: CARTAO }) });
  expect(r.status).toBe(409);
  expect((await r.json()).error).toContain("em aberto");
  const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "fatura.pdf", { type: "application/pdf" });
  const p = await importar.POST(envio(`${BASE}/${CARTAO}/faturas/${FATURA}/lancamentos/importar`, { empresa: EMPRESA, arquivo: pdf }), naFatura);
  expect(p.status).toBe(422);
  expect(m.importarPdf).toHaveBeenCalled();
  expect(m.audit).not.toHaveBeenCalled();
});

it("o arquivo que não é PDF vai para o CSV", async () => {
  const csv = new File(["data,descricao,valor\n01/01/2026,X,1,00\n"], "fatura.csv", { type: "text/csv" });
  const r = await importar.POST(envio(`${BASE}/${CARTAO}/faturas/${FATURA}/lancamentos/importar`, { empresa: EMPRESA, arquivo: csv }), naFatura);
  expect(r.status).toBe(200);
  expect((await r.json()).importacao).toEqual({ importados: 1, duplicados: 0, erros: [] });
  expect(m.importarCsv).toHaveBeenCalled();
});

it("o pagamento precisa de uma transação (UUID) e audita a fatura paga", async () => {
  expect((await pagamento.POST(json("POST", { empresa: EMPRESA, transacao_id: "x" }), naFatura)).status).toBe(422);
  const r = await pagamento.POST(json("POST", { empresa: EMPRESA, transacao_id: TRANSACAO }), naFatura);
  expect(r.status).toBe(200);
  expect(m.associarPagamento).toHaveBeenCalledWith("t1", EMPRESA, CARTAO, FATURA, TRANSACAO);
  expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "contabil.core.fatura.paga", entityType: "CoreFaturaCartao" }));
});

it("a distribuição: ler pede ver; aplicar audita a composição do NEO e a distribuição, nessa ordem", async () => {
  m.pode.mockImplementation(async (_c: unknown, _m: string, nivel: string) => nivel === "ver");
  expect((await distribuicao.GET(new NextRequest(`${BASE}/${CARTAO}/faturas/${FATURA}/distribuicao?empresa=${EMPRESA}`), naFatura)).status).toBe(200);
  expect((await aplicar.POST(json("POST", { empresa: EMPRESA }), naFatura)).status).toBe(403);
  m.pode.mockResolvedValue(true);
  const r = await aplicar.POST(json("POST", { empresa: EMPRESA, versao: 1, classificacao_hash: "a".repeat(64), motivo: "Fatura" }), naFatura);
  expect(r.status).toBe(200);
  expect(m.aplicarDistribuicao).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", empresaId: EMPRESA, cartaoId: CARTAO, faturaId: FATURA, userId: "u1" }), expect.objectContaining({ classificacaoHash: "a".repeat(64) }));
  expect(m.audit.mock.calls.map((c) => c[0].action)).toEqual(["contabil.core.composicao.alterada", "contabil.core.fatura.distribuicao.aplicada"]);
});

it("o PDF do documento: 202 e a leitura agendada para depois da resposta", async () => {
  const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "fatura.pdf", { type: "application/pdf" });
  const r = await documentos.POST(envio(`${BASE}/${CARTAO}/faturas/${FATURA}/documentos`, { empresa: EMPRESA, arquivo: pdf }), naFatura);
  expect(r.status).toBe(202);
  expect(m.after).toHaveBeenCalledTimes(1);
  expect(m.processarDocumento).not.toHaveBeenCalled();
  await m.after.mock.calls[0][0]();
  expect(m.processarDocumento).toHaveBeenCalledWith(DOCUMENTO, "u1");
});

it("o download vai como anexo, sem cache e com nosniff", async () => {
  const r = await arquivo.GET(new NextRequest(`${BASE}/${CARTAO}/faturas/${FATURA}/documentos/${DOCUMENTO}/arquivo?empresa=${EMPRESA}`), noDocumento);
  expect(r.status).toBe(200);
  expect(r.headers.get("Content-Type")).toBe("application/pdf");
  expect(r.headers.get("Content-Disposition")).toBe("attachment; filename=fatura.pdf");
  expect(r.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(r.headers.get("Cache-Control")).toBe("private, no-store");
});

it("as ações auditadas na rota são as do serviço (lidas dos arquivos) e estão no catálogo da auditoria", () => {
  const raiz = path.join(__dirname, "..", "..", "..", "..", "lib");
  const acoes = (arquivo: string, constante: string) => {
    const fonte = readFileSync(path.join(raiz, "contabil-core", "servidor", arquivo), "utf8");
    return [...fonte.match(new RegExp(`export const ${constante} = \\{([\\s\\S]*?)\\} as const`))![1].matchAll(/"(contabil\.core\.[^"]+)"/g)].map((x) => x[1]);
  };
  const doServico = [...new Set([...acoes("cartoes.ts", "ACOES_DOS_CARTOES"), ...acoes("faturas.ts", "ACOES_DAS_FATURAS")])];
  expect([...ACOES_AUDITADAS_NA_ROTA].sort()).toEqual(doServico.sort());
  const catalogo = readFileSync(path.join(raiz, "auditoria", "acoes.ts"), "utf8");
  for (const a of doServico) expect(catalogo).toContain(`"${a}"`);
});
