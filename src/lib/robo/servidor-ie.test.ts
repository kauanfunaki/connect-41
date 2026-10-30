import { beforeEach, describe, expect, it, vi } from "vitest";

// A vigilância da IE pela fila do robô (30/10/2026), sobre o banco falso dos
// testes do Serpro: a máquina pede trabalho, a tarefa nasce, a leitura volta.

const m = await vi.hoisted(async () => {
  const { tabela } = await import("@/lib/serpro/teste.fixture");
  return {
    robotTask: tabela({ status: "PENDENTE", attempts: 0, machineSlug: null, claimedAt: null, finishedAt: null, result: null, reason: null, fileId: null, licenseId: null, requestedById: null }),
    company: tabela({ displayName: null, cnpj: null, stateRegistrationStatus: null, stateRegistrationCheckedAt: null, stateRegistrationChangedAt: null }),
    opsWatcher: tabela({}),
    notifySector: vi.fn(),
  };
});

vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ robotTask: m.robotTask, company: m.company, opsWatcher: m.opsWatcher }) }));
vi.mock("@/lib/notifications", () => ({ notifySector: m.notifySector, notifyUser: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: async () => true }));
vi.mock("@/lib/drive/servidor", () => ({ guardarArquivo: vi.fn() }));
vi.mock("@/lib/serpro/situacaoFiscal", () => ({ pastaDoModeloDaEmpresa: vi.fn() }));
vi.mock("@/lib/ops/servidor", () => ({
  ErroOps: class ErroOps extends Error {
    constructor(message: string, public status = 400) { super(message); }
  },
}));

const { devolverTarefa, pegarProxima } = await import("./servidor");

const TENANT = "tenant-1";
const MAQUINA = { tenantId: TENANT, slug: "robo-societario", tokenHash: "h", compartilhado: false };
const empresa = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  tenantId: TENANT,
  name: `Empresa ${id}`,
  displayName: null,
  cnpj: null,
  status: "ACTIVE",
  stateCode: "PR",
  stateRegistration: "1234567890",
  stateRegistrationStatus: null,
  stateRegistrationCheckedAt: null,
  stateRegistrationChangedAt: null,
  ...extra,
});

beforeEach(() => {
  [m.robotTask, m.company, m.opsWatcher].forEach((t) => t.zerar());
  vi.clearAllMocks();
});

describe("a vigilância da IE na fila", () => {
  it("sem a capacidade na máquina, nenhuma tarefa nasce", async () => {
    m.company.linhas.push(empresa("a"));
    expect(await pegarProxima(MAQUINA, ["imprimir_alvara"])).toEqual({ tarefa: null });
    expect(m.robotTask.linhas).toHaveLength(0);
  });

  it("com a capacidade, a próxima empresa vira tarefa e vai para a máquina", async () => {
    m.company.linhas.push(empresa("a", { cnpj: "11444777000161" }));
    const { tarefa } = await pegarProxima(MAQUINA, ["vigiar_ie"]);
    expect(tarefa).toMatchObject({ tipo: "vigiar_ie", tentativa: 1, dados: { inscricao: "1234567890", cnpj: "11444777000161" } });
    expect(m.robotTask.linhas).toHaveLength(1);
  });

  it("a leitura devolvida grava na empresa e conclui; a mesma empresa não volta na semana", async () => {
    m.company.linhas.push(empresa("a"));
    const { tarefa } = await pegarProxima(MAQUINA, ["vigiar_ie"]);
    expect(await devolverTarefa(MAQUINA, tarefa!.id, { ok: true, resultado: { situacao: "SUSPENSO" } }, null)).toEqual({ ok: true, status: "CONCLUIDA" });
    expect(m.company.linhas[0]).toMatchObject({ stateRegistrationStatus: "SUSPENSA" });
    expect(m.notifySector).toHaveBeenCalledTimes(1);
    expect(await pegarProxima(MAQUINA, ["vigiar_ie"])).toEqual({ tarefa: null });
  });

  it("situação desconhecida chama uma pessoa, e a empresa não volta a cada pedido", async () => {
    m.company.linhas.push(empresa("a"), empresa("b"));
    const { tarefa } = await pegarProxima(MAQUINA, ["vigiar_ie"]);
    expect(await devolverTarefa(MAQUINA, tarefa!.id, { ok: true, resultado: { situacao: "Erro 500" } }, null)).toEqual({ ok: true, status: "PRECISA_DE_GENTE" });
    const primeira = m.robotTask.linhas.find((t) => t.id === tarefa!.id)!.companyId;
    const { tarefa: segunda } = await pegarProxima(MAQUINA, ["vigiar_ie"]);
    const empresaDaSegunda = m.robotTask.linhas.find((t) => t.id === segunda!.id)!.companyId;
    expect([primeira, empresaDaSegunda].sort()).toEqual(["a", "b"]);
  });
});
