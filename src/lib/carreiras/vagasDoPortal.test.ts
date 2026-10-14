import { beforeEach, describe, expect, it, vi } from "vitest";

// A consulta do hub do 41 Carreiras (e da lista de qualquer escritório), com o
// banco simulado: o `where` que a consulta manda é aplicado de verdade sobre
// as vagas abaixo — de dois escritórios, públicas e internas, abertas e
// encerradas, no prazo e vencidas.

type Vaga = {
  id: string;
  tenantId: string;
  isPublic: boolean;
  status: "ABERTA" | "ENCERRADA";
  applicationDeadline: Date | null;
  openedAt: Date;
  title: string;
  workCity: string | null;
  workStateCode: string | null;
  salaryMin: { toNumber: () => number } | null;
  salaryMax: { toNumber: () => number } | null;
  company: { tradeName: string | null; name: string; city: string | null; stateCode: string | null; logoUrl?: string | null };
  cargo: { name: string } | null;
};

/** O `where` do portal aplicado a uma vaga, como o banco aplicaria. */
function passa(v: Vaga, w: Where & { id?: string }): boolean {
  const limite = w.OR[1].applicationDeadline.gte;
  return (
    (w.id === undefined || v.id === w.id) &&
    v.tenantId === w.tenantId &&
    v.isPublic === w.isPublic &&
    v.status === w.status &&
    (v.applicationDeadline === null || v.applicationDeadline >= limite)
  );
}

type Where = {
  tenantId: string;
  isPublic: boolean;
  status: string;
  OR: [{ applicationDeadline: null }, { applicationDeadline: { gte: Date } }];
};

const estado = vi.hoisted(() => ({
  tenants: [] as { id: string; slug: string; name: string; logoUrl: string | null; active: boolean }[],
  vagas: [] as Vaga[],
  pedidos: [] as unknown[],
  requisitos: [] as { tenantId: string; vagaId: string; versao: number; itens: unknown }[],
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    tenant: {
      findUnique: async ({ where }: { where: { slug: string } }) => estado.tenants.find((t) => t.slug === where.slug) ?? null,
    },
    vaga: {
      findMany: async (args: { where: Where; orderBy: { openedAt: "desc" } }) => {
        estado.pedidos.push(args);
        const w = args.where;
        const limite = w.OR[1].applicationDeadline.gte;
        return estado.vagas
          .filter(
            (v) =>
              v.tenantId === w.tenantId &&
              v.isPublic === w.isPublic &&
              v.status === w.status &&
              (v.applicationDeadline === null || v.applicationDeadline >= limite),
          )
          .sort((a, b) => b.openedAt.getTime() - a.openedAt.getTime());
      },
      findFirst: async (args: { where: Where & { id: string } }) => estado.vagas.find((v) => passa(v, args.where)) ?? null,
    },
    vagaRequisitos: {
      findFirst: async ({ where }: { where: { tenantId: string; vagaId: string } }) =>
        estado.requisitos
          .filter((r) => r.tenantId === where.tenantId && r.vagaId === where.vagaId)
          .sort((a, b) => b.versao - a.versao)[0] ?? null,
    },
  }),
}));

import { escritorioDoPortal, vagaDoPortal, vagasAbertasDoPortal } from "./vagasDoPortal";

const reais = (n: number) => ({ toNumber: () => n });
const empresa = { tradeName: "Metalúrgica Iguaçu", name: "Metalúrgica Iguaçu Ltda", city: "Curitiba", stateCode: "PR" };

function vaga(p: Partial<Vaga> & { id: string }): Vaga {
  return {
    tenantId: "t-41",
    isPublic: true,
    status: "ABERTA",
    applicationDeadline: null,
    openedAt: new Date("2026-10-01T12:00:00Z"),
    title: `Vaga ${p.id}`,
    workCity: null,
    workStateCode: null,
    salaryMin: null,
    salaryMax: null,
    company: empresa,
    cargo: null,
    ...p,
  };
}

const AGORA = new Date("2026-10-14T15:00:00Z");

