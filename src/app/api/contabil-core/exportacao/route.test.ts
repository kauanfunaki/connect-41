import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1" } as { tenantId: string | null; userId: string | null },
  pode: vi.fn(),
  audit: vi.fn(),
  gerar: vi.fn(),
}));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/audit", () => ({ logAudit: m.audit }));
vi.mock("@/lib/contabil-core/servidor/exportacao", () => ({ gerarExportacao: m.gerar }));
const rota = await import("./route");

// A rota das exportações (Fase 2 e Fase D1): permissão de operar ("agir", o `exportacao.execute` do
// original), a empresa conferida, os filtros repassados ao serviço, o arquivo devolvido e a auditoria.

const EMPRESA = "00000000-0000-4000-8000-000000000001";
const AGENCIA = "00000000-0000-4000-8000-000000000002";
const URL_BASE = "http://connect/api/contabil-core/exportacao";
const get = (q: string) => rota.GET(new NextRequest(`${URL_BASE}?${q}`));

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = { tenantId: "t1", userId: "u1" };
  m.pode.mockResolvedValue(true);
  m.gerar.mockResolvedValue({
    ok: true,
    valor: { nome: "lancamentos-dominio-12345678000195-2026-03.txt", conteudo: "﻿01/03/2026;1;2\r\n", tipo: "text/plain; charset=utf-8", linhas: 1, avisos: ["Contas sem código reduzido (o Domínio não as importa): 1.1.B.x (Banco)."], exportacao: "lancamentos_importacao" },
  });
});

describe("exportação", () => {
  it("sem tipo é o arquivo do Domínio, como na Fase 2; o arquivo vem para baixar, sem cache, com os avisos no cabeçalho", async () => {
    const r = await get(`empresa=${EMPRESA.toUpperCase()}&mes=2026-03&formato=txt&historicoExtrato=1`);
    expect(r.status).toBe(200);
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "agir");
    const [tenant, user, empresa, f] = m.gerar.mock.calls[0];
    expect([tenant, user, empresa]).toEqual(["t1", "u1", EMPRESA]);
    expect(f).toMatchObject({ tipo: "lancamentos_importacao", formato: "txt", mes: "2026-03", usarHistoricoExtrato: true, incluirContasInativas: false, agenciaId: null });
    expect(r.headers.get("Content-Disposition")).toBe('attachment; filename="lancamentos-dominio-12345678000195-2026-03.txt"');
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(decodeURIComponent(r.headers.get("X-Avisos") ?? "")).toContain("1.1.B.x (Banco)");
    // O texto vai como veio do serviço, com o BOM do UTF-8 (o `text()` o tiraria).
    expect(new TextDecoder("utf-8", { ignoreBOM: true }).decode(await r.arrayBuffer())).toBe("﻿01/03/2026;1;2\r\n");
    expect(m.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1", userId: "u1", action: "contabil.core.exportacao.gerada", entityType: "CoreEmpresa", entityId: EMPRESA,
        metadata: { nome: "lancamentos-dominio-12345678000195-2026-03.txt", tipo: "lancamentos_importacao", linhas: 1, formato: "txt", mes: "2026-03" },
      }),
    );
  });

  it("o extrato leva os filtros da tela e pode sair sem competência; a planilha volta em bytes", async () => {
    const bytes = new Uint8Array([0x50, 0x4b, 3, 4]);
    m.gerar.mockResolvedValueOnce({ ok: true, valor: { nome: "extrato-1.xlsx", conteudo: bytes, tipo: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", linhas: 3, avisos: [], exportacao: "extrato" } });
    const r = await get(`empresa=${EMPRESA}&tipo=extrato&formato=xlsx&agencia=${AGENCIA}&status=pendente&busca=%20tarifa%20&dc=D&valorMin=10.50&valorMax=900`);
    expect(r.status).toBe(200);
    expect(m.gerar.mock.calls[0][3]).toMatchObject({ tipo: "extrato", formato: "xlsx", mes: null, agenciaId: AGENCIA, status: "pendente", busca: "tarifa", dc: "D", valorMin: "10.50", valorMax: "900" });
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(bytes);
    expect(r.headers.get("Content-Type")).toContain("spreadsheetml");
  });

  it("consulta malformada, quem não pode operar e quem não entrou são recusados antes do serviço", async () => {
    for (const q of [
      "empresa=x&mes=2026-03&formato=csv",
      `empresa=${EMPRESA}&mes=2026-13&formato=csv`,
      `empresa=${EMPRESA}&formato=csv&tipo=conferencia`,
      `empresa=${EMPRESA}&mes=2026-03&formato=csv&tipo=extrato&dc=x`,
      `empresa=${EMPRESA}&mes=2026-03&formato=csv&tipo=extrato&valorMin=-1`,
      `empresa=${EMPRESA}&mes=2026-03&formato=csv&agencia=nao-e-uuid`,
    ]) {
      expect((await get(q)).status, q).toBe(400);
    }
    m.pode.mockResolvedValueOnce(false);
    expect((await get(`empresa=${EMPRESA}&mes=2026-03&formato=csv`)).status).toBe(403);
    m.ctx = { tenantId: null, userId: null };
    expect((await get(`empresa=${EMPRESA}&mes=2026-03&formato=csv`)).status).toBe(401);
    expect(m.gerar).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("a recusa do serviço (empresa de outro escritório, formato, CNPJ inválido) volta com a frase e sem auditoria", async () => {
    m.gerar.mockResolvedValueOnce({ ok: false, erro: "Empresa não encontrada no Contábil Core." });
    const r = await get(`empresa=${EMPRESA}&mes=2026-03&formato=csv&tipo=nfe_entrada`);
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "Empresa não encontrada no Contábil Core." });
    m.gerar.mockResolvedValueOnce({ ok: false, erro: "O formato 'txt' só está disponível para 'lancamentos_importacao' por enquanto." });
    expect((await get(`empresa=${EMPRESA}&mes=2026-03&formato=txt&tipo=conferencia`)).status).toBe(400);
    expect(m.audit).not.toHaveBeenCalled();
  });
});
