import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// As contas da Home no banco (13/11/2026, melhoria-662), por perfil: o
// alcance de quem vê vai para dentro de cada consulta; nada de linha a linha.
type Pedido = { modelo: string; metodo: string; args: Record<string, unknown> };
const banco = vi.hoisted(() => ({
  pedidos: [] as Pedido[],
  porColuna: [] as Record<string, unknown>[],
  atrasadas: [] as Record<string, unknown>[],
  contagens: [] as number[],
  quadros: [] as Record<string, unknown>[],
  colunas: [] as Record<string, unknown>[],
  listas: [] as Record<string, unknown>[][],
  porDia: [] as Record<string, unknown>[],
}));
vi.mock("@/lib/prisma", () => {
  const anota = (modelo: string, metodo: string, resposta: (args: Record<string, unknown>) => unknown) =>
    vi.fn(async (args: Record<string, unknown>) => {
      banco.pedidos.push({ modelo, metodo, args });
      return resposta(args);
    });
  return {
    getPrisma: () => ({
      pipelineItem: {
        groupBy: anota("pipelineItem", "groupBy", (a) => ((a.by as string[]).length === 2 ? banco.porColuna : banco.atrasadas)),
        count: anota("pipelineItem", "count", () => banco.contagens.shift() ?? 0),
        findMany: anota("pipelineItem", "findMany", () => banco.listas.shift() ?? []),
      },
      pipeline: { findMany: anota("pipeline", "findMany", () => banco.quadros) },
      pipelineStage: { findMany: anota("pipelineStage", "findMany", () => banco.colunas) },
      $queryRaw: vi.fn(async (partes: TemplateStringsArray, ...valores: unknown[]) => {
        banco.pedidos.push({ modelo: "$queryRaw", metodo: "sql", args: { sql: partes.join("?"), valores } });
        return banco.porDia;
      }),
    }),
  };
});

const { atividadesPorDia, contarTarefasDaHome, tarefasDoMeuDia } = await import("./tarefasDaHome");

function ctx(role: AuthContext["role"], sectors: string[], extra: Partial<AuthContext> = {}): AuthContext {
  return { userId: "eu", tenantId: "t1", homeTenantId: "t1", role, sectors, subscriptionReadOnly: false, canSelfRegularizeSubscription: true, activeSector: null, ...extra };
}
const HOJE = new Date("2026-11-13T03:00:00Z");
const FIM = new Date("2026-11-14T02:59:59.999Z");
const dia = (n: number) => new Date(HOJE.getTime() + n * 86_400_000);

beforeEach(() => {
  banco.pedidos = [];
  banco.porColuna = [
    { pipelineId: "q1", stageId: "s1", _count: { _all: 5 } },
    { pipelineId: "q1", stageId: "s2", _count: { _all: 2 } },
    { pipelineId: "q2", stageId: "s3", _count: { _all: 4 } },
  ];
  banco.atrasadas = [{ pipelineId: "q1", _count: { _all: 3 } }];
  banco.contagens = [1, 2, 6]; // hoje, sem prazo, atribuídas
  banco.quadros = [
    { id: "q1", name: "Folha", sectorCode: "dp" },
    { id: "q2", name: "Apuração", sectorCode: "fiscal" },
  ];
  banco.colunas = [
    { id: "s1", name: "A fazer", color: "#111" },
    { id: "s2", name: "Fazendo", color: null },
    { id: "s3", name: "A fazer", color: "#222" },
  ];
  banco.listas = [];
  banco.porDia = [];
});

const ondeDosCards = () => banco.pedidos.filter((p) => p.modelo === "pipelineItem").map((p) => p.args.where as Record<string, unknown>);

