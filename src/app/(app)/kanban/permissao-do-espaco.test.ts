import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";
import type { PermissaoDoEspaco } from "@/lib/kanban/permissaoDoEspaco";

// A permissão padrão do espaço (05/11/2026) nas ações de verdade: cada papel e
// cada nível chamam as ações dos Quadros, e o teste olha se a gravação chegou
// ao banco. O banco é um Proxy que anota as chamadas e devolve um registro que
// passa nas conferências de escopo (o mesmo jeito de `exclusao-so-admin.test.ts`)
// — assim só a regra de quem pode decide.

type Chamada = { modelo: string; op: string; args: unknown };
const chamadas: Chamada[] = [];
let nivel: PermissaoDoEspaco = "EDITAR";

const registro = () => ({
  id: "r1",
  tenantId: "t1",
  sectorCode: "setor",
  spaceId: "s1",
  pipelineId: "pl1",
  folderId: null,
  parentItemId: null,
  stageId: "st0",
  userId: "outra-pessoa",
  name: "Registro",
  title: "Registro",
  description: null,
  color: "#586577",
  icon: null,
  defaultPermission: nivel,
  isTerminal: false,
  type: "NOT_STARTED",
});

function modelo(nome: string): unknown {
  return new Proxy(
    {},
    {
      get: (_, op) => {
        if (op === "then" || typeof op !== "string") return undefined;
        return async (args: unknown) => {
          chamadas.push({ modelo: nome, op, args });
          if (op === "findMany") return [];
          if (op === "count") return 0;
          if (op === "deleteMany" || op === "updateMany") return { count: 1 };
          return registro();
        };
      },
    },
  );
}

const prisma: unknown = new Proxy(
  {},
  {
    get: (_, nome) => {
      if (nome === "then" || typeof nome !== "string") return undefined;
      if (nome === "$transaction") {
        return async (x: unknown) => (typeof x === "function" ? x(prisma) : Promise.all(x as Promise<unknown>[]));
      }
      // A trava e o último número do endereço curto (10/11/2026): nenhum.
      if (nome === "$queryRaw") return async () => [];
      return modelo(nome);
    },
  },
);

// As ações do Kanban chegam a módulos `server-only` (exclusão de atividade, SPED local).
vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notifyUser: vi.fn() }));

const ctx = {
  userId: "eu",
  tenantId: "t1",
  homeTenantId: "t1",
  role: "SECTOR_USER" as UserRole,
  sectors: ["setor"],
  subscriptionReadOnly: false,
  canSelfRegularizeSubscription: false,
  activeSector: null,
};
vi.mock("@/lib/auth/context", async () => ({
  ...(await vi.importActual<typeof import("@/lib/auth/papeis")>("@/lib/auth/papeis")),
  getAuthContext: async () => ctx,
  scopedSectors: () => null,
}));

const kanban = await import("./actions");
const espacos = await import("./spaces-actions");

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

const gravou = (modeloDoBanco: string, op: string) => chamadas.some((c) => c.modelo === modeloDoBanco && c.op === op);

/** Cada gesto, com o que ele grava quando passa. */
const gestos = {
  criarTarefa: async () => {
    await kanban.criarTarefaRapida("pl1", "st0", "Conferir extrato");
    return gravou("pipelineItem", "create");
  },
  editarTarefa: async () => {
    await kanban.atualizarDescricao("pl1", "i1", null, form({ description: "<p>Ver com o cliente</p>" }));
    return gravou("pipelineItem", "update");
  },
  comentar: async () => {
    await kanban.adicionarNota("pl1", "i1", null, form({ content: "Pedi o extrato" }));
    return gravou("activity", "create");
  },
  criarLista: async () => {
    await espacos.criarListaSimples("s1", null, null, form({ name: "Conciliações" }));
    return gravou("pipeline", "create");
  },
  criarPasta: async () => {
    await espacos.criarPasta("s1", null, form({ name: "Simples" }));
    return gravou("folder", "create");
  },
  gerenciarEspaco: async () => {
    await espacos.editarEspaco("s1", null, form({ name: "BPO", defaultPermission: "EXIBIR" }));
    return gravou("space", "update");
  },
  criarEspaco: async () => {
    await espacos.criarEspaco("setor", null, form({ name: "Fechamento" }));
    return gravou("space", "create");
  },
};
type Gesto = keyof typeof gestos;

async function pode(gesto: Gesto): Promise<boolean> {
  chamadas.length = 0;
  return gestos[gesto]();
}

beforeEach(() => {
  chamadas.length = 0;
  ctx.role = "SECTOR_USER";
  ctx.sectors = ["setor"];
  ctx.subscriptionReadOnly = false;
  nivel = "EDITAR";
});

// O que o colaborador do setor consegue em cada nível.
const doColaborador: Record<PermissaoDoEspaco, Record<Gesto, boolean>> = {
  TOTAL: { criarTarefa: true, editarTarefa: true, comentar: true, criarLista: true, criarPasta: true, gerenciarEspaco: false, criarEspaco: false },
  EDITAR: { criarTarefa: true, editarTarefa: true, comentar: true, criarLista: true, criarPasta: false, gerenciarEspaco: false, criarEspaco: false },
  COMENTAR: { criarTarefa: false, editarTarefa: false, comentar: true, criarLista: false, criarPasta: false, gerenciarEspaco: false, criarEspaco: false },
  EXIBIR: { criarTarefa: false, editarTarefa: false, comentar: false, criarLista: false, criarPasta: false, gerenciarEspaco: false, criarEspaco: false },
};

