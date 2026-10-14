import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";

// Edição no próprio bloco da ficha do candidato (14/10/2026): a mesma
// permissão do "Editar tudo" (gerir o Recrutamento), o escritório em toda
// consulta, a validação do formulário inteiro e só os campos do bloco no banco.
// A regra de papel roda de verdade (`podeNoModulo` → `canManageSector`); só o
// banco e o módulo ligado são de mentira.

type Chamada = { modelo: string; op: string; args: Record<string, unknown> };
const chamadas: Chamada[] = [];
let pessoaExiste = true;
let erroNoUpdate: unknown = null;

const prisma = new Proxy(
  {},
  {
    get: (_, modelo) => {
      if (typeof modelo !== "string" || modelo === "then") return undefined;
      return new Proxy(
        {},
        {
          get: (__, op) => {
            if (typeof op !== "string" || op === "then") return undefined;
            return async (args: Record<string, unknown>) => {
              chamadas.push({ modelo, op, args });
              if (op === "findFirst") return pessoaExiste ? { id: "p1" } : null;
              if (op === "update" && erroNoUpdate) throw erroNoUpdate;
              return {};
            };
          },
        }
      );
    },
  }
);

vi.mock("@/lib/prisma", () => ({ getPrisma: () => prisma }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/modules", () => ({
  setorDoModulo: vi.fn(async () => "recrutamento"),
  isModuleEnabled: vi.fn(async () => true),
}));

const ctx = {
  userId: "eu",
  tenantId: "t1",
  homeTenantId: "t1",
  role: "SECTOR_ADMIN" as UserRole,
  sectors: ["recrutamento"],
  subscriptionReadOnly: false,
  canSelfRegularizeSubscription: false,
  activeSector: null,
};
vi.mock("@/lib/auth/context", async () => ({
  ...(await vi.importActual<typeof import("@/lib/auth/papeis")>("@/lib/auth/papeis")),
  getAuthContext: async () => ctx,
}));

const { salvarSecaoDoCandidato } = await import("./ficha-actions");

function formulario(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

const atualizou = () => chamadas.filter((c) => c.modelo === "person" && c.op === "update");

beforeEach(() => {
  chamadas.length = 0;
  pessoaExiste = true;
  erroNoUpdate = null;
  Object.assign(ctx, { tenantId: "t1", role: "SECTOR_ADMIN", sectors: ["recrutamento"], subscriptionReadOnly: false });
});

describe("salvar um bloco da ficha do candidato", () => {
  it("grava só os campos do bloco, na pessoa do escritório", async () => {
    const r = await salvarSecaoDoCandidato(
      "p1",
      "contato",
      null,
      formulario({ email: "ana@exemplo.test", phone: "(41) 99999-0000", name: "", cpf: "000", type: "COLABORADOR", tenantId: "t2" })
    );
    expect(r).toMatchObject({ ok: true });
    expect(chamadas.find((c) => c.op === "findFirst")?.args).toEqual({
      where: { id: "p1", tenantId: "t1", type: "CANDIDATO" },
      select: { id: true },
    });
    expect(atualizou()).toHaveLength(1);
    expect(atualizou()[0].args).toEqual({ where: { id: "p1" }, data: { email: "ana@exemplo.test", phone: "(41) 99999-0000" } });
  });

  it("de outro escritório (ou que não é candidato): não encontrado, nada gravado", async () => {
    pessoaExiste = false;
    expect(await salvarSecaoDoCandidato("p1", "endereco", null, formulario({ city: "Curitiba" }))).toEqual({ error: "Candidato não encontrado." });
    expect(atualizou()).toEqual([]);
  });

  it("valida como o formulário inteiro e não toca no banco", async () => {
    expect(await salvarSecaoDoCandidato("p1", "identificacao", null, formulario({ name: "Ana", cpf: "111.111.111-11" }))).toEqual({ error: "CPF inválido." });
    expect(await salvarSecaoDoCandidato("p1", "identificacao", null, formulario({ name: "" }))).toEqual({ error: "Nome é obrigatório." });
    expect(await salvarSecaoDoCandidato("p1", "contato", null, formulario({ email: "ana@" }))).toEqual({ error: "E-mail inválido." });
    expect(chamadas).toEqual([]);
  });

  it("CPF de outra pessoa: a mesma mensagem do Editar tudo", async () => {
    erroNoUpdate = Object.assign(new Error("unique"), { code: "P2002" });
    expect(await salvarSecaoDoCandidato("p1", "identificacao", null, formulario({ name: "Ana", cpf: "529.982.247-25" }))).toEqual({
      error: "Já existe uma pessoa cadastrada com este CPF.",
    });
  });

  it("bloco desconhecido é recusado", async () => {
    expect(await salvarSecaoDoCandidato("p1", "tudo" as never, null, formulario({ name: "Ana" }))).toEqual({ error: "Bloco da ficha desconhecido." });
    expect(chamadas).toEqual([]);
  });
});

describe("quem pode editar: o mesmo de hoje (gerir o Recrutamento)", () => {
  const casos: [string, Partial<typeof ctx>, boolean][] = [
    ["gestor do Recrutamento", { role: "SECTOR_ADMIN", sectors: ["recrutamento"] }, true],
    ["administrador", { role: "ADMIN", sectors: [] }, true],
    ["usuário do Recrutamento", { role: "SECTOR_USER", sectors: ["recrutamento"] }, false],
    ["gestor de outro setor", { role: "SECTOR_ADMIN", sectors: ["dp"] }, false],
    ["somente leitura", { role: "READONLY", sectors: ["recrutamento"] }, false],
    ["administrador com a assinatura em somente leitura", { role: "ADMIN", subscriptionReadOnly: true }, false],
  ];

  it.each(casos)("%s", async (_, perfil, pode) => {
    Object.assign(ctx, perfil);
    const r = await salvarSecaoDoCandidato("p1", "contato", null, formulario({ phone: "41 99999-0000" }));
    if (pode) {
      expect(r).toMatchObject({ ok: true });
      expect(atualizou()).toHaveLength(1);
    } else {
      expect(r).toEqual({ error: "Sem permissão para editar candidatos." });
      expect(chamadas).toEqual([]);
    }
  });

  it("sem escritório: não autenticado", async () => {
    ctx.tenantId = "";
    expect(await salvarSecaoDoCandidato("p1", "contato", null, formulario({}))).toEqual({ error: "Não autenticado" });
    expect(chamadas).toEqual([]);
  });
});