describe("as contas da Home, no banco", () => {
  it("total, faixas, por setor e o gráfico saem das contagens", async () => {
    const c = await contarTarefasDaHome(ctx("ADMIN", []), HOJE, FIM);
    expect(c.total).toBe(11);
    expect(c.porFaixa).toEqual({ atrasada: 3, hoje: 1, sem_prazo: 2, adiante: 5 });
    expect(c.atribuidas).toBe(6);
    expect(Object.fromEntries(c.porSetor)).toEqual({ dp: { abertas: 7, atrasadas: 3 }, fiscal: { abertas: 4, atrasadas: 0 } });
    expect(c.colunas.map((x) => [x.key, x.value, x.sublabel, x.color])).toEqual([
      ["q1::A fazer", 5, "Folha", "#111"],
      ["q2::A fazer", 4, "Apuração", "#222"],
      ["q1::Fazendo", 2, "Folha", "#586577"],
    ]);
    // Nenhuma consulta traz cards linha a linha.
    expect(banco.pedidos.some((p) => p.modelo === "pipelineItem" && p.metodo === "findMany")).toBe(false);
  });

  it("o usuário comum do setor conta só os quadros do setor dele", async () => {
    await contarTarefasDaHome(ctx("SECTOR_USER", ["bpo"]), HOJE, FIM);
    for (const onde of ondeDosCards()) expect(onde.pipeline).toEqual({ tenantId: "t1", sectorCode: { in: ["bpo"] } });
  });

  it("o coordenador com setor ativo conta só o setor ativo", async () => {
    await contarTarefasDaHome(ctx("SECTOR_ADMIN", ["dp", "fiscal"], { activeSector: "dp" }), HOJE, FIM);
    for (const onde of ondeDosCards()) expect(onde.pipeline).toEqual({ tenantId: "t1", sectorCode: { in: ["dp"] } });
  });

  it("as faixas de prazo são as de antes: atrasada antes de hoje, hoje até o fim do dia", async () => {
    await contarTarefasDaHome(ctx("ADMIN", []), HOJE, FIM);
    const onde = ondeDosCards();
    expect(onde).toContainEqual(expect.objectContaining({ dueDate: { lt: HOJE } }));
    expect(onde).toContainEqual(expect.objectContaining({ dueDate: { gte: HOJE, lte: FIM } }));
    expect(onde).toContainEqual(expect.objectContaining({ dueDate: null }));
    expect(onde).toContainEqual(expect.objectContaining({ assignees: { some: { userId: "eu" } } }));
    for (const o of onde) expect(o.stage).toEqual({ isTerminal: false });
  });
});

describe("o Meu dia da Home", () => {
  const card = (id: string, dueDate: Date | null, minha: boolean, createdAt = dia(-30)) => ({ id, dueDate, createdAt, assignees: minha ? [{ userId: "eu" }] : [] });

  it("prazo mais perto primeiro; no mesmo prazo, o da pessoa antes; depois os dela sem prazo", async () => {
    banco.listas = [
      [card("m1", dia(1), true), card("m2", dia(3), true)], // da pessoa, com prazo
      [card("o1", dia(-2), false), card("o2", dia(1), false), card("m1", dia(1), true)], // todos com prazo
      [card("s1", null, true, dia(-1)), card("s2", null, true, dia(-5))], // da pessoa, sem prazo
    ];
    const r = await tarefasDoMeuDia(ctx("SECTOR_USER", ["dp"]));
    expect(r.map((i) => i.id)).toEqual(["o1", "m1", "o2", "m2", "s1", "s2"]);
  });

  it("para em oito", async () => {
    banco.listas = [[], Array.from({ length: 8 }, (_, i) => card(`c${i}`, dia(i), false)), [card("s1", null, true)]];
    expect(await tarefasDoMeuDia(ctx("ADMIN", []))).toHaveLength(8);
  });

  it("sem usuário, só os com prazo, e nenhuma consulta de atribuídos", async () => {
    banco.listas = [[card("o1", dia(0), false)]];
    const r = await tarefasDoMeuDia(ctx("READONLY", [], { userId: "" }));
    expect(r.map((i) => i.id)).toEqual(["o1"]);
    expect(banco.pedidos.filter((p) => p.metodo === "findMany")).toHaveLength(1);
  });
});

describe("as atividades por dia", () => {
  it("contam no banco, nos quadros do alcance, por dia de São Paulo", async () => {
    banco.quadros = [{ id: "q1" }, { id: "q2" }];
    banco.porDia = [
      { dia: "12/11", n: BigInt(7) },
      { dia: "13/11", n: 2 },
    ];
    const r = await atividadesPorDia(ctx("SECTOR_USER", ["dp"]), dia(-14));
    expect(Object.fromEntries(r)).toEqual({ "12/11": 7, "13/11": 2 });
    const quadros = banco.pedidos.find((p) => p.modelo === "pipeline")!;
    expect(quadros.args.where).toEqual({ tenantId: "t1", sectorCode: { in: ["dp"] } });
    const sql = banco.pedidos.find((p) => p.modelo === "$queryRaw")!.args.sql as string;
    expect(sql).toContain("INTERVAL 3 HOUR");
    expect(sql).toContain("GROUP BY dia");
  });

  it("quem não tem quadro no alcance não consulta o histórico", async () => {
    banco.quadros = [];
    expect((await atividadesPorDia(ctx("SECTOR_USER", []), dia(-14))).size).toBe(0);
    expect(banco.pedidos.some((p) => p.modelo === "$queryRaw")).toBe(false);
  });
});
