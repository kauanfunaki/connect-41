import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

// O PDF da nota pelo portal (11/11/2026), de ponta a ponta pela rota: sessão,
// tela bloqueada, alcance, raízes autorizadas, credencial e motor simulados. O
// banco simulado respeita o `where` — nota de empresa fora do alcance, de outro
// escritório ou removida na origem não é achada. O motor simulado registra as
// raízes pedidas: nenhuma fora das autorizadas pode chegar a ele.

type Doc = {
  id: string;
  tenantId: string;
  companyId: string;
  origin: "SPED" | "UPLOAD" | "OMIE";
  renderizavel: boolean;
  removedAtOrigin?: boolean;
  spedTipo: string | null;
  spedIdentificador: string | null;
  issuerDocument: string;
  recipientDocument: string | null;
  empresaCnpj: string | null;
};

const estado = vi.hoisted(() => ({
  sessao: { kind: "portal", sub: "pu1", tenantId: "t1" } as null | { kind: "portal"; sub: string; tenantId: string },
  bloqueadas: [] as string[],
  companyIds: ["c1"] as string[],
  raizesAutorizadas: new Set<string>(["11111111"]),
  credencial: true,
  docs: [] as Doc[],
  consultas: 0,
  pedidosAoMotor: [] as { raiz: string; tipo: string; identificador: string }[],
  respostaDoMotor: {} as Record<string, "ok" | "404" | "409" | "500">,
}));

vi.mock("@/app/(portal)/usuario", () => ({ sessaoAtivaDoPortal: async () => estado.sessao }));
vi.mock("@/lib/portal/telasBloqueadas", () => ({ telaBloqueadaNoPortal: async (_t: string, href: string) => estado.bloqueadas.includes(href) }));
vi.mock("@/app/(portal)/alcance", () => ({
  alcanceDoCliente: async () => ({ tipo: "EMPRESAS", tenantId: "t1", companyIds: estado.companyIds }),
}));
vi.mock("@/lib/sped/raizes", () => ({ raizesDoAlcance: async () => estado.raizesAutorizadas }));
vi.mock("@/lib/sped/credenciais", () => ({
  credenciaisDoSped: async () => (estado.credencial ? { baseUrl: "http://motor", token: "x", tokenEscrita: null } : null),
}));
vi.mock("@/lib/sped/client", async (original) => {
  const real = await original<typeof import("@/lib/sped/client")>();
  return {
    ...real,
    obterPdf: async (_c: unknown, raiz: string, tipo: string, identificador: string) => {
      estado.pedidosAoMotor.push({ raiz, tipo, identificador });
      const r = estado.respostaDoMotor[raiz] ?? "ok";
      if (r === "404") throw new real.ErroDoSped(404, null, "não nesta raiz");
      if (r === "409") throw new real.ErroDoSped(409, "sem_xml_armazenado", "sem XML");
      if (r === "500") throw new real.ErroDoSped(500, null, "caiu");
      return new TextEncoder().encode("%PDF-1.4 teste").buffer;
    },
  };
});
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    fiscalDocument: {
      findFirst: async ({ where }: { where: { AND: { tenantId: string; companyId: { in: string[] } }[]; id: string; removedAtOrigin: boolean } }) => {
        estado.consultas += 1;
        const alcance = where.AND[0];
        const d = estado.docs.find(
          (x) =>
            x.id === where.id &&
            x.tenantId === alcance.tenantId &&
            alcance.companyId.in.includes(x.companyId) &&
            (x.removedAtOrigin ?? false) === where.removedAtOrigin
        );
        if (!d) return null;
        return {
          id: d.id,
          type: "NFE",
          number: "123",
          series: "1",
          origin: d.origin,
          renderizavel: d.renderizavel,
          spedTipo: d.spedTipo,
          spedIdentificador: d.spedIdentificador,
          issuerDocument: d.issuerDocument,
          recipientDocument: d.recipientDocument,
          company: { cnpj: d.empresaCnpj },
        };
      },
    },
  }),
}));

import { GET } from "./[id]/pdf/route";

const pedir = (id: string) =>
  GET(new Request(`http://localhost/portal/documentos/${id}/pdf`) as unknown as NextRequest, { params: Promise.resolve({ id }) });

const CNPJ_DA_EMPRESA = "11111111000191";
const CNPJ_DE_FORA = "99999999000191";
const base = (over: Partial<Doc>): Doc => ({
  id: "d1",
  tenantId: "t1",
  companyId: "c1",
  origin: "SPED",
  renderizavel: true,
  spedTipo: "nfe",
  spedIdentificador: "chave-1",
  issuerDocument: CNPJ_DA_EMPRESA,
  recipientDocument: CNPJ_DE_FORA,
  empresaCnpj: CNPJ_DA_EMPRESA,
  ...over,
});

