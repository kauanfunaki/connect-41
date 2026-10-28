import { beforeEach, describe, expect, it, vi } from "vitest";

// As ações do envio agendado e do lembrete (22/10/2026): o agendamento é lido
// do formulário (data/hora de Brasília, e-mails resolvidos na hora de salvar),
// cancelar só mexe no rascunho agendado, e "Enviar agora" passa pela mesma
// trava do agendador.

const m = vi.hoisted(() => ({
  db: {
    company: { findFirst: vi.fn() },
    clientDocument: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  ctx: { tenantId: "t1", userId: "u1", role: "ADMIN", subscriptionReadOnly: false },
  logAudit: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
  publicar: vi.fn(),
  entregar: vi.fn(),
  anexoDosArquivos: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/auth/context", () => ({
  getAuthContext: async () => m.ctx,
  canWrite: (role: string) => role !== "READONLY",
  podeExcluir: () => true,
}));
vi.mock("@/lib/auth/scope", () => ({ scopedCompanyWhere: async () => ({}) }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/drive/guardarTambem", () => ({ guardarTambemNosArquivos: vi.fn() }));
vi.mock("@/lib/clientDocuments", () => ({ sanitizeDocumentHtml: (h: string) => h, saveClientDocumentFile: vi.fn() }));
vi.mock("@/lib/email/sendMail", () => ({ sendClientDocumentEmail: vi.fn() }));
vi.mock("@/generated/prisma/client", () => ({ Prisma: { DbNull: "DbNull" } }));
vi.mock("@/lib/envios/agendador", () => ({ publicarEnvioAgendado: m.publicar, entregarPorEmail: m.entregar }));
vi.mock("@/lib/envios/anexoDosArquivos", () => ({ anexoDosArquivos: m.anexoDosArquivos, arquivosParaOEnvio: vi.fn() }));

const { criarDocumento, cancelarAgendamento, enviarAgendadoAgora, enviarDocumento, publicarDocumento } = await import("./actions");

function form(campos: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

const BASE = { companyId: "c1", title: "Guia DAS", bodyHtml: "<p>Segue a guia.</p>" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-22T15:00:00Z"));
  m.ctx = { tenantId: "t1", userId: "u1", role: "ADMIN", subscriptionReadOnly: false };
  m.db.company.findFirst.mockResolvedValue({ id: "c1", name: "Padaria", email: "Contato@Padaria.com" });
  m.db.clientDocument.create.mockResolvedValue({ id: "d1" });
  m.db.clientDocument.updateMany.mockResolvedValue({ count: 1 });
  m.db.user.findUnique.mockResolvedValue({ name: "Ana" });
  m.entregar.mockResolvedValue({ enviados: [], falhas: [] });
  m.publicar.mockResolvedValue({ publicado: true, enviados: [], falhas: [] });
});

describe("criarDocumento — agendamento e lembrete", () => {
  it("sem agendar: rascunho comum, com o lembrete escolhido", async () => {
    await expect(criarDocumento(null, form({ ...BASE, reminderDays: "5" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(m.db.clientDocument.create.mock.calls[0]![0].data).toMatchObject({ reminderDays: 5, scheduledFor: null, scheduledEmails: "DbNull" });
    expect(m.logAudit).not.toHaveBeenCalledWith(expect.objectContaining({ action: "clientDocument.schedule" }));
  });

  it("agendado: a hora de Brasília, o e-mail da empresa e os avulsos, sem repetir", async () => {
    await expect(
      criarDocumento(
        null,
        form({ ...BASE, agendar: "on", agendarData: "2026-10-23", agendarHora: "09:30", agendarEmailEmpresa: "on", agendarEmails: "dono@padaria.com,contato@padaria.com" })
      )
    ).rejects.toThrow("NEXT_REDIRECT");
    const data = m.db.clientDocument.create.mock.calls[0]![0].data;
    expect(data.scheduledFor).toEqual(new Date("2026-10-23T12:30:00Z"));
    expect(data.scheduledEmails).toEqual(["dono@padaria.com", "contato@padaria.com"]);
    expect(data.reminderDays).toBeNull();
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "clientDocument.schedule", entityId: "d1" }));
  });

  it("agendamento no passado: erro, nada criado", async () => {
    const r = await criarDocumento(null, form({ ...BASE, agendar: "on", agendarData: "2026-10-22", agendarHora: "08:00" }));
    expect(r).toEqual({ error: "Escolha uma data e hora no futuro para o agendamento." });
    expect(m.db.clientDocument.create).not.toHaveBeenCalled();
  });

  it("marcou agendar e não escolheu a data: erro", async () => {
    const r = await criarDocumento(null, form({ ...BASE, agendar: "on" }));
    expect(r && "error" in r && r.error).toMatch(/Escolha a data do agendamento/);
  });
});

describe("cancelarAgendamento e enviarAgendadoAgora", () => {
  it("cancelar só mexe no rascunho agendado do escritório, e volta a ser rascunho comum", async () => {
    await cancelarAgendamento("d1", "c1");
    expect(m.db.clientDocument.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", tenantId: "t1", companyId: "c1", status: "DRAFT", scheduledFor: { not: null } },
      data: { scheduledFor: null, scheduledEmails: "DbNull" },
    });
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "clientDocument.unschedule" }));
  });

  it("nada a cancelar (já publicado): sem auditoria", async () => {
    m.db.clientDocument.updateMany.mockResolvedValue({ count: 0 });
    await cancelarAgendamento("d1", "c1");
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it("enviar agora passa pela trava do agendador, em nome de quem clicou", async () => {
    m.db.clientDocument.findFirst.mockResolvedValue({ id: "d1" });
    await enviarAgendadoAgora("d1", "c1");
    expect(m.publicar).toHaveBeenCalledWith("d1", { agora: expect.any(Date), por: { userId: "u1", tenantId: "t1" } });
  });

  it("somente leitura não faz nada", async () => {
    m.ctx.role = "READONLY";
    await enviarAgendadoAgora("d1", "c1");
    await cancelarAgendamento("d1", "c1");
    expect(m.publicar).not.toHaveBeenCalled();
    expect(m.db.clientDocument.updateMany).not.toHaveBeenCalled();
  });

  it("publicar o agendado é mandar já (com os e-mails do agendamento)", async () => {
    m.db.clientDocument.findFirst.mockResolvedValue({ id: "d1", status: "DRAFT", scheduledFor: new Date("2026-10-25T12:00:00Z") });
    await publicarDocumento("d1", "c1");
    expect(m.publicar).toHaveBeenCalled();
    expect(m.db.clientDocument.updateMany).not.toHaveBeenCalled();
  });

  it("publicar o rascunho comum trava pelo status", async () => {
    m.db.clientDocument.findFirst.mockResolvedValue({ id: "d1", status: "DRAFT", scheduledFor: null });
    await publicarDocumento("d1", "c1");
    expect(m.db.clientDocument.updateMany).toHaveBeenCalledWith({ where: { id: "d1", status: "DRAFT" }, data: { status: "PUBLISHED", publishedAt: expect.any(Date) } });
  });
});

describe("enviarDocumento — o lembrete escolhido no envio", () => {
  const DOC = { id: "d1", status: "PUBLISHED", title: "Guia", fileUrl: null, reminderSentAt: null };

  it("grava o prazo do lembrete e manda pelos e-mails", async () => {
    m.db.clientDocument.findFirst.mockResolvedValue(DOC);
    const r = await enviarDocumento(null, form({ documentId: "d1", companyId: "c1", useCompanyEmail: "on", reminderDays: "2" }));
    expect(r).toEqual({ success: true });
    expect(m.db.clientDocument.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { reminderDays: 2 } });
    expect([...m.entregar.mock.calls[0]![0].emails]).toEqual(["contato@padaria.com"]);
  });

  it("com o lembrete já enviado, não programa outro", async () => {
    m.db.clientDocument.findFirst.mockResolvedValue({ ...DOC, reminderSentAt: new Date() });
    await enviarDocumento(null, form({ documentId: "d1", companyId: "c1", useCompanyEmail: "on", reminderDays: "2" }));
    expect(m.db.clientDocument.update).not.toHaveBeenCalled();
  });
});

describe("criarDocumento — anexo dos Arquivos (28/10)", () => {
  it("copia o arquivo escolhido e grava como anexo do envio", async () => {
    m.anexoDosArquivos.mockResolvedValue({ ok: true, anexo: { fileName: "DAS 09-2026.pdf", fileUrl: "t1/x.pdf", mimeType: "application/pdf", fileSize: 1234 } });
    await expect(criarDocumento(null, form({ ...BASE, arquivoId: "arq-1" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(m.anexoDosArquivos).toHaveBeenCalledWith(m.ctx, "c1", "arq-1");
    expect(m.db.clientDocument.create.mock.calls[0]![0].data).toMatchObject({ fileName: "DAS 09-2026.pdf", fileUrl: "t1/x.pdf" });
  });

  it("arquivo que não é da empresa (ou sumiu): erro, nada criado", async () => {
    m.anexoDosArquivos.mockResolvedValue({ ok: false, erro: "O arquivo escolhido não está mais nos Arquivos desta empresa. Escolha de novo." });
    expect(await criarDocumento(null, form({ ...BASE, arquivoId: "arq-de-outra" }))).toEqual({ error: "O arquivo escolhido não está mais nos Arquivos desta empresa. Escolha de novo." });
    expect(m.db.clientDocument.create).not.toHaveBeenCalled();
  });
});