describe("o colaborador do setor segue a permissão padrão do espaço", () => {
  for (const [p, esperado] of Object.entries(doColaborador) as [PermissaoDoEspaco, Record<Gesto, boolean>][]) {
    it.each(Object.entries(esperado) as [Gesto, boolean][])(`${p}: %s → %s`, async (gesto, deve) => {
      nivel = p;
      expect(await pode(gesto)).toBe(deve);
    });
  }
});

describe("coordenação e administração não dependem do nível", () => {
  for (const role of ["SECTOR_ADMIN", "ADMIN", "SUPER_ADMIN"] as const) {
    it.each(Object.keys(gestos) as Gesto[])(`${role} em "Apenas exibição": %s`, async (gesto) => {
      ctx.role = role;
      nivel = "EXIBIR";
      expect(await pode(gesto)).toBe(true);
    });
  }
});

describe("quem só vê", () => {
  it.each(Object.keys(gestos) as Gesto[])("a Diretoria (somente leitura) não grava nada, nem em Edição total: %s", async (gesto) => {
    ctx.role = "READONLY";
    ctx.sectors = [];
    nivel = "TOTAL";
    expect(await pode(gesto)).toBe(false);
  });

  it.each(Object.keys(gestos) as Gesto[])("o colaborador de outro setor não grava nada: %s", async (gesto) => {
    ctx.sectors = ["outro"];
    nivel = "TOTAL";
    expect(await pode(gesto)).toBe(false);
  });
});

describe("excluir continua só com o administrador, em qualquer nível", () => {
  const apagou = () => chamadas.some((c) => c.op === "delete" || c.op === "deleteMany");
  const exclusoes = [
    ["tarefa", () => kanban.excluirItem("pl1", "i1")],
    ["lista", () => espacos.excluirLista("pl1")],
    ["pasta", () => espacos.excluirPasta("f1")],
    ["espaço", () => espacos.excluirEspaco("s1")],
  ] as const;

  it.each(exclusoes)("o colaborador em Edição total não exclui %s", async (_, chamar) => {
    nivel = "TOTAL";
    chamadas.length = 0;
    await chamar();
    expect(apagou()).toBe(false);
  });

  it.each(exclusoes)("o coordenador não exclui %s", async (_, chamar) => {
    ctx.role = "SECTOR_ADMIN";
    chamadas.length = 0;
    await chamar();
    expect(apagou()).toBe(false);
  });
});

describe("a janela do espaço", () => {
  it("grava a permissão escolhida; sem escolha válida, a padrão (Editar)", async () => {
    ctx.role = "SECTOR_ADMIN";
    await pode("criarEspaco");
    const dataDoEspaco = () => (chamadas.find((c) => c.modelo === "space" && c.op === "create")?.args as { data: { defaultPermission: string } }).data;
    expect(dataDoEspaco().defaultPermission).toBe("EDITAR");

    chamadas.length = 0;
    await espacos.criarEspaco("setor", null, form({ name: "Fechamento", defaultPermission: "COMENTAR", icon: "recibo", color: "#7C5CBF" }));
    expect(dataDoEspaco()).toMatchObject({ defaultPermission: "COMENTAR", icon: "recibo", color: "#7C5CBF" });

    chamadas.length = 0;
    await espacos.criarEspaco("setor", null, form({ name: "Fechamento", defaultPermission: "DONO", icon: "foguete", color: "vermelho" }));
    expect(dataDoEspaco()).toMatchObject({ defaultPermission: "EDITAR", icon: null, color: "#586577" });
  });

  it("com modelo, o espaço nasce com as listas e as colunas do modelo", async () => {
    ctx.role = "SECTOR_ADMIN";
    chamadas.length = 0;
    await espacos.criarEspaco("setor", null, form({ name: "Fechamento", modelo: "fechamento" }));
    const listas = chamadas.filter((c) => c.modelo === "pipeline" && c.op === "create");
    expect(listas.map((c) => (c.args as { data: { name: string } }).data.name)).toEqual(["Conciliações", "Apuração de impostos", "Entrega ao cliente"]);
    const colunas = (listas[0].args as { data: { stages: { create: { name: string; isTerminal: boolean }[] } } }).data.stages.create;
    expect(colunas.at(-1)).toMatchObject({ name: "Concluído", isTerminal: true });
    expect(colunas.filter((c) => c.isTerminal)).toHaveLength(1);
  });

  it("modelo desconhecido cria o espaço em branco", async () => {
    ctx.role = "SECTOR_ADMIN";
    chamadas.length = 0;
    await espacos.criarEspaco("setor", null, form({ name: "Fechamento", modelo: "nao-existe" }));
    expect(gravou("space", "create")).toBe(true);
    expect(gravou("pipeline", "create")).toBe(false);
  });
});
