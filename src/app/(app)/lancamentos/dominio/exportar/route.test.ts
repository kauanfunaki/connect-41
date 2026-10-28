import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// A planilha da Domínio (lote 3, 28/10/2026): toda planilha baixada fica
// registrada, e a correção sai contra a última — sem nenhuma antes, ou sem
// nada mudado, não há arquivo.

const m = vi.hoisted(() => ({
  exportacao: null as unknown,
  correcao: null as unknown,
  registrar: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => ({ tenantId: "t1", userId: "u1" }), canActOnSector: () => true }));
vi.mock("@/lib/module-catalog", () => ({ getModuleDef: () => ({ sectorCode: "bpo" }) }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: async () => true, setorDoModulo: async () => "bpo" }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("@/lib/empresas/focoServidor", () => ({ leituraNoFoco: async () => ({ ok: true }) }));
vi.mock("@/lib/financeiro/dominio/servidor", () => ({
  exportacaoDoMes: async () => m.exportacao,
  correcaoDoMes: async () => m.correcao,
  registrarExportacao: m.registrar,
}));

const { GET } = await import("./route");

const LINHA = { dataKey: "2026-10-15", debito: "341", credito: "7", centavos: 1000, codigoHistorico: "", complemento: "PAGTO", codigoFilial: "1", baixaId: "b1" };
const pedir = (extra = "") => GET(new NextRequest(`http://x/lancamentos/dominio/exportar?empresa=c1&mes=2026-10&formato=txt${extra}`));

beforeEach(() => {
  m.registrar.mockReset();
  m.logAudit.mockReset();
  m.exportacao = { linhas: [LINHA], pendencias: [], baixas: [], empresa: { nome: "Empresa", cnpj: "12345678000190" } };
  m.correcao = null;
});

describe("exportar para a Domínio", () => {
  it("o mês inteiro sai e fica registrado como completa", async () => {
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Disposition")).toContain("lancamentos_baixas_12345678000190_2026-10.txt");
    expect(m.registrar).toHaveBeenCalledWith(expect.objectContaining({ tipo: "COMPLETA", formato: "txt", linhasDoArquivo: 1, competencia: "2026-10" }));
  });

  it("correção sem planilha anterior: pede a do mês inteiro primeiro, e não registra", async () => {
    const r = await pedir("&tipo=correcao");
    expect(r.status).toBe(400);
    expect((await r.json()).error).toContain("baixe a do mês inteiro primeiro");
    expect(m.registrar).not.toHaveBeenCalled();
  });

  it("correção sem nada mudado: não há arquivo", async () => {
    m.correcao = { linhas: [], novas: 0, alteradas: 0, removidas: 0 };
    const r = await pedir("&tipo=correcao");
    expect(r.status).toBe(400);
    expect(m.registrar).not.toHaveBeenCalled();
  });

  it("correção com mudança: leva só as linhas dela, e registra o estado de agora", async () => {
    const estorno = { ...LINHA, debito: "7", credito: "341", complemento: "ESTORNO PAGTO" };
    m.correcao = { linhas: [estorno], novas: 0, alteradas: 0, removidas: 1 };
    const r = await pedir("&tipo=correcao");
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Disposition")).toContain("lancamentos_baixas_correcao_");
    expect(Buffer.from(await r.arrayBuffer()).toString("latin1")).toContain("ESTORNO PAGTO");
    expect(m.registrar).toHaveBeenCalledWith(expect.objectContaining({ tipo: "CORRECAO", linhasDoArquivo: 1, atual: m.exportacao }));
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ tipo: "correcao", removidas: 1 }) }));
  });
});
