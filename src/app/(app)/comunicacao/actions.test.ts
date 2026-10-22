import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONVERSA_SO_PARA_CONSULTA } from "@/lib/financeiro/comunicacao/regras";

// A conversa virou histórico (22/10/2026): com as Solicitações ligadas, nem a
// equipe nem o cliente escrevem mais nela — a ação recusa antes de gravar.
// Com elas desligadas, segue como antes.

const m = vi.hoisted(() => ({
  ligados: new Set<string>(),
  db: { company: { findFirst: vi.fn() }, $transaction: vi.fn() },
  cliente: { tenantId: "t", portalUserId: "p", companyIds: ["c1"], modulos: new Set<string>() } as {
    tenantId: string;
    portalUserId: string;
    companyIds: string[];
    modulos: Set<string>;
  } | null,
}));

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/auth/context", async () => ({
  ...(await import("@/lib/auth/papeis")),
  getAuthContext: async () => ({ tenantId: "t", userId: "u", role: "ADMIN", sectors: [], subscriptionReadOnly: false }),
}));
vi.mock("@/lib/modules", () => ({
  isModuleEnabled: async (_t: string, code: string) => m.ligados.has(code),
  setoresDoModulo: async () => ["bpo"],
  setorDoModulo: async () => "bpo",
}));
vi.mock("@/app/(portal)/usuario", () => ({ clienteAtivoDoPortal: async () => m.cliente }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/notifications", () => ({ notifySector: vi.fn() }));
vi.mock("@/lib/email/sendMail", () => ({ sendMensagemAoClienteEmail: vi.fn() }));
vi.mock("@/lib/portal/avisos", () => ({ avisarClientePorPush: vi.fn() }));
vi.mock("@/lib/financeiro/pendencias/avisos", () => ({ usuariosDoPortalDaEmpresa: vi.fn(async () => []) }));

const { enviarMensagemEquipe } = await import("./actions");
const { enviarMensagemCliente } = await import("@/app/(portal)/portal/(area)/comunicacao/actions");

function formulario() {
  const f = new FormData();
  f.set("companyId", "c1");
  f.set("body", "Segue o extrato.");
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.ligados = new Set(["bpo_comunicacao"]);
  m.cliente = { tenantId: "t", portalUserId: "p", companyIds: ["c1"], modulos: new Set(["bpo_comunicacao"]) };
  // A empresa não é achada: basta para provar que a ação passou da trava.
  m.db.company.findFirst.mockResolvedValue(null);
});

describe("equipe", () => {
  it("com as Solicitações ligadas, recusa sem tocar no banco", async () => {
    m.ligados.add("portal_solicitacoes");
    expect(await enviarMensagemEquipe(formulario())).toEqual({ error: CONVERSA_SO_PARA_CONSULTA.equipe });
    expect(m.db.company.findFirst).not.toHaveBeenCalled();
  });

  it("sem as Solicitações, segue como antes", async () => {
    expect(await enviarMensagemEquipe(formulario())).toEqual({ error: "Empresa não encontrada." });
    expect(m.db.company.findFirst).toHaveBeenCalled();
  });
});

describe("cliente", () => {
  it("com as Solicitações ligadas, recusa sem tocar no banco", async () => {
    m.cliente!.modulos.add("portal_solicitacoes");
    expect(await enviarMensagemCliente(formulario())).toEqual({ error: CONVERSA_SO_PARA_CONSULTA.cliente });
    expect(m.db.company.findFirst).not.toHaveBeenCalled();
  });

  it("sem as Solicitações, segue como antes", async () => {
    expect(await enviarMensagemCliente(formulario())).toEqual({ error: "Empresa não encontrada." });
    expect(m.db.company.findFirst).toHaveBeenCalled();
  });
});
