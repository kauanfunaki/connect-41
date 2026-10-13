import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";

// Horas do processo (13/10/2026): cada um corrige o próprio lançamento pelo
// "Editar"; apagar ficou só com o administrador — de qualquer pessoa.

const process = { findFirst: vi.fn() };
const timeEntry = { updateMany: vi.fn(), deleteMany: vi.fn() };
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ process, timeEntry }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/modules", () => ({ setorDoModulo: vi.fn(async () => "societario") }));

const ctx = {
  userId: "eu",
  tenantId: "t1",
  homeTenantId: "t1",
  role: "SECTOR_USER" as UserRole,
  sectors: ["societario"],
  subscriptionReadOnly: false,
  canSelfRegularizeSubscription: false,
  activeSector: null,
};
vi.mock("@/lib/auth/context", async () => ({
  ...(await vi.importActual<typeof import("@/lib/auth/papeis")>("@/lib/auth/papeis")),
  getAuthContext: async () => ctx,
}));

const { editarHorasDoProcesso, apagarHorasDoProcesso } = await import("./horas-actions");

const form = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  ctx.role = "SECTOR_USER";
  process.findFirst.mockResolvedValue({ id: "pr1", activeTimerUserId: null, activeTimerStartedAt: null });
  timeEntry.updateMany.mockResolvedValue({ count: 1 });
  timeEntry.deleteMany.mockResolvedValue({ count: 1 });
});

describe("editarHorasDoProcesso", () => {
  it("corrige só o lançamento da própria pessoa", async () => {
    const r = await editarHorasDoProcesso("pr1", "te1", null, form({ horas: "2", minutos: "15", dia: "", nota: "protocolo" }));
    expect(r).toEqual({ ok: true });
    expect(timeEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "te1", processId: "pr1", tenantId: "t1", userId: "eu" },
      data: { minutes: 135, note: "protocolo" },
    });
  });

  it("lançamento de outra pessoa não é achado", async () => {
    timeEntry.updateMany.mockResolvedValue({ count: 0 });
    expect(await editarHorasDoProcesso("pr1", "te1", null, form({ horas: "1" }))).toEqual({ error: "Lançamento não encontrado." });
  });

  it("Somente leitura não corrige", async () => {
    ctx.role = "READONLY";
    expect(await editarHorasDoProcesso("pr1", "te1", null, form({ horas: "1" }))).toEqual({ error: "Processo não encontrado." });
    expect(timeEntry.updateMany).not.toHaveBeenCalled();
  });
});

describe("apagarHorasDoProcesso", () => {
  it("colaborador e gestor não apagam, nem o próprio", async () => {
    for (const role of ["SECTOR_USER", "SECTOR_ADMIN"] as const) {
      ctx.role = role;
      expect(await apagarHorasDoProcesso("pr1", "te1")).toEqual({ error: "Só o Administrador ou o Super Admin pode excluir." });
    }
    expect(timeEntry.deleteMany).not.toHaveBeenCalled();
  });

  it("o administrador apaga o de qualquer pessoa", async () => {
    ctx.role = "ADMIN";
    expect(await apagarHorasDoProcesso("pr1", "te1")).toEqual({ ok: true });
    expect(timeEntry.deleteMany).toHaveBeenCalledWith({ where: { id: "te1", processId: "pr1", tenantId: "t1" } });
  });
});
