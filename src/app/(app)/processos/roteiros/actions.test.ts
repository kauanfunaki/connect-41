import { beforeEach, describe, expect, it, vi } from "vitest";

// Publicar o roteiro de um tipo de processo (09/11/2026): quem pode, o que é
// recusado antes de gravar e o que a publicação grava, numa transação.

type Passo = { position: number; label: string; description: string | null; parallelGroup: string | null; optional: boolean; organId: string | null; expectedActor: string; items: { label: string; required: boolean }[] };

const m = vi.hoisted(() => ({
  ctx: { tenantId: "t1", userId: "u1", role: "SECTOR_ADMIN", sectors: ["societario"], subscriptionReadOnly: false },
  niveis: new Set<string>(["ver", "agir", "gerir"]),
  tipo: { id: "tipo1", name: "Constituição" } as { id: string; name: string } | null,
  orgaos: [{ id: "junta" }, { id: "receita" }],
  versoes: [] as { id: string; version: number; published: boolean }[],
  passosDaVigente: [] as Passo[],
  erroAoCriar: null as unknown,
  gravados: [] as { modelo: string; args: Record<string, unknown> }[],
  auditoria: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/auth/context", async () => {
  const papeis = await vi.importActual<typeof import("@/lib/auth/papeis")>("@/lib/auth/papeis");
  return { ...papeis, getAuthContext: async () => m.ctx };
});
vi.mock("@/lib/auth/modulo", () => ({ podeNoModulo: async (_: unknown, __: string, nivel: string) => m.niveis.has(nivel) }));
vi.mock("@/lib/prisma", () => {
  const grava = (modelo: string) => async (args: Record<string, unknown>) => {
    m.gravados.push({ modelo, args });
    return { id: "novo-template" };
  };
  const tx = {
    processTemplate: {
      findMany: async () => m.versoes,
      create: async (args: Record<string, unknown>) => {
        if (m.erroAoCriar) throw m.erroAoCriar;
        return grava("processTemplate.create")(args);
      },
      updateMany: grava("processTemplate.updateMany"),
    },
    processTemplateStep: { findMany: async () => m.passosDaVigente, createMany: grava("processTemplateStep.createMany") },
    processTemplateChecklistItem: { createMany: grava("processTemplateChecklistItem.createMany") },
  };
  const prisma = {
    processType: { findFirst: async () => m.tipo },
    processOrgan: { findMany: async () => m.orgaos },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  };
  return { getPrisma: () => prisma };
});
vi.mock("@/lib/audit", () => ({ logAudit: async (x: Record<string, unknown>) => void m.auditoria.push(x) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { publicarRoteiro } = await import("./actions");

const etapa = (posicao: number, rotulo: string, extra: Record<string, unknown> = {}) => ({
  posicao,
  rotulo,
  descricao: null,
  grupo: null,
  opcional: false,
  orgaoId: null,
  executor: "PESSOA",
  itens: [],
  ...extra,
});

const ROTEIRO = [
  etapa(1, "Reunir documentação", { itens: [{ rotulo: "RG dos sócios", obrigatorio: true }, { rotulo: "Comprovante de endereço", obrigatorio: false }] }),
  etapa(2, "Bombeiros", { grupo: "Licenças", orgaoId: "junta", opcional: true }),
  etapa(2, "Vigilância", { grupo: "Licenças" }),
  etapa(3, "Envio ao cliente", { executor: "ROBO" }),
];

const gravado = (modelo: string) => m.gravados.find((g) => g.modelo === modelo)?.args;

beforeEach(() => {
  m.ctx = { tenantId: "t1", userId: "u1", role: "SECTOR_ADMIN", sectors: ["societario"], subscriptionReadOnly: false };
  m.niveis = new Set(["ver", "agir", "gerir"]);
  m.tipo = { id: "tipo1", name: "Constituição" };
  m.versoes = [
    { id: "v2", version: 2, published: true },
    { id: "v1", version: 1, published: false },
  ];
  m.passosDaVigente = [{ position: 1, label: "Reunir documentação", description: null, parallelGroup: null, optional: false, organId: null, expectedActor: "PESSOA", items: [] }];
  m.erroAoCriar = null;
  m.gravados = [];
  m.auditoria = [];
});

describe("quem pode e o que é recusado antes de gravar", () => {
  it("quem só age no Societário não publica roteiro: é da coordenação", async () => {
    m.niveis = new Set(["ver", "agir"]);
    expect(await publicarRoteiro({ tipoId: "tipo1", versaoBase: 2, etapas: ROTEIRO })).toEqual({ ok: false, erro: "Só a coordenação do Societário edita os roteiros." });
    expect(m.gravados).toEqual([]);
  });

  it("tipo de outro escritório não é achado", async () => {
    m.tipo = null;
    expect(await publicarRoteiro({ tipoId: "de-fora", versaoBase: 2, etapas: ROTEIRO })).toEqual({ ok: false, erro: "Tipo de processo não encontrado." });
  });

  it("órgão de outro escritório é recusado na etapa", async () => {
    const r = await publicarRoteiro({ tipoId: "tipo1", versaoBase: 2, etapas: [etapa(1, "Viabilidade", { orgaoId: "orgao-de-outro-escritorio" })] });
    expect(r).toMatchObject({ ok: false, indice: 0, campo: "orgao" });
    expect(m.gravados).toEqual([]);
  });

  it("roteiro sem etapa é recusado", async () => {
    expect(await publicarRoteiro({ tipoId: "tipo1", versaoBase: 2, etapas: [] })).toEqual({ ok: false, erro: "O roteiro precisa de pelo menos uma etapa." });
  });

  it("outra pessoa publicou no meio: recusa em vez de passar por cima", async () => {
    m.versoes = [{ id: "v3", version: 3, published: true }, ...m.versoes];
    const r = await publicarRoteiro({ tipoId: "tipo1", versaoBase: 2, etapas: ROTEIRO });
    expect(r).toMatchObject({ ok: false, erro: expect.stringMatching(/^Outra pessoa publicou a versão 3/) });
    expect(m.gravados).toEqual([]);
  });

  it("sem mudança em relação à versão em vigor não cria versão", async () => {
    const r = await publicarRoteiro({ tipoId: "tipo1", versaoBase: 2, etapas: [etapa(1, " Reunir documentação ")] });
    expect(r).toEqual({ ok: false, erro: "Nada mudou em relação à versão 2, que continua em vigor." });
    expect(m.gravados).toEqual([]);
  });

  it("duas publicações ao mesmo tempo: a segunda bate no único de versão e vira mensagem", async () => {
    m.erroAoCriar = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    const r = await publicarRoteiro({ tipoId: "tipo1", versaoBase: 2, etapas: ROTEIRO });
    expect(r).toMatchObject({ ok: false, erro: expect.stringMatching(/^Outra pessoa publicou uma versão/) });
  });
});

describe("a publicação", () => {
  it("cria a versão seguinte publicada, copia etapas e itens e despublica a anterior", async () => {
    expect(await publicarRoteiro({ tipoId: "tipo1", versaoBase: 2, etapas: ROTEIRO })).toEqual({ ok: true, versao: 3 });

    expect(gravado("processTemplate.create")).toEqual({ data: { tenantId: "t1", typeId: "tipo1", version: 3, published: true }, select: { id: true } });

    const passos = (gravado("processTemplateStep.createMany") as { data: Record<string, unknown>[] }).data;
    expect(passos.map((p) => [p.position, p.label, p.parallelGroup, p.organId, p.optional, p.expectedActor])).toEqual([
      [1, "Reunir documentação", null, null, false, "PESSOA"],
      [2, "Bombeiros", "Licenças", "junta", true, "PESSOA"],
      [2, "Vigilância", "Licenças", null, false, "PESSOA"],
      [3, "Envio ao cliente", null, null, false, "ROBO"],
    ]);
    expect(passos.every((p) => p.templateId === "novo-template" && p.tenantId === "t1")).toBe(true);
    // A ordem entre as paralelas fica no `createdAt`, que anda com a lista.
    const quando = passos.map((p) => (p.createdAt as Date).getTime());
    expect(quando).toEqual([...quando].sort((a, b) => a - b));
    expect(new Set(quando).size).toBe(passos.length);

    const itens = (gravado("processTemplateChecklistItem.createMany") as { data: Record<string, unknown>[] }).data;
    expect(itens).toEqual([
      { tenantId: "t1", stepId: passos[0].id, position: 1, label: "RG dos sócios", required: true },
      { tenantId: "t1", stepId: passos[0].id, position: 2, label: "Comprovante de endereço", required: false },
    ]);

    expect(gravado("processTemplate.updateMany")).toEqual({
      where: { tenantId: "t1", typeId: "tipo1", published: true, id: { not: "novo-template" } },
      data: { published: false },
    });
  });

  it("quem publicou fica na auditoria — é de lá que sai o histórico de versões", async () => {
    await publicarRoteiro({ tipoId: "tipo1", versaoBase: 2, etapas: ROTEIRO });
    expect(m.auditoria).toEqual([
      {
        tenantId: "t1",
        userId: "u1",
        action: "societario.roteiro.publicado",
        entityType: "ProcessTemplate",
        entityId: "novo-template",
        metadata: { nome: "Constituição, versão 3", tipo: "Constituição", versao: 3, anterior: 2, etapas: 4 },
      },
    ]);
  });

  it("tipo sem roteiro ganha a versão 1", async () => {
    m.versoes = [];
    expect(await publicarRoteiro({ tipoId: "tipo1", versaoBase: 0, etapas: [etapa(1, "Reunir documentação")] })).toEqual({ ok: true, versao: 1 });
    expect(gravado("processTemplateChecklistItem.createMany")).toBeUndefined();
    expect(m.auditoria[0]).toMatchObject({ metadata: { anterior: null, versao: 1 } });
  });
});
