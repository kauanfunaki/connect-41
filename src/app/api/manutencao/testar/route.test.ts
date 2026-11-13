import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { UserRole } from "@/generated/prisma/enums";
import { COOKIE_DE_TESTE } from "@/lib/manutencao/regras";

// O que se testa: o "Abrir para testar" do aviso de manutenção (13/11/2026).
// Só quem conserta (Tech e administrador) abre a tela; o cookie guarda o id da
// manutenção, somado ao que já estava; tela já liberada não grava nada.

const MANUTENCAO = "5b1e7c2a-3f4d-4e6a-9b8c-0d1e2f3a4b5c";
const OUTRA = "11111111-1111-4111-8111-111111111111";

const m = vi.hoisted(() => ({
  ctx: { tenantId: "escritorio-a", userId: "u1", role: "SECTOR_USER" as UserRole, sectors: ["tech"] as string[] },
  telas: [] as { id: string; moduleCode: string }[],
}));

vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => m.ctx }));
vi.mock("@/lib/manutencao/leitura", () => ({ lerTelasEmManutencao: async () => ({ telas: m.telas, disponivel: true }) }));

const { POST } = await import("./route");

function pedir(tela: string, cookie?: string) {
  const headers = new Headers({ "content-type": "application/json" });
  if (cookie) headers.set("cookie", cookie);
  return POST(new NextRequest("http://localhost/api/manutencao/testar", { method: "POST", headers, body: JSON.stringify({ tela }) }));
}

function cookieGravado(res: Response): string | null {
  const linha = res.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE_DE_TESTE}=`));
  return linha ? decodeURIComponent(linha.split(";")[0].slice(COOKIE_DE_TESTE.length + 1)) : null;
}

beforeEach(() => {
  m.ctx = { tenantId: "escritorio-a", userId: "u1", role: "SECTOR_USER", sectors: ["tech"] };
  m.telas = [{ id: MANUTENCAO, moduleCode: "bpo_contas_pagar" }];
});

describe("POST /api/manutencao/testar", () => {
  it("a Tech abre a tela em manutenção só para si: o cookie guarda a manutenção, por algumas horas, fora do alcance do JavaScript", async () => {
    const res = await pedir("bpo_contas_pagar");
    expect(res.status).toBe(200);
    expect(cookieGravado(res)).toBe(MANUTENCAO);
    const linha = res.headers.getSetCookie().find((c) => c.startsWith(`${COOKIE_DE_TESTE}=`)) ?? "";
    expect(linha).toMatch(/HttpOnly/i);
    expect(linha).toMatch(/Max-Age=36000/);
    expect(linha).toMatch(/Path=\//);
  });

  it("o administrador também abre, e o que já estava aberto continua", async () => {
    m.ctx = { ...m.ctx, role: "ADMIN", sectors: [] };
    const res = await pedir("bpo_contas_pagar", `${COOKIE_DE_TESTE}=${OUTRA}`);
    expect(cookieGravado(res)).toBe(`${OUTRA},${MANUTENCAO}`);
  });

  it("quem é só do setor não abre", async () => {
    m.ctx = { ...m.ctx, sectors: ["bpo"] };
    const res = await pedir("bpo_contas_pagar");
    expect(res.status).toBe(403);
    expect(cookieGravado(res)).toBeNull();
  });

  it("sem sessão, pede para entrar de novo", async () => {
    m.ctx = { ...m.ctx, tenantId: "", userId: "" };
    expect((await pedir("bpo_contas_pagar")).status).toBe(401);
  });

  it("tela que já saiu da manutenção não grava nada (ela já abre para todos)", async () => {
    m.telas = [];
    const res = await pedir("bpo_contas_pagar");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, liberada: true });
    expect(cookieGravado(res)).toBeNull();
  });
});
