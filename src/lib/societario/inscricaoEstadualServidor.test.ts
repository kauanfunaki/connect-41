import { beforeEach, describe, expect, it, vi } from "vitest";

// A gravação da situação da IE (robô do Societário, 30/10/2026), sobre o banco
// falso dos testes do Serpro: nada vai ao MySQL.

const m = await vi.hoisted(async () => {
  const { tabela } = await import("@/lib/serpro/teste.fixture");
  return {
    company: tabela({ displayName: null, stateRegistrationStatus: null, stateRegistrationCheckedAt: null, stateRegistrationChangedAt: null }),
    notifySector: vi.fn(),
    logAudit: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ company: m.company }) }));
vi.mock("@/lib/notifications", () => ({ notifySector: m.notifySector }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));

const { empresasParaVigiarIE, registrarSituacaoDaIE } = await import("./inscricaoEstadualServidor");

const TENANT = "tenant-1";
const LIDA = new Date("2026-10-30T12:00:00Z");
const linha = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  tenantId: TENANT,
  name: `Empresa ${id}`,
  status: "ACTIVE",
  stateCode: "PR",
  stateRegistration: "1234567890",
  displayName: null,
  stateRegistrationStatus: null,
  stateRegistrationCheckedAt: null,
  stateRegistrationChangedAt: null,
  ...extra,
});
const empresa = (id: string) => m.company.linhas.find((l) => l.id === id)!;

beforeEach(() => {
  m.company.zerar();
  vi.clearAllMocks();
});

describe("registrarSituacaoDaIE", () => {
  it("a primeira leitura ativa grava sem avisar", async () => {
    m.company.linhas.push(linha("a"));
    const r = await registrarSituacaoDaIE({ tenantId: TENANT, companyId: "a", texto: "ATIVO", lidaEm: LIDA });
    expect(r).toEqual({ tipo: "mudou", de: null, para: "ATIVA", avisou: false });
    expect(empresa("a")).toMatchObject({ stateRegistrationStatus: "ATIVA", stateRegistrationCheckedAt: LIDA, stateRegistrationChangedAt: LIDA });
    expect(m.notifySector).not.toHaveBeenCalled();
  });

  it("sair de ativa avisa o Societário, com a empresa no aviso", async () => {
    m.company.linhas.push(linha("a", { displayName: "Apelido", stateRegistrationStatus: "ATIVA" }));
    const r = await registrarSituacaoDaIE({ tenantId: TENANT, companyId: "a", texto: "SUSPENSO", lidaEm: LIDA });
    expect(r).toEqual({ tipo: "mudou", de: "ATIVA", para: "SUSPENSA", avisou: true });
    expect(m.notifySector).toHaveBeenCalledWith("societario", expect.objectContaining({
      type: "IE_SITUACAO_MUDOU",
      message: "Inscrição estadual de Apelido passou de ativa para suspensa",
      entityType: "COMPANY",
      entityId: "a",
    }));
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "company.ie_situacao", metadata: expect.objectContaining({ de: "ATIVA", para: "SUSPENSA" }) }));
  });

  it("a mesma situação só marca a hora da leitura", async () => {
    const antes = new Date("2026-10-01T12:00:00Z");
    m.company.linhas.push(linha("a", { stateRegistrationStatus: "SUSPENSA", stateRegistrationChangedAt: antes }));
    const r = await registrarSituacaoDaIE({ tenantId: TENANT, companyId: "a", texto: "Suspensa", lidaEm: LIDA });
    expect(r).toEqual({ tipo: "igual", situacao: "SUSPENSA" });
    expect(empresa("a")).toMatchObject({ stateRegistrationCheckedAt: LIDA, stateRegistrationChangedAt: antes });
    expect(m.notifySector).not.toHaveBeenCalled();
  });

  it("texto desconhecido não mexe na empresa", async () => {
    m.company.linhas.push(linha("a", { stateRegistrationStatus: "ATIVA" }));
    const r = await registrarSituacaoDaIE({ tenantId: TENANT, companyId: "a", texto: "Página de erro", lidaEm: LIDA });
    expect(r).toEqual({ tipo: "nao_reconhecida", texto: "Página de erro" });
    expect(empresa("a")).toMatchObject({ stateRegistrationStatus: "ATIVA", stateRegistrationCheckedAt: null });
  });

  it("empresa de outro tenant não é achada", async () => {
    m.company.linhas.push(linha("a", { tenantId: "outro" }));
    expect(await registrarSituacaoDaIE({ tenantId: TENANT, companyId: "a", texto: "ATIVO", lidaEm: LIDA })).toEqual({ tipo: "sem_empresa" });
  });
});

describe("empresasParaVigiarIE", () => {
  it("as nunca lidas primeiro, depois as mais antigas, sem isentas nem lidas na semana", async () => {
    m.company.linhas.push(
      linha("recente", { stateRegistrationCheckedAt: new Date("2026-10-28T12:00:00Z") }),
      linha("antiga", { stateRegistrationCheckedAt: new Date("2026-10-01T12:00:00Z") }),
      linha("nunca"),
      linha("isenta", { stateRegistration: "ISENTO" }),
    );
    const r = await empresasParaVigiarIE(TENANT, LIDA, 10);
    expect(r.map((e) => e.id)).toEqual(["nunca", "antiga"]);
  });
});
