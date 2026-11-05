import { beforeEach, describe, expect, it, vi } from "vitest";
import { modeloDoCodigo } from "@/lib/dre/estrutura";

// A foto inicial e a publicação, com o banco simulado e os loaders da DRE
// trocados por respostas fixas: o que se confere aqui é o que vai para o banco
// e o que o portal lê de volta — o cálculo em si tem os testes dele.

type Linha = { tenantId: string; companyId: string; competencia: string; foto: unknown; inicial: boolean; publicadoEm: Date; publicadoPorId?: string | null; publicadoPorNome: string | null };

const banco = vi.hoisted(() => ({
  publicacoes: [] as Linha[],
  marcas: new Set<string>(),
  createMany: 0,
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    drePublicacaoEmpresa: {
      findUnique: async ({ where }: { where: { companyId: string } }) => (banco.marcas.has(where.companyId) ? { companyId: where.companyId } : null),
      create: async ({ data }: { data: { companyId: string } }) => {
        banco.marcas.add(data.companyId);
        return data;
      },
    },
    drePublicacao: {
      createMany: async ({ data, skipDuplicates }: { data: Omit<Linha, "publicadoEm" | "publicadoPorNome">[]; skipDuplicates: boolean }) => {
        banco.createMany++;
        expect(skipDuplicates).toBe(true);
        for (const d of data) {
          if (banco.publicacoes.some((p) => p.companyId === d.companyId && p.competencia === d.competencia)) continue;
          banco.publicacoes.push({ ...d, publicadoEm: new Date("2026-11-06T12:00:00Z"), publicadoPorNome: null });
        }
        return { count: data.length };
      },
      findMany: async ({ where }: { where: { companyId: string; competencia?: { in: string[] } } }) =>
        banco.publicacoes.filter((p) => p.companyId === where.companyId && (!where.competencia || where.competencia.in.includes(p.competencia))),
      upsert: async ({ where, create, update }: { where: { companyId_competencia: { companyId: string; competencia: string } }; create: Linha; update: Partial<Linha> }) => {
        const k = where.companyId_competencia;
        const i = banco.publicacoes.findIndex((p) => p.companyId === k.companyId && p.competencia === k.competencia);
        if (i >= 0) banco.publicacoes[i] = { ...banco.publicacoes[i]!, ...update };
        else banco.publicacoes.push(create);
        return banco.publicacoes.find((p) => p.companyId === k.companyId && p.competencia === k.competencia);
      },
    },
  }),
}));

// O caixa: setembro e outubro de 2026 com movimento; a competência: outubro e
// um mês só de competência (agosto). O grupo é o de receita do modelo padrão.
const RECEITA = modeloDoCodigo("padrao").grupos.find((g) => g.origem === "recebimento")!.code;
const porGrupo = (receita: number) => ({ [RECEITA]: receita });
vi.mock("@/lib/dre/data", () => ({
  mesesComMovimento: async () => [
    { ano: 2026, mes: 10 },
    { ano: 2026, mes: 9 },
  ],
  dreDoAnoDaEmpresa: async () => ({
    meses: Array.from({ length: 12 }, (_, i) => ({
      mes: i + 1,
      porGrupo: i + 1 === 9 ? porGrupo(800_00) : i + 1 === 10 ? porGrupo(1_000_00) : {},
      temMovimento: i + 1 === 9 || i + 1 === 10,
      porCategoria: {},
    })),
  }),
  dreDoMes: async () => ({ resultado: { porGrupo: porGrupo(1_200_00), porCategoria: {} }, lancamentos: 3 }),
}));
vi.mock("@/lib/dre/dataEconomica", () => ({
  competenciasDaEmpresa: async () => ["2026-10", "2026-08"],
  serieEconomica: async (_t: string, _c: string, competencias: string[]) =>
    new Map(
      competencias.map((c) => [
        c,
        {
          resultado: { porGrupo: c === "2026-08" || c === "2026-10" ? porGrupo(500_00) : {}, porCategoria: {} },
          lancamentos: c === "2026-08" || c === "2026-10" ? 1 : 0,
          provisorios: 0,
          cobranca: { perdas: 0, acrescimosDeAcordo: 0, descontosDeAcordo: 0 },
        },
      ])
    ),
}));
vi.mock("@/lib/dre/modeloDaEmpresa", async () => {
  const { modeloDoCodigo } = await import("@/lib/dre/estrutura");
  return { modeloDaEmpresa: async () => modeloDoCodigo("padrao") };
});

