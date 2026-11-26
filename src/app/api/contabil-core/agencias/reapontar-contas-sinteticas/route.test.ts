import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1" } as { tenantId: string | null; userId: string | null },
  pode: vi.fn(),
  audit: vi.fn(),
  reapontar: vi.fn(),
}));
vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx }));
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: m.pode }));
vi.mock("@/lib/audit", () => ({ logAudit: m.audit }));
vi.mock("@/lib/contabil-core/servidor/base", () => ({ NAO_ENCONTRADA: "Empresa não encontrada no Contábil Core." }));
vi.mock("@/lib/contabil-core/servidor/cadastros", () => ({
  ACAO_DO_REAPONTAMENTO: "contabil.core.contas_sinteticas.reapontadas",
  reapontarContasSinteticas: m.reapontar,
}));
const rota = await import("./route");
const { ACOES } = await import("@/lib/auditoria/acoes");

// A rota do reapontamento da conta sintética (Fase D0): "gerir" (o `agencias.write` do original, como as outras
// escritas de conta bancária), a empresa conferida, a auditoria só quando há o que corrigir e o erro que não vaza.

const EMPRESA = "00000000-0000-4000-8000-000000000001";
const URL = "http://connect/api/contabil-core/agencias/reapontar-contas-sinteticas";
const pedido = (corpo: unknown) => new NextRequest(URL, { method: "POST", body: typeof corpo === "string" ? corpo : JSON.stringify(corpo), headers: { "Content-Type": "application/json" } });
const ITEM = {
  agencia: "BB 1622 19530",
  contaSintetica: "1.1.B.4b2cec94746d43e8",
  registrosMovidos: 1,
  decisoesMovidas: 0,
  sinteticaDesativada: true,
  referenciasRestantes: {},
};
const AUDITORIA = { acao: "contabil.core.contas_sinteticas.reapontadas", dados: { nome: "EMPRESA EXEMPLO", contas: [{ agenciaId: "a", de: "s", para: "r", ...ITEM }] } };

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = { tenantId: "t1", userId: "u1" };
  m.pode.mockResolvedValue(true);
  m.reapontar.mockResolvedValue({ ok: true, valor: { relatorio: [ITEM], auditoria: AUDITORIA } });
});

describe("reapontar as contas sintéticas", () => {
  it("pede gerir, chama o serviço com o tenant e a empresa (em minúsculas) e devolve o relatório sem cache", async () => {
    const r = await rota.POST(pedido({ empresa: EMPRESA.toUpperCase() }));
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "gerir");
    expect(m.reapontar).toHaveBeenCalledWith("t1", EMPRESA);
    expect(await r.json()).toEqual({ ok: true, relatorio: [ITEM] });
  });

  it("audita na empresa, com a ação e os dados do serviço", async () => {
    await rota.POST(pedido({ empresa: EMPRESA }));
    expect(m.audit).toHaveBeenCalledTimes(1);
    expect(m.audit).toHaveBeenCalledWith({
      tenantId: "t1",
      userId: "u1",
      action: "contabil.core.contas_sinteticas.reapontadas",
      entityType: "CoreEmpresa",
      entityId: EMPRESA,
      metadata: AUDITORIA.dados,
    });
  });

  it("nada a corrigir: relatório vazio e nenhuma auditoria", async () => {
    m.reapontar.mockResolvedValueOnce({ ok: true, valor: { relatorio: [], auditoria: null } });
    const r = await rota.POST(pedido({ empresa: EMPRESA }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, relatorio: [] });
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("quem não entrou, quem só opera e o pedido malformado são recusados antes do serviço", async () => {
    m.pode.mockResolvedValueOnce(false);
    const sem = await rota.POST(pedido({ empresa: EMPRESA }));
    expect(sem.status).toBe(403);
    expect(m.pode).toHaveBeenCalledWith(m.ctx, "contabil_core", "gerir");
    for (const corpo of ["{", "[]", { empresa: "x" }, {}]) expect((await rota.POST(pedido(corpo))).status).toBe(400);
    m.ctx = { tenantId: null, userId: null };
    expect((await rota.POST(pedido({ empresa: EMPRESA }))).status).toBe(401);
    expect(m.reapontar).not.toHaveBeenCalled();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("a empresa de outro escritório é 'não encontrada', sem auditoria", async () => {
    m.reapontar.mockResolvedValueOnce({ ok: false, erro: "Empresa não encontrada no Contábil Core." });
    const r = await rota.POST(pedido({ empresa: EMPRESA }));
    expect(r.status).toBe(404);
    expect((await r.json()).error).toBe("Empresa não encontrada no Contábil Core.");
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("o erro inesperado não vaza a mensagem", async () => {
    const espiao = vi.spyOn(console, "error").mockImplementation(() => {});
    m.reapontar.mockRejectedValueOnce(new Error("UPDATE core_registros SET contaId = … do CNPJ 98.765.432/0001-98"));
    const r = await rota.POST(pedido({ empresa: EMPRESA }));
    expect(r.status).toBe(500);
    const corpo = JSON.stringify(await r.json());
    expect(corpo).not.toContain("core_registros");
    expect(espiao.mock.calls.flat().join(" ")).not.toContain("core_registros");
    espiao.mockRestore();
    expect(m.audit).not.toHaveBeenCalled();
  });

  it("a ação do serviço é a do mapa da rota e tem frase na auditoria", () => {
    const servico = readFileSync(path.join(process.cwd(), "src/lib/contabil-core/servidor/cadastros.ts"), "utf8");
    const fonte = readFileSync(path.join(__dirname, "route.ts"), "utf8");
    const acao = /ACAO_DO_REAPONTAMENTO = "([^"]+)"/.exec(servico)?.[1];
    expect(acao).toBe("contabil.core.contas_sinteticas.reapontadas");
    expect(fonte).toContain(`"${acao}": "${acao}"`);
    expect(ACOES[acao!]?.tipo).toBe("editou");
  });
});
