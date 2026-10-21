import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import type { AuthContext } from "@/lib/auth/context";

// A exportação da DRE no modelo do BPO, de ponta a ponta: sessão, módulos,
// banco e leitura dos lançamentos simulados; a régua (`podeAbrirADre`), a
// montagem das linhas e o .xlsx são os reais. A régua é a mesma da tela — quem
// abre a DRE baixa, quem não abre recebe o mesmo 404 da tela.

type Empresa = { id: string; tenantId: string; name: string; tradeName: string | null; status: string };

const estado = vi.hoisted(() => ({
  ctx: null as unknown as AuthContext,
  ligados: new Set<string>(),
  setorDoDre: null as string | null,
  empresas: [] as Empresa[],
  pedidos: [] as unknown[],
}));

vi.mock("@/lib/auth/context", () => ({ getAuthContext: async () => estado.ctx }));
vi.mock("@/lib/modules", () => {
  const mod = {
  isModuleEnabled: async (_t: string, codigo: string) => estado.ligados.has(codigo),
  setorDoModulo: async (_t: string, codigo: string) => (codigo === "bpo_dre" ? estado.setorDoDre : null),
};
  // Os setores da tela (21/10/2026): aqui, só o dono, como antes.
  const setoresDoModulo = async (t: string, c: string) => {
    const s = await (mod.setorDoModulo as (t: string, c: string) => Promise<string | null>)(t, c);
    return s == null ? null : [s];
  };
  return { ...mod, setoresDoModulo };
});
vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    company: {
      findFirst: async ({ where }: { where: { id: string; tenantId: string; status: string } }) =>
        estado.empresas.find((e) => e.id === where.id && e.tenantId === where.tenantId && e.status === where.status) ??
        null,
    },
  }),
}));
vi.mock("@/lib/dre/data", async () => {
  const { montarMapeamento } = await import("@/lib/dre/calculo");
  const { MAPEAMENTO_PADRAO } = await import("@/lib/dre/mapeamento-padrao");
  const mapeamento = montarMapeamento(MAPEAMENTO_PADRAO);
  const doMes = [
    { categoria: "Clientes - Venda de Mercadoria Fabricadas", valorCentavos: 100000, origem: "recebimento" as const },
    { categoria: "Frete", valorCentavos: -10000, origem: "pagamento" as const },
  ];
  return {
    mesesComMovimento: async () => [{ ano: 2026, mes: 9 }],
    lancamentosDoMes: async (_t: string, companyId: string, mes: { ano: number; mes: number }) => {
      estado.pedidos.push({ companyId, mes });
      return { lancamentos: doMes, mapeamento, categorias: [], fonte: { tipo: "financeiro", arquivos: [], importadoEm: null } };
    },
    lancamentosDoAno: async (_t: string, companyId: string, ano: number) => {
      estado.pedidos.push({ companyId, ano });
      return { porMes: new Map([[10, doMes]]), mapeamento, categorias: [] };
    },
  };
});

import { GET } from "./route";

function ctx(role: AuthContext["role"], sectors: string[], extra: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: "u1",
    tenantId: "t1",
    homeTenantId: "t1",
    role,
    sectors,
    subscriptionReadOnly: false,
    canSelfRegularizeSubscription: true,
    activeSector: null,
    ...extra,
  };
}

async function baixar(quem: AuthContext, consulta = "empresa=padaria&visao=mes&mes=2026-10"): Promise<Response> {
  estado.ctx = quem;
  return GET(new NextRequest(`http://localhost/dre/exportar?${consulta}`));
}

beforeEach(() => {
  estado.ligados = new Set(["bpo_dre"]);
  estado.setorDoDre = null; // sem setor configurado, vale o BPO — como na tela
  estado.pedidos = [];
  estado.empresas = [
    { id: "padaria", tenantId: "t1", name: "Padaria Pão Quente Ltda", tradeName: "Padaria Pão Quente", status: "ACTIVE" },
    { id: "encerrada", tenantId: "t1", name: "Encerrada Ltda", tradeName: null, status: "INACTIVE" },
    { id: "de-fora", tenantId: "t2", name: "De Outro Escritório", tradeName: null, status: "ACTIVE" },
  ];
});