import { fotoAtualDoMes, garantirFotoInicial, publicacoesDaEmpresa, publicarMes } from "@/lib/dre/publicacaoServidor";
import { lerDreDoCliente } from "@/lib/dre/doClientePublicado";
import { diferencasDaDre } from "@/lib/dre/publicacao";

const T = "t1";
const C = "emp1";

beforeEach(() => {
  banco.publicacoes = [];
  banco.marcas = new Set();
  banco.createMany = 0;
});

describe("garantirFotoInicial", () => {
  it("publica sozinha todo mês que o cliente já via, nos dois regimes, e marca a empresa", async () => {
    expect(await garantirFotoInicial(T, C)).toBe(true);
    const meses = banco.publicacoes.map((p) => p.competencia).sort();
    expect(meses).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(banco.publicacoes.every((p) => p.inicial)).toBe(true);
    expect(banco.marcas.has(C)).toBe(true);

    const pubs = await publicacoesDaEmpresa(T, C);
    expect(pubs.get("2026-09")?.foto.caixa).toMatchObject({ temMovimento: true, porGrupo: { [RECEITA]: 800_00 } });
    expect(pubs.get("2026-09")?.foto.competencia.temMovimento).toBe(false);
    expect(pubs.get("2026-08")?.foto.caixa.temMovimento).toBe(false);
    expect(pubs.get("2026-08")?.foto.competencia).toMatchObject({ temMovimento: true, porGrupo: { [RECEITA]: 500_00 } });
  });

  it("uma vez só: com a marca, não lê nem grava nada", async () => {
    await garantirFotoInicial(T, C);
    banco.createMany = 0;
    expect(await garantirFotoInicial(T, C)).toBe(false);
    expect(banco.createMany).toBe(0);
  });
});

describe("publicar e o que o portal lê", () => {
  it("o portal mostra a foto inicial até a equipe publicar; depois, a versão nova, com o dia", async () => {
    await garantirFotoInicial(T, C);

    // A equipe importou de novo outubro: a DRE de agora mudou, o portal não.
    const agora = await fotoAtualDoMes(T, C, "2026-10");
    let pubs = await publicacoesDaEmpresa(T, C);
    expect(diferencasDaDre(pubs.get("2026-10")!.foto, agora).length).toBeGreaterThan(0);
    let leitura = lerDreDoCliente(pubs, { mes: "2026-10" }, "caixa");
    expect(leitura.tipo === "mes" && leitura.publicada?.resultado.porGrupo[RECEITA]).toBe(1_000_00);

    await publicarMes({ tenantId: T, companyId: C, competencia: "2026-10", foto: agora, userId: "u1", nome: "Amanda" });
    pubs = await publicacoesDaEmpresa(T, C);
    const outubro = pubs.get("2026-10")!;
    expect(outubro).toMatchObject({ inicial: false, publicadoPorNome: "Amanda" });
    expect(diferencasDaDre(outubro.foto, agora)).toEqual([]);
    leitura = lerDreDoCliente(pubs, { mes: "2026-10" }, "caixa");
    expect(leitura.tipo === "mes" && leitura.publicada?.resultado.porGrupo[RECEITA]).toBe(1_200_00);
    expect(leitura.tipo === "mes" && leitura.publicada?.atualizadaEm).toEqual(outubro.publicadoEm);
  });

  it("mês novo, importado depois da foto inicial, não aparece no portal antes de publicado", async () => {
    await garantirFotoInicial(T, C);
    const leitura = lerDreDoCliente(await publicacoesDaEmpresa(T, C), { mes: "2026-11" }, "caixa");
    expect(leitura).toEqual({ tipo: "mes", mes: "2026-11", publicada: null });
  });

  it("foto gravada estranha (outra versão) é tratada como não publicada", async () => {
    banco.publicacoes.push({ tenantId: T, companyId: C, competencia: "2026-10", foto: { versao: 9 }, inicial: false, publicadoEm: new Date(), publicadoPorNome: null });
    expect((await publicacoesDaEmpresa(T, C)).has("2026-10")).toBe(false);
  });
});