beforeEach(() => {
  estado.sessao = { kind: "portal", sub: "pu1", tenantId: "t1" };
  estado.bloqueadas = [];
  estado.companyIds = ["c1"];
  estado.raizesAutorizadas = new Set(["11111111"]);
  estado.credencial = true;
  estado.consultas = 0;
  estado.pedidosAoMotor = [];
  estado.respostaDoMotor = {};
  estado.docs = [
    base({}),
    base({ id: "d-vizinha", companyId: "c2" }),
    base({ id: "d-outro-escritorio", tenantId: "t2" }),
    base({ id: "d-removida", removedAtOrigin: true }),
    base({ id: "d-upload", origin: "UPLOAD", spedTipo: null, spedIdentificador: null }),
    base({ id: "d-sem-xml", renderizavel: false }),
  ];
});

describe("PDF da nota pelo portal", () => {
  it("o cliente baixa o PDF de uma nota de empresa dele, pedido ao motor pela raiz da empresa", async () => {
    const r = await pedir("d1");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="nota-de-produto-123-1.pdf"');
    expect(r.headers.get("cache-control")).toContain("no-store");
    expect(Buffer.from(await r.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
    expect(estado.pedidosAoMotor).toEqual([{ raiz: "11111111", tipo: "nfe", identificador: "chave-1" }]);
  });

  it("sem sessão: 401, sem ler o documento", async () => {
    estado.sessao = null;
    expect((await pedir("d1")).status).toBe(401);
    expect(estado.consultas).toBe(0);
  });

  it("tela de documentos bloqueada pelo escritório: 404, sem ler o documento", async () => {
    estado.bloqueadas = ["/portal/documentos"];
    expect((await pedir("d1")).status).toBe(404);
    expect(estado.consultas).toBe(0);
    expect(estado.pedidosAoMotor).toEqual([]);
  });

  it("nota de empresa fora do alcance, de outro escritório, removida ou inexistente: 404, e o motor não é chamado", async () => {
    for (const id of ["d-vizinha", "d-outro-escritorio", "d-removida", "nao-existe"]) {
      expect((await pedir(id)).status).toBe(404);
    }
    expect(estado.pedidosAoMotor).toEqual([]);
  });

  it("cliente sem empresa no alcance: 404, sem ler o documento", async () => {
    estado.companyIds = [];
    expect((await pedir("d1")).status).toBe(404);
    expect(estado.consultas).toBe(0);
  });

  it("raiz da nota fora das autorizadas: não vai ao motor", async () => {
    estado.raizesAutorizadas = new Set(["22222222"]);
    expect((await pedir("d1")).status).toBe(409);
    expect(estado.pedidosAoMotor).toEqual([]);
  });

  it("nunca pede ao motor uma raiz que o alcance não autoriza, nem a da outra ponta", async () => {
    // A do destinatário (de fora) não está nas autorizadas: só a da empresa é tentada.
    estado.respostaDoMotor = { "11111111": "404" };
    expect((await pedir("d1")).status).toBe(404);
    expect(estado.pedidosAoMotor.map((p) => p.raiz)).toEqual(["11111111"]);
  });

  it("nota entre duas empresas da carteira: tenta a raiz da outra ponta quando a primeira não tem", async () => {
    estado.raizesAutorizadas = new Set(["11111111", "99999999"]);
    estado.respostaDoMotor = { "11111111": "404" };
    expect((await pedir("d1")).status).toBe(200);
    expect(estado.pedidosAoMotor.map((p) => p.raiz)).toEqual(["11111111", "99999999"]);
  });

  it("nota que não veio do motor ou sem XML guardado: 409, sem chamar o motor", async () => {
    expect((await pedir("d-upload")).status).toBe(409);
    expect((await pedir("d-sem-xml")).status).toBe(409);
    expect(estado.pedidosAoMotor).toEqual([]);
  });

  it("o motor diz que não tem o XML: 409 com a explicação", async () => {
    estado.respostaDoMotor = { "11111111": "409" };
    const r = await pedir("d1");
    expect(r.status).toBe(409);
    expect(((await r.json()) as { error: string }).error).toContain("peça à equipe");
  });

  it("sem credencial do motor: 503; motor fora do ar: 502", async () => {
    estado.credencial = false;
    expect((await pedir("d1")).status).toBe(503);
    estado.credencial = true;
    estado.respostaDoMotor = { "11111111": "500" };
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect((await pedir("d1")).status).toBe(502);
    erro.mockRestore();
  });
});