beforeEach(() => {
  estado.pedidos = [];
  estado.requisitos = [];
  estado.tenants = [
    { id: "t-41", slug: "41tech", name: "41 Tech", logoUrl: "/api/workspace-logos/t-41.png", active: true },
    { id: "t-outro", slug: "outro", name: "Outro Escritório", logoUrl: null, active: true },
    { id: "t-parado", slug: "parado", name: "Inativo", logoUrl: null, active: false },
  ];
  estado.vagas = [
    vaga({ id: "aberta", openedAt: new Date("2026-10-10T12:00:00Z"), cargo: { name: "Fiscal" }, salaryMin: reais(3000), salaryMax: reais(4500) }),
    vaga({ id: "prazo-hoje", applicationDeadline: new Date("2026-10-14T00:00:00Z"), workCity: "Joinville", workStateCode: "SC" }),
    vaga({ id: "mais-nova", openedAt: new Date("2026-10-13T12:00:00Z"), company: { ...empresa, tradeName: null } }),
    vaga({ id: "interna", isPublic: false }),
    vaga({ id: "encerrada", status: "ENCERRADA" }),
    vaga({ id: "vencida", applicationDeadline: new Date("2026-10-13T00:00:00Z") }),
    vaga({ id: "de-outro-escritorio", tenantId: "t-outro" }),
  ];
});

describe("escritorioDoPortal", () => {
  it("o escritório ativo, pelo slug; inativo ou inexistente, nada", async () => {
    expect(await escritorioDoPortal("41tech")).toMatchObject({ id: "t-41", logoUrl: "/api/workspace-logos/t-41.png" });
    expect(await escritorioDoPortal("parado")).toBeNull();
    expect(await escritorioDoPortal("nao-existe")).toBeNull();
  });
});

describe("vagasAbertasDoPortal — a consulta do hub", () => {
  it("só as do escritório, publicadas, abertas e no prazo (o de hoje vale), das mais novas", async () => {
    const vagas = await vagasAbertasDoPortal("t-41", AGORA);
    expect(vagas.map((v) => v.id)).toEqual(["mais-nova", "aberta", "prazo-hoje"]);
  });

  it("o outro escritório só vê as dele", async () => {
    expect((await vagasAbertasDoPortal("t-outro", AGORA)).map((v) => v.id)).toEqual(["de-outro-escritorio"]);
  });

  it("monta empresa, local, área e salário como a lista mostra", async () => {
    const porId = Object.fromEntries((await vagasAbertasDoPortal("t-41", AGORA)).map((v) => [v.id, v]));
    expect(porId.aberta).toMatchObject({ empresa: "Metalúrgica Iguaçu", cidade: "Curitiba", uf: "PR", area: "Fiscal", salaryMin: 3000, salaryMax: 4500 });
    // O local da vaga ganha do da empresa; sem nome fantasia, a razão social.
    expect(porId["prazo-hoje"]).toMatchObject({ cidade: "Joinville", uf: "SC", area: null, salaryMin: null });
    expect(porId["mais-nova"]!.empresa).toBe("Metalúrgica Iguaçu Ltda");
  });
});

describe("vagaDoPortal — a página da vaga e o painel ao lado da lista (15/10/2026)", () => {
  it("só a vaga que está no portal: do escritório, publicada, aberta e no prazo", async () => {
    expect((await vagaDoPortal("t-41", "aberta", AGORA))?.id).toBe("aberta");
    for (const id of ["interna", "encerrada", "vencida", "de-outro-escritorio", "nao-existe"]) {
      expect(await vagaDoPortal("t-41", id, AGORA), id).toBeNull();
    }
  });

  it("os requisitos da versão mais nova, só o texto; o logo da empresa vira só um 'tem logo'", async () => {
    estado.vagas[0]!.company = { ...empresa, logoUrl: "/api/company-logos/c1.png?v=1" };
    estado.requisitos = [
      { tenantId: "t-41", vagaId: "aberta", versao: 1, itens: [{ id: "r1", tipo: "OBRIGATORIO", texto: "Versão velha", peso: 2 }] },
      {
        tenantId: "t-41",
        vagaId: "aberta",
        versao: 2,
        itens: [
          { id: "r1", tipo: "OBRIGATORIO", texto: "Experiência com ICMS", peso: 3 },
          { id: "r2", tipo: "DESEJAVEL", texto: "Domínio Sistemas", peso: 1 },
        ],
      },
    ];
    const v = (await vagaDoPortal("t-41", "aberta", AGORA))!;
    expect(v.requisitos).toEqual({ obrigatorios: ["Experiência com ICMS"], desejaveis: ["Domínio Sistemas"] });
    expect(v.temLogo).toBe(true);
    expect(JSON.stringify(v)).not.toContain("company-logos");
    expect(v).toMatchObject({ empresa: "Metalúrgica Iguaçu", cidade: "Curitiba", uf: "PR", area: "Fiscal", salaryMin: 3000, salaryMax: 4500 });
  });

  it("sem requisitos cadastrados: listas vazias (a página esconde o bloco)", async () => {
    expect((await vagaDoPortal("t-41", "aberta", AGORA))!.requisitos).toEqual({ obrigatorios: [], desejaveis: [] });
  });
});
