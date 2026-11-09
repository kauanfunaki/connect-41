import { beforeEach, describe, expect, it, vi } from "vitest";

// O envio ao cliente no fim do processo (09/11/2026), sobre um banco falso:
// nada vai ao MySQL, ao SMTP nem ao push.

type Etapa = {
  id: string;
  templateStepId: string;
  status: string;
  startedAt: Date | null;
  doneAt?: Date | null;
  actor?: string | null;
  automationRef?: string | null;
  executedByUserId?: string | null;
  items: { done: boolean; templateItem: { required: boolean } }[];
};

const m = vi.hoisted(() => ({
  processo: null as null | {
    id: string;
    tenantId: string;
    companyId: string;
    title: string | null;
    status: string;
    ownerUserId: string | null;
    concludedAt: Date | null;
    type: { name: string };
    company: { name: string; displayName: string | null };
    template: { steps: { id: string; position: number; parallelGroup: string | null; optional: boolean; label: string; expectedActor: string; organId: string | null }[] };
    steps: Etapa[];
  },
  portal: [] as { id: string; email: string; name: string }[],
  telaBloqueada: false,
  equipeDoSetor: [] as { id: string }[],
  notificacoes: new Set<string>(),
  email: vi.fn(),
  push: vi.fn(),
  notifyUser: vi.fn(),
  logAudit: vi.fn(),
  processUpdate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  getPrisma: () => ({
    process: {
      findUnique: async () => (m.processo ? structuredClone(m.processo) : null),
      update: m.processUpdate,
    },
    processStep: {
      // A reserva: só grava se a etapa ainda está num dos status do `where`.
      updateMany: async ({ where, data }: { where: { id: string; status: { in: string[] } }; data: Partial<Etapa> }) => {
        const etapa = m.processo?.steps.find((s) => s.id === where.id);
        if (!etapa || !where.status.in.includes(etapa.status)) return { count: 0 };
        Object.assign(etapa, data);
        return { count: 1 };
      },
    },
    notification: {
      count: async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.filter((id) => m.notificacoes.has(id)).length,
    },
    user: { findMany: async () => m.equipeDoSetor },
  }),
}));
vi.mock("@/lib/financeiro/pendencias/avisos", () => ({ usuariosDoPortalDaEmpresa: async () => m.portal }));
vi.mock("@/lib/portal/telasBloqueadas", () => ({ telaBloqueadaNoPortal: async () => m.telaBloqueada }));
vi.mock("@/lib/email/sendMail", () => ({ sendNovidadeNoProcessoEmail: m.email }));
vi.mock("@/lib/portal/avisos", () => ({ avisarClientePorPush: m.push }));
vi.mock("@/lib/notifications", () => ({ notifyUser: m.notifyUser }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("@/lib/modules", () => ({ setorDoModulo: async () => null }));

const { sincronizarProcesso, idDoAvisoParaAEquipe } = await import("./conclusaoServidor");

const TENANT = "tenant-1";

function processo(extra: { status?: string; ownerUserId?: string | null; envio?: Partial<Etapa>; cadastro?: Partial<Etapa> } = {}) {
  return {
    id: "p1",
    tenantId: TENANT,
    companyId: "c1",
    title: null,
    status: extra.status ?? "EM_ANDAMENTO",
    ownerUserId: extra.ownerUserId === undefined ? "dono" : extra.ownerUserId,
    concludedAt: null,
    type: { name: "Constituição" },
    company: { name: "ACME LTDA", displayName: "ACME" },
    template: {
      steps: [
        { id: "t-doc", position: 1, parallelGroup: null, optional: false, label: "Reunir documentação", expectedActor: "PESSOA", organId: null },
        { id: "t-reg", position: 2, parallelGroup: null, optional: false, label: "Acompanhamento do registro", expectedActor: "ROBO", organId: "junta" },
        { id: "t-cad", position: 3, parallelGroup: null, optional: false, label: "Cadastro e comunicação interna", expectedActor: "PESSOA", organId: null },
        { id: "t-env", position: 4, parallelGroup: null, optional: false, label: "Envio de documentação ao cliente", expectedActor: "ROBO", organId: null },
      ],
    },
    steps: [
      { id: "s-doc", templateStepId: "t-doc", status: "CONCLUIDA", startedAt: null, items: [] },
      { id: "s-reg", templateStepId: "t-reg", status: "CONCLUIDA", startedAt: null, items: [] },
      { id: "s-cad", templateStepId: "t-cad", status: "CONCLUIDA", startedAt: null, items: [], ...extra.cadastro },
      { id: "s-env", templateStepId: "t-env", status: "PENDENTE", startedAt: null, items: [], ...extra.envio },
    ] as Etapa[],
  };
}

const envio = () => m.processo!.steps.find((s) => s.id === "s-env")!;

beforeEach(() => {
  vi.clearAllMocks();
  m.processo = processo();
  m.portal = [{ id: "pu1", email: "cliente@empresa.com.br", name: "Cliente" }];
  m.telaBloqueada = false;
  m.equipeDoSetor = [];
  m.notificacoes = new Set();
  m.email.mockResolvedValue({ enviados: 1, falhas: 0, semSmtp: false });
  m.notifyUser.mockImplementation(async (_userId: string, input: { deduplicationId?: string }) => {
    if (input.deduplicationId) m.notificacoes.add(input.deduplicationId);
  });
});

describe("sincronizarProcesso — o envio ao cliente", () => {
  it("com o resto encerrado, avisa o cliente pelo portal e por e-mail, conclui a etapa como robô e o processo", async () => {
    await sincronizarProcesso("p1");

    expect(envio()).toMatchObject({ status: "CONCLUIDA", actor: "ROBO", automationRef: "envio_ao_cliente", executedByUserId: null });
    expect(envio().doneAt).toBeInstanceOf(Date);
    // O e-mail só avisa e leva ao processo no portal — nenhum anexo.
    expect(m.email).toHaveBeenCalledTimes(1);
    const email = m.email.mock.calls[0][0];
    expect(email).toEqual({
      tenantId: TENANT,
      destinatarios: [{ email: "cliente@empresa.com.br", nome: "Cliente" }],
      processId: "p1",
      processoNome: "Constituição — ACME",
      motivo: "concluido",
    });
    expect(m.push).toHaveBeenCalledWith(TENANT, ["pu1"], { tipo: "processo", motivo: "concluido", processoNome: "Constituição — ACME", processId: "p1" });
    expect(m.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        rotina: "roboDoSocietario",
        action: "societario.processo.envio_ao_cliente",
        entityType: "Process",
        entityId: "p1",
        metadata: expect.objectContaining({ destinatarios: 1, emailsEnviados: 1, emailsComFalha: 0 }),
      })
    );
    expect(m.processUpdate).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "CONCLUIDO", concludedAt: expect.any(Date) } });
    expect(m.notifyUser).not.toHaveBeenCalled();
  });

  it("não manda duas vezes: a segunda sincronização acha a etapa concluída", async () => {
    await sincronizarProcesso("p1");
    await sincronizarProcesso("p1");
    expect(m.email).toHaveBeenCalledTimes(1);
    expect(m.push).toHaveBeenCalledTimes(1);
  });

  it("duas sincronizações ao mesmo tempo: só quem reserva a etapa envia", async () => {
    await Promise.all([sincronizarProcesso("p1"), sincronizarProcesso("p1")]);
    expect(m.email).toHaveBeenCalledTimes(1);
  });

  it("etapa concluída à mão antes não dispara nada", async () => {
    m.processo = processo({ envio: { status: "CONCLUIDA", actor: "PESSOA" } });
    await sincronizarProcesso("p1");
    expect(m.email).not.toHaveBeenCalled();
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it("falta etapa antes: nada sai e o processo segue aberto", async () => {
    m.processo = processo({ cadastro: { status: "EM_ANDAMENTO" } });
    await sincronizarProcesso("p1");
    expect(m.email).not.toHaveBeenCalled();
    expect(envio().status).toBe("PENDENTE");
    expect(m.processUpdate).not.toHaveBeenCalled();
  });

  it("processo esperando o cliente: o robô não fala com ele", async () => {
    m.processo = processo({ status: "AGUARDANDO_CLIENTE" });
    await sincronizarProcesso("p1");
    expect(m.email).not.toHaveBeenCalled();
    expect(m.notifyUser).not.toHaveBeenCalled();
  });

  it("sem usuário ativo no portal: não conclui, avisa o responsável uma vez e registra na Auditoria", async () => {
    m.portal = [];
    await sincronizarProcesso("p1");

    expect(envio().status).toBe("PENDENTE");
    expect(m.email).not.toHaveBeenCalled();
    expect(m.processUpdate).not.toHaveBeenCalled();
    expect(m.notifyUser).toHaveBeenCalledWith("dono", {
      tenantId: TENANT,
      type: "PROCESS_ENVIO_AO_CLIENTE",
      message: "Envio ao cliente de Constituição — ACME ficou com você: a empresa não tem usuário ativo no portal. Avise o cliente e conclua a etapa.",
      entityId: "p1",
      deduplicationId: idDoAvisoParaAEquipe("s-env", "sem_portal", "dono"),
    });
    expect(m.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ rotina: "roboDoSocietario", action: "societario.processo.envio_com_a_equipe", entityId: "p1" })
    );

    // Outra sincronização com o mesmo quadro não repete aviso nem linha.
    await sincronizarProcesso("p1");
    expect(m.notifyUser).toHaveBeenCalledTimes(1);
    expect(m.logAudit).toHaveBeenCalledTimes(1);
  });

  it("sem responsável, o aviso vai para quem é do setor", async () => {
    m.processo = processo({ ownerUserId: null });
    m.portal = [];
    m.equipeDoSetor = [{ id: "ana" }, { id: "bia" }];
    await sincronizarProcesso("p1");
    expect(m.notifyUser.mock.calls.map((c) => c[0])).toEqual(["ana", "bia"]);
  });

  it("tela de Processos bloqueada no portal: o link não abriria, então fica com a equipe", async () => {
    m.telaBloqueada = true;
    await sincronizarProcesso("p1");
    expect(envio().status).toBe("PENDENTE");
    expect(m.email).not.toHaveBeenCalled();
    expect(m.notifyUser).toHaveBeenCalledWith("dono", expect.objectContaining({ message: expect.stringContaining("bloqueada no portal") }));
  });

  it("checklist obrigatório do envio em aberto: espera, e avisa o que falta", async () => {
    m.processo = processo({
      envio: { items: [{ done: false, templateItem: { required: true } }, { done: true, templateItem: { required: true } }, { done: false, templateItem: { required: false } }] },
    });
    await sincronizarProcesso("p1");
    expect(envio().status).toBe("PENDENTE");
    expect(m.email).not.toHaveBeenCalled();
    expect(m.notifyUser).toHaveBeenCalledWith("dono", expect.objectContaining({ message: expect.stringContaining("espera 1 item obrigatório") }));
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it("sem SMTP: conclui (o portal já mostra) e avisa o responsável que o e-mail não saiu", async () => {
    m.email.mockResolvedValue({ enviados: 0, falhas: 1, semSmtp: true });
    await sincronizarProcesso("p1");
    expect(envio().status).toBe("CONCLUIDA");
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ semSmtp: true, emailsComFalha: 1 }) }));
    expect(m.notifyUser).toHaveBeenCalledWith("dono", expect.objectContaining({ message: expect.stringContaining("SMTP do workspace") }));
  });

  it("o aviso quebrando depois da reserva não reenvia nem trava a conclusão do processo", async () => {
    m.email.mockRejectedValue(new Error("SMTP caiu"));
    await sincronizarProcesso("p1");
    expect(envio().status).toBe("CONCLUIDA");
    expect(m.processUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CONCLUIDO" }) }));
    expect(m.notifyUser).toHaveBeenCalledWith("dono", expect.objectContaining({ message: expect.stringContaining("o aviso ao cliente falhou") }));
    await sincronizarProcesso("p1");
    expect(m.email).toHaveBeenCalledTimes(1);
  });

  it("o aviso à equipe quebrando depois da reserva também não segura a conclusão", async () => {
    m.email.mockResolvedValue({ enviados: 0, falhas: 1, semSmtp: true });
    m.notifyUser.mockRejectedValue(new Error("banco caiu"));
    await sincronizarProcesso("p1");
    expect(envio().status).toBe("CONCLUIDA");
    expect(m.processUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CONCLUIDO" }) }));
  });
});

describe("sincronizarProcesso — a conclusão", () => {
  it("roteiro sem envio de robô conclui como antes, sem falar com o cliente", async () => {
    m.processo = processo({ envio: { status: "CONCLUIDA" } });
    m.processo.template.steps[3].expectedActor = "PESSOA";
    await sincronizarProcesso("p1");
    expect(m.email).not.toHaveBeenCalled();
    expect(m.processUpdate).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "CONCLUIDO", concludedAt: expect.any(Date) } });
  });

  it("processo concluído com etapa reaberta volta a andar", async () => {
    m.processo = processo({ cadastro: { status: "PENDENTE" }, envio: { status: "CONCLUIDA" } });
    m.processo.concludedAt = new Date("2026-11-01T12:00:00Z");
    await sincronizarProcesso("p1");
    expect(m.processUpdate).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "EM_ANDAMENTO", concludedAt: null } });
  });
});
