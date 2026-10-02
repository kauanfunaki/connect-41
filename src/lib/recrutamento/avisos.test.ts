import { beforeEach, describe, expect, it, vi } from "vitest";

// Banco, notificações e módulos simulados: o que se testa é PARA QUEM o aviso
// vai, não a gravação.
const usuarios = { count: vi.fn(), findMany: vi.fn() };
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ user: usuarios }) }));
const notifySector = vi.fn();
const notifyUser = vi.fn();
vi.mock("@/lib/notifications", () => ({ notifySector: (...a: unknown[]) => notifySector(...a), notifyUser: (...a: unknown[]) => notifyUser(...a) }));
const setorDoModulo = vi.fn();
vi.mock("@/lib/modules", () => ({ setorDoModulo: (...a: unknown[]) => setorDoModulo(...a) }));

const { avisarORecrutamento, avisarSobreAVaga, setorDoRecrutamento } = await import("./avisos");

const aviso = { tenantId: "t1", type: "NEW_APPLICATION", message: "Nova candidatura" };

beforeEach(() => {
  vi.clearAllMocks();
  setorDoModulo.mockResolvedValue("recrutamento");
});

describe("avisos do Recrutamento", () => {
  it("vaga com responsável: só ele", async () => {
    await avisarSobreAVaga({ responsibleUserId: "u9" }, aviso);
    expect(notifyUser).toHaveBeenCalledWith("u9", aviso);
    expect(notifySector).not.toHaveBeenCalled();
  });

  it("sem responsável: o setor que opera o recrutamento, não o que contrata", async () => {
    usuarios.count.mockResolvedValue(3);
    await avisarSobreAVaga({ responsibleUserId: null }, aviso);
    expect(notifySector).toHaveBeenCalledWith("recrutamento", aviso);
  });

  it("o setor que opera vem do módulo — cliente em que o RH opera as vagas", async () => {
    setorDoModulo.mockResolvedValue("rh");
    expect(await setorDoRecrutamento("t1")).toBe("rh");
    expect(setorDoModulo).toHaveBeenCalledWith("t1", "recrutamento_vagas");
  });

  it("setor sem ninguém: vai aos administradores, e não se perde", async () => {
    usuarios.count.mockResolvedValue(0);
    usuarios.findMany.mockResolvedValue([{ id: "a1" }, { id: "a2" }]);
    await avisarORecrutamento(aviso);
    expect(notifySector).not.toHaveBeenCalled();
    expect(notifyUser).toHaveBeenCalledTimes(2);
    expect(usuarios.findMany.mock.calls[0][0].where.role).toBe("ADMIN");
  });

  it("conversa do WhatsApp sem vaga usa o setor do módulo do WhatsApp", async () => {
    usuarios.count.mockResolvedValue(1);
    await avisarORecrutamento(aviso, "recrutamento_whatsapp");
    expect(setorDoModulo).toHaveBeenCalledWith("t1", "recrutamento_whatsapp");
  });
});
