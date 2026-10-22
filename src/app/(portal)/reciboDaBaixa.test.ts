import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// O recibo da baixa pelo portal (22/10/2026), de ponta a ponta pelas rotas:
// sessão, tela bloqueada, módulos e alcance simulados; o banco simulado
// respeita o `where` — baixa de empresa fora do alcance, de outro escritório
// ou do outro tipo não é achada. O papel do portal sai sem a observação.

type Baixa = { id: string; tenantId: string; companyId: string; kind: "PAGAR" | "RECEBER"; status?: string };

const estado = vi.hoisted(() => ({
  sessao: { kind: "portal", sub: "pu1", tenantId: "t1" } as null | { kind: "portal"; sub: string; tenantId: string },
  bloqueadas: [] as string[],
  modulos: new Set<string>(),
  companyIds: ["c1"] as string[],
  baixas: [] as Baixa[],
  wheres: [] as unknown[],
}));

vi.mock("@/app/(portal)/usuario", () => ({ sessaoAtivaDoPortal: async () => estado.sessao }));
vi.mock("@/lib/portal/telasBloqueadas", () => ({ telaBloqueadaNoPortal: async (_t: string, href: string) => estado.bloqueadas.includes(href) }));
vi.mock("@/lib/modules", () => ({ getEnabledModuleCodes: async () => estado.modulos }));
vi.mock("@/app/(portal)/alcance", () => ({
  alcanceDoCliente: async () => ({ tipo: "EMPRESAS", tenantId: "t1", companyIds: estado.companyIds }),
}));
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    financeEntryPayment: {
      findFirst: async ({ where }: { where: { id: string; tenantId: string; companyId: { in: string[] }; entry: { kind: string; companyId: { in: string[] } } } }) => {
        estado.wheres.push(where);
        const b = estado.baixas.find(
          (x) =>
            x.id === where.id &&
            x.tenantId === where.tenantId &&
            where.companyId.in.includes(x.companyId) &&
            where.entry.companyId.in.includes(x.companyId) &&
            x.kind === where.entry.kind &&
            x.status !== "CANCELADO"
        );
        if (!b) return null;
        return {
          id: b.id,
          companyId: b.companyId,
          paidAt: new Date("2026-10-20T15:00:00Z"),
          principal: "1000.00",
          interest: "0.00",
          fine: "0.00",
          discount: "0.00",
          cash: "1000.00",
          note: "Conferir com o Fulano antes de mandar",
          origin: "MANUAL",
          createdAt: new Date("2026-10-20T15:00:00Z"),
          tenant: { name: "41 Contábil" },
          company: { name: "Padaria", displayName: null, kind: "PESSOA_JURIDICA", cnpj: "12345678000190", cpf: null },
          bankAccount: null,
          createdBy: { name: "Ana" },
          entry: {
            kind: b.kind,
            amount: "1000.00",
            dueDate: new Date("2026-10-10T15:00:00Z"),
            description: "Farinha",
            documentNumber: null,
            counterparty: { name: "Moinho", document: null },
          },
        };
      },
    },
  }),
}));

const pdf = vi.hoisted(() => ({ dados: [] as { observacao: string | null; registradoPor: string | null }[] }));
vi.mock("@/lib/financeiro/baixa/recibo", async (original) => {
  const real = await original<typeof import("@/lib/financeiro/baixa/recibo")>();
  return {
    ...real,
    pdfDoRecibo: async (d: Parameters<typeof real.pdfDoRecibo>[0]) => {
      pdf.dados.push(d);
      return real.pdfDoRecibo(d);
    },
  };
});

import { GET as reciboAPagar } from "./portal/(area)/pagar/recibos/[id]/route";
import { GET as reciboAReceber } from "./portal/(area)/receber/recibos/[id]/route";

const pedir = (rota: typeof reciboAPagar, id: string) =>
  rota(new Request(`http://localhost/portal/x/recibos/${id}`) as unknown as NextRequest, { params: Promise.resolve({ id }) });

beforeEach(() => {
  estado.sessao = { kind: "portal", sub: "pu1", tenantId: "t1" };
  estado.bloqueadas = [];
  estado.modulos = new Set(["bpo_contas_pagar", "bpo_contas_receber"]);
  estado.companyIds = ["c1"];
  estado.wheres = [];
  pdf.dados = [];
  estado.baixas = [
    { id: "b-pagar", tenantId: "t1", companyId: "c1", kind: "PAGAR" },
    { id: "b-receber", tenantId: "t1", companyId: "c1", kind: "RECEBER" },
    { id: "b-vizinha", tenantId: "t1", companyId: "c2", kind: "PAGAR" },
    { id: "b-outro-escritorio", tenantId: "t2", companyId: "c1", kind: "PAGAR" },
  ];
});

describe("recibo da baixa pelo portal", () => {
  it("o cliente baixa o PDF da baixa de uma empresa dele, sem a observação da equipe", async () => {
    const r = await pedir(reciboAPagar, "b-pagar");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toContain("recibo-");
    expect(Buffer.from(await r.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.dados[0]).toMatchObject({ observacao: null, registradoPor: "Ana" });
  });

  it("sem sessão: 401", async () => {
    estado.sessao = null;
    expect((await pedir(reciboAPagar, "b-pagar")).status).toBe(401);
  });

  it("baixa de empresa fora do alcance, de outro escritório ou inexistente: 404", async () => {
    expect((await pedir(reciboAPagar, "b-vizinha")).status).toBe(404);
    expect((await pedir(reciboAPagar, "b-outro-escritorio")).status).toBe(404);
    expect((await pedir(reciboAPagar, "nao-existe")).status).toBe(404);
  });

  it("cada tela só serve as baixas do seu tipo", async () => {
    expect((await pedir(reciboAPagar, "b-receber")).status).toBe(404);
    expect((await pedir(reciboAReceber, "b-receber")).status).toBe(200);
  });

  it("módulo do tipo desligado ou tela bloqueada: 404, sem ler a baixa", async () => {
    estado.modulos = new Set(["bpo_contas_receber"]);
    expect((await pedir(reciboAPagar, "b-pagar")).status).toBe(404);
    estado.modulos = new Set(["bpo_contas_pagar", "bpo_contas_receber"]);
    estado.bloqueadas = ["/portal/receber"];
    expect((await pedir(reciboAReceber, "b-receber")).status).toBe(404);
    expect(estado.wheres).toEqual([]);
    // A outra tela, liberada, segue.
    expect((await pedir(reciboAPagar, "b-pagar")).status).toBe(200);
  });

  it("cliente sem empresa no alcance: 404, sem ler a baixa", async () => {
    estado.companyIds = [];
    expect((await pedir(reciboAPagar, "b-pagar")).status).toBe(404);
    expect(estado.wheres).toEqual([]);
  });
});
