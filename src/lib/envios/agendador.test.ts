import { beforeEach, describe, expect, it, vi } from "vitest";

// O que os envios fazem sozinhos (22/10/2026): o agendado sai na hora, e o
// lembrete de não lido sai uma vez. Os dois travam a linha com um update
// condicional antes do e-mail — quem não ganhou a trava não envia nada.

const m = vi.hoisted(() => ({
  db: {
    clientDocument: { findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    clientDocumentRecipient: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  sendMail: vi.fn(),
  push: vi.fn(),
  usuarios: vi.fn(),
  modulo: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("@/lib/modules", () => ({ isModuleEnabled: m.modulo }));
vi.mock("@/lib/email/sendMail", () => ({ sendClientDocumentEmail: m.sendMail }));
vi.mock("@/lib/portal/avisos", () => ({ avisarClientePorPush: m.push }));
vi.mock("@/lib/portal/empresasDaContaDb", () => ({ usuariosAtivosDasEmpresas: m.usuarios }));
vi.mock("@/lib/clientDocuments", () => ({ generateRecipientToken: () => "tok-novo" }));

import { enviarAgendadosVencidos, enviarLembretesDevidos, publicarEnvioAgendado } from "./agendador";

const agora = new Date("2026-10-22T15:00:00Z");

const DOC = {
  id: "d1",
  tenantId: "t1",
  title: "Guia DAS 09/2026",
  fileUrl: null,
  scheduledEmails: ["cliente@padaria.com", "Dono@Padaria.com"],
  company: { name: "Padaria" },
  createdBy: { name: "Ana" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.db.clientDocument.updateMany.mockResolvedValue({ count: 1 });
  m.db.clientDocument.findUnique.mockResolvedValue(DOC);
  m.db.clientDocumentRecipient.findFirst.mockResolvedValue(null);
  m.db.clientDocumentRecipient.create.mockImplementation(async ({ data }) => ({ id: `r-${data.email}`, token: `tok-${data.email}` }));
  m.db.clientDocumentRecipient.update.mockResolvedValue({});
  m.sendMail.mockResolvedValue({ ok: true });
  m.modulo.mockResolvedValue(true);
  m.usuarios.mockResolvedValue([{ id: "pu1", name: "Dono", email: "dono@padaria.com" }]);
});

describe("publicarEnvioAgendado", () => {
  it("o agendador trava (rascunho com data vencida → publicado) e manda os e-mails do agendamento", async () => {
    const r = await publicarEnvioAgendado("d1", { agora, vencidoAte: agora, por: null });
    expect(m.db.clientDocument.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", status: "DRAFT", scheduledFor: { not: null, lte: agora } },
      data: { status: "PUBLISHED", publishedAt: agora },
    });
    expect(r).toEqual({ publicado: true, enviados: ["cliente@padaria.com", "dono@padaria.com"], falhas: [] });
    expect(m.sendMail).toHaveBeenCalledTimes(2);
    expect(m.sendMail.mock.calls[0]![0]).toMatchObject({ to: "cliente@padaria.com", senderName: "Ana", viewToken: "tok-cliente@padaria.com" });
    expect(m.db.clientDocumentRecipient.update).toHaveBeenCalledTimes(2);
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "clientDocument.scheduled_send", userId: "" }));
  });

  it("quem não ganhou a trava (outra passada, cancelado, já publicado) não envia nada", async () => {
    m.db.clientDocument.updateMany.mockResolvedValue({ count: 0 });
    expect(await publicarEnvioAgendado("d1", { agora, vencidoAte: agora, por: null })).toEqual({ publicado: false });
    expect(m.sendMail).not.toHaveBeenCalled();
    expect(m.logAudit).not.toHaveBeenCalled();
  });

  it("o “Enviar agora” da tela não exige a data vencida, confere o escritório e assina com quem mandou", async () => {
    m.db.user.findUnique.mockResolvedValue({ name: "Bruno" });
    await publicarEnvioAgendado("d1", { agora, por: { userId: "u2", tenantId: "t1" } });
    expect(m.db.clientDocument.updateMany.mock.calls[0]![0].where).toEqual({ id: "d1", status: "DRAFT", scheduledFor: { not: null }, tenantId: "t1" });
    expect(m.sendMail.mock.calls[0]![0].senderName).toBe("Bruno");
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "clientDocument.scheduled_send_now", userId: "u2" }));
  });

  it("e-mail que falha fica sem `sentAt` e volta como falha", async () => {
    m.sendMail.mockResolvedValueOnce({ ok: false, error: "SMTP" });
    const r = await publicarEnvioAgendado("d1", { agora, vencidoAte: agora, por: null });
    expect(r).toMatchObject({ enviados: ["dono@padaria.com"], falhas: ["cliente@padaria.com: SMTP"] });
    expect(m.db.clientDocumentRecipient.update).toHaveBeenCalledTimes(1);
  });
});