describe("quem baixa a DRE no modelo do BPO (a régua da tela)", () => {
  it("quem é do setor do BPO baixa", async () => {
    expect((await baixar(ctx("SECTOR_USER", ["bpo"]))).status).toBe(200);
  });

  it("quem é de outro setor não baixa — 404, como a tela", async () => {
    expect((await baixar(ctx("SECTOR_USER", ["dp"]))).status).toBe(404);
    expect(estado.pedidos).toEqual([]);
  });

  it("com o módulo desligado, ninguém baixa — nem o admin", async () => {
    estado.ligados = new Set();
    expect((await baixar(ctx("SECTOR_USER", ["bpo"]))).status).toBe(404);
    expect((await baixar(ctx("ADMIN", []))).status).toBe(404);
  });

  it("o setor é o que opera o módulo no escritório: com o DRE no Financeiro, o Financeiro baixa e o BPO não", async () => {
    estado.setorDoDre = "financeiro";
    expect((await baixar(ctx("SECTOR_USER", ["financeiro"]))).status).toBe(200);
    expect((await baixar(ctx("SECTOR_USER", ["bpo"]))).status).toBe(404);
  });

  it("admin baixa; só leitura e assinatura vencida não — a tela também não abre para eles", async () => {
    expect((await baixar(ctx("ADMIN", []))).status).toBe(200);
    expect((await baixar(ctx("READONLY", []))).status).toBe(404);
    expect((await baixar(ctx("SECTOR_USER", ["bpo"], { subscriptionReadOnly: true }))).status).toBe(404);
  });

  it("empresa de outro escritório ou fora de atividade não sai", async () => {
    const bpo = ctx("SECTOR_USER", ["bpo"]);
    expect((await baixar(bpo, "empresa=de-fora&visao=mes&mes=2026-10")).status).toBe(404);
    expect((await baixar(bpo, "empresa=encerrada&visao=mes&mes=2026-10")).status).toBe(404);
    expect((await baixar(bpo, "visao=mes&mes=2026-10")).status).toBe(404);
  });
});

describe("o arquivo", () => {
  const bpo = ctx("SECTOR_USER", ["bpo"]);

  it("sai como .xlsx, com empresa e mês no nome e o acento preservado", async () => {
    const r = await baixar(bpo);
    expect(r.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const disposicao = r.headers.get("content-disposition")!;
    expect(disposicao).toContain('filename="DRE Padaria Pao Quente 10-2026.xlsx"');
    expect(disposicao).toContain("filename*=UTF-8''DRE%20Padaria%20P%C3%A3o%20Quente%2010-2026.xlsx");
    expect(estado.pedidos).toEqual([{ companyId: "padaria", mes: { ano: 2026, mes: 10 } }]);
  });

  it("o mês vem da URL da tela, que não completa com zero", async () => {
    await baixar(bpo, "empresa=padaria&visao=mes&mes=2026-3");
    expect(estado.pedidos).toEqual([{ companyId: "padaria", mes: { ano: 2026, mes: 3 } }]);
  });

  it("sem mês na URL, vale o mais recente com movimento — o padrão da tela", async () => {
    await baixar(bpo, "empresa=padaria");
    expect(estado.pedidos).toEqual([{ companyId: "padaria", mes: { ano: 2026, mes: 9 } }]);
  });

  it("a visão do ano exporta os doze meses e o total", async () => {
    const r = await baixar(bpo, "empresa=padaria&visao=ano&ano=2026");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-disposition")).toContain("filename*=UTF-8''DRE%20Padaria%20P%C3%A3o%20Quente%202026.xlsx");
    const livro = new ExcelJS.Workbook();
    await livro.xlsx.load(await r.arrayBuffer());
    const aba = livro.getWorksheet("DRE FINANCEIRO")!;
    expect(aba.getCell("A1").value).toBe("Padaria Pão Quente");
    expect(aba.getCell("B2").value).toBe("Jan/26");
    expect(aba.getCell("N2").value).toBe("Total 2026");
    expect(aba.getCell("K3").value).toBe(1000); // outubro, na coluna K
  });
});