describe("enviarAgendadosVencidos", () => {
  it("busca os vencidos e publica cada um; duas passadas juntas: só uma envia", async () => {
    m.db.clientDocument.findMany.mockResolvedValue([{ id: "d1" }]);
    m.db.clientDocument.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const [a, b] = await Promise.all([enviarAgendadosVencidos({ agora }), enviarAgendadosVencidos({ agora })]);
    expect(a.publicados + b.publicados).toBe(1);
    expect(m.sendMail).toHaveBeenCalledTimes(2); // os 2 e-mails do único que publicou
    expect(m.db.clientDocument.findMany.mock.calls[0]![0].where).toMatchObject({ status: "DRAFT", scheduledFor: { not: null, lte: agora } });
  });
});

describe("enviarLembretesDevidos", () => {
  const candidato = (p: Record<string, unknown> = {}) => ({
    id: "d1",
    tenantId: "t1",
    companyId: "c1",
    title: "Guia DAS 09/2026",
    fileUrl: "t1/x.pdf",
    status: "PUBLISHED",
    publishedAt: new Date("2026-10-10T12:00:00Z"),
    reminderDays: 5,
    reminderSentAt: null,
    company: { name: "Padaria" },
    createdBy: { name: "Ana" },
    recipients: [
      { id: "r1", email: "cliente@padaria.com", token: "tok1", sentAt: new Date("2026-10-10T12:00:00Z"), firstViewedAt: null, signedAt: null },
      // Linha sem e-mail (veio do portal e não abriu?) não recebe e-mail.
      { id: "r2", email: "outro@padaria.com", token: "tok2", sentAt: null, firstViewedAt: null, signedAt: null },
    ],
    ...p,
  });

  it("trava (reminderSentAt null → agora), manda o e-mail de lembrete a quem recebeu e o push do portal", async () => {
    m.db.clientDocument.findMany.mockResolvedValue([candidato()]);
    const r = await enviarLembretesDevidos({ agora });
    expect(m.db.clientDocument.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", status: "PUBLISHED", reminderSentAt: null },
      data: { reminderSentAt: agora },
    });
    expect(m.sendMail).toHaveBeenCalledTimes(1);
    expect(m.sendMail.mock.calls[0]![0]).toMatchObject({ to: "cliente@padaria.com", viewToken: "tok1", lembrete: true, hasAttachment: true });
    expect(m.push).toHaveBeenCalledWith("t1", ["pu1"], { tipo: "envio", motivo: "lembrete", titulo: "Guia DAS 09/2026", id: "d1" });
    expect(r).toEqual({ lembrados: 1, emails: 1, falhas: 0 });
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "clientDocument.reminder" }));
  });

  it("a consulta já tira o aberto, o lembrado e o rascunho", async () => {
    m.db.clientDocument.findMany.mockResolvedValue([]);
    await enviarLembretesDevidos({ agora });
    expect(m.db.clientDocument.findMany.mock.calls[0]![0].where).toMatchObject({
      status: "PUBLISHED",
      reminderDays: { not: null },
      reminderSentAt: null,
      recipients: { none: { firstViewedAt: { not: null } } },
    });
  });

  it("ainda no prazo: nem trava, nem envia", async () => {
    // O e-mail saiu em 15/10: 10 dias vencem só em 25/10.
    m.db.clientDocument.findMany.mockResolvedValue([
      candidato({ reminderDays: 10, recipients: [{ id: "r1", email: "c@p.com", token: "t", sentAt: new Date("2026-10-15T12:00:00Z"), firstViewedAt: null, signedAt: null }] }),
    ]);
    expect(await enviarLembretesDevidos({ agora })).toEqual({ lembrados: 0, emails: 0, falhas: 0 });
    expect(m.db.clientDocument.updateMany).not.toHaveBeenCalled();
    expect(m.sendMail).not.toHaveBeenCalled();
  });

  it("outra passada lembrou antes: não envia de novo", async () => {
    m.db.clientDocument.findMany.mockResolvedValue([candidato()]);
    m.db.clientDocument.updateMany.mockResolvedValue({ count: 0 });
    expect(await enviarLembretesDevidos({ agora })).toEqual({ lembrados: 0, emails: 0, falhas: 0 });
    expect(m.sendMail).not.toHaveBeenCalled();
    expect(m.push).not.toHaveBeenCalled();
  });

  it("com o canal do portal desligado, só o e-mail", async () => {
    m.db.clientDocument.findMany.mockResolvedValue([candidato()]);
    m.modulo.mockResolvedValue(false);
    await enviarLembretesDevidos({ agora });
    expect(m.sendMail).toHaveBeenCalledTimes(1);
    expect(m.push).not.toHaveBeenCalled();
  });
});
