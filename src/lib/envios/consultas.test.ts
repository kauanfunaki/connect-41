import { beforeEach, describe, expect, it, vi } from "vitest";

// O lado do cliente dos envios (08/10/2026): o portal só vê o publicado das
// empresas do grupo, a pessoa vira uma linha de destinatário (a que já existe
// com o e-mail dela, ou uma nova na primeira abertura), e o aceite pelo
// portal segue a regra do link por e-mail — sem repetir.

const clientDocument = { findMany: vi.fn(), findFirst: vi.fn(), count: vi.fn() };
const clientDocumentRecipient = { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() };
const clientDocumentView = { create: vi.fn() };
vi.mock("@/lib/prisma", () => ({ getPrisma: () => ({ clientDocument, clientDocumentRecipient, clientDocumentView }) }));

const { abrirEnvioDoCliente, aceitarEnvioDoCliente, enviosAguardandoAceite, enviosDoCliente, linhaDoClienteNoEnvio, envioDoCliente } =
  await import("./consultas");

const ESCOPO = { tenantId: "escritorio-a", companyIds: ["empresa-1", "empresa-2"] };
const PROVA = { ipAddress: "200.1.2.3", userAgent: "Navegador" };
const EMAIL = "fulana@cliente.com.br";

function envio(campos: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    title: "Contrato de prestação de serviços",
    bodyHtml: "<p>Texto</p>",
    status: "PUBLISHED",
    requiresSignature: true,
    fileUrl: "escritorio-a/arquivo.pdf",
    fileName: "contrato.pdf",
    mimeType: "application/pdf",
    createdAt: new Date("2026-10-01T12:00:00Z"),
    publishedAt: new Date("2026-10-02T12:00:00Z"),
    company: { name: "Empresa Um Ltda", displayName: null },
    recipients: [],
    ...campos,
  };
}

function linhaDoBanco(campos: Record<string, unknown> = {}) {
  return {
    id: "linha-1",
    clientDocumentId: "doc-1",
    email: EMAIL,
    token: "t".repeat(64),
    sentAt: null,
    firstViewedAt: null,
    lastViewedAt: null,
    signedAt: null,
    signerName: null,
    signerIp: null,
    createdAt: new Date("2026-10-02T12:00:00Z"),
    ...campos,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clientDocumentRecipient.create.mockImplementation(async ({ data }) => linhaDoBanco({ id: "linha-nova", ...data }));
  clientDocumentRecipient.updateMany.mockResolvedValue({ count: 1 });
});

describe("o alcance do portal sobre os envios", () => {
  it("a lista só pede o publicado, das empresas do grupo, no tenant da sessão", async () => {
    clientDocument.findMany.mockResolvedValue([]);
    await enviosDoCliente(ESCOPO, EMAIL);
    expect(clientDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: "escritorio-a", companyId: { in: ["empresa-1", "empresa-2"] }, status: "PUBLISHED" } })
    );
  });

  it("grupo sem empresa resolve para nada (IN vazio), nunca para tudo", async () => {
    clientDocument.findMany.mockResolvedValue([]);
    await enviosDoCliente({ tenantId: "escritorio-a", companyIds: [] }, EMAIL);
    expect(clientDocument.findMany.mock.calls[0]![0].where.companyId).toEqual({ in: [] });
  });

  it("o envio aberto pelo id também passa pelo alcance — de outra empresa é 'não encontrado', e nada é registrado", async () => {
    clientDocument.findFirst.mockResolvedValue(null);
    expect(await abrirEnvioDoCliente(ESCOPO, EMAIL, "doc-de-outro", PROVA)).toBeNull();
    expect(clientDocument.findFirst.mock.calls[0]![0].where).toEqual({
      tenantId: "escritorio-a",
      companyId: { in: ["empresa-1", "empresa-2"] },
      status: "PUBLISHED",
      id: "doc-de-outro",
    });
    expect(clientDocumentRecipient.create).not.toHaveBeenCalled();
    expect(clientDocumentView.create).not.toHaveBeenCalled();
  });

  it("o anexo usa a mesma consulta: rascunho ou outra empresa não sai", async () => {
    clientDocument.findFirst.mockResolvedValue(null);
    expect(await envioDoCliente(ESCOPO, "doc-1")).toBeNull();
    expect(clientDocument.findFirst.mock.calls[0]![0].where).toMatchObject({ status: "PUBLISHED", companyId: { in: ESCOPO.companyIds } });
  });

  it("o Início conta os que pedem aceite e não têm aceite de ninguém, nas empresas do escopo", async () => {
    clientDocument.count.mockResolvedValue(2);
    expect(await enviosAguardandoAceite({ tenantId: "escritorio-a", companyIds: ["empresa-1"] })).toBe(2);
    expect(clientDocument.count).toHaveBeenCalledWith({
      where: {
        tenantId: "escritorio-a",
        companyId: { in: ["empresa-1"] },
        status: "PUBLISHED",
        requiresSignature: true,
        recipients: { none: { signedAt: { not: null } } },
      },
    });
  });

  it("a lista marca 'novo' pela linha da pessoa e o aceite pelo cliente", async () => {
    clientDocument.findMany.mockResolvedValue([
      envio({ recipients: [{ email: "socio@cliente.com.br", createdAt: new Date(), firstViewedAt: new Date(), signedAt: new Date() }] }),
      envio({ id: "doc-2", requiresSignature: false, fileUrl: null, recipients: [{ email: "FULANA@cliente.com.br", createdAt: new Date(), firstViewedAt: new Date(), signedAt: null }] }),
    ]);
    const [primeiro, segundo] = await enviosDoCliente(ESCOPO, EMAIL);
    expect(primeiro).toMatchObject({ id: "doc-1", novo: true, aceite: "feito", temAnexo: true, empresaNome: "Empresa Um Ltda" });
    expect(segundo).toMatchObject({ id: "doc-2", novo: false, aceite: null, temAnexo: false });
  });
});

describe("a linha de destinatário da pessoa do portal", () => {
  it("se o e-mail dela já é destinatário (a equipe mandou por e-mail), usa essa linha", async () => {
    const daEquipe = linhaDoBanco({ id: "linha-do-email", email: "Fulana@Cliente.com.br", sentAt: new Date() });
    clientDocumentRecipient.findMany.mockResolvedValue([linhaDoBanco({ id: "outra", email: "outra@cliente.com.br" }), daEquipe]);
    expect(await linhaDoClienteNoEnvio("doc-1", EMAIL)).toBe(daEquipe);
    expect(clientDocumentRecipient.create).not.toHaveBeenCalled();
  });

  it("se não é, cria uma linha nova: token próprio, e-mail em minúsculas, sem 'enviado em'", async () => {
    clientDocumentRecipient.findMany.mockResolvedValue([]);
    await linhaDoClienteNoEnvio("doc-1", " Fulana@Cliente.com.br ");
    const { data } = clientDocumentRecipient.create.mock.calls[0]![0];
    expect(data.clientDocumentId).toBe("doc-1");
    expect(data.email).toBe("fulana@cliente.com.br");
    expect(data.token).toMatch(/^[0-9a-f]{64}$/);
    expect(data).not.toHaveProperty("sentAt");
  });

  it("a primeira abertura cria a linha e registra a visualização como primeira; a segunda não", async () => {
    clientDocument.findFirst.mockResolvedValue(envio());
    clientDocumentRecipient.findMany.mockResolvedValueOnce([]);
    const aberto = await abrirEnvioDoCliente(ESCOPO, EMAIL, "doc-1", PROVA);
    expect(aberto).toMatchObject({ id: "doc-1", pedeAceite: true, aceite: null, anexo: { nome: "contrato.pdf" } });
    expect(clientDocumentView.create).toHaveBeenCalledWith({
      data: { recipientId: "linha-nova", action: "VIEWED", ipAddress: "200.1.2.3", userAgent: "Navegador" },
    });
    expect(clientDocumentRecipient.update.mock.calls[0]![0].data).toHaveProperty("firstViewedAt");

    vi.clearAllMocks();
    clientDocument.findFirst.mockResolvedValue(envio());
    clientDocumentRecipient.findMany.mockResolvedValueOnce([linhaDoBanco({ firstViewedAt: new Date("2026-10-03T12:00:00Z") })]);
    await abrirEnvioDoCliente(ESCOPO, EMAIL, "doc-1", PROVA);
    expect(clientDocumentRecipient.create).not.toHaveBeenCalled();
    expect(clientDocumentRecipient.update.mock.calls[0]![0].data).not.toHaveProperty("firstViewedAt");
  });

  it("o aceite já dado aparece como 'meu' quando é da linha da pessoa", async () => {
    const assinadoEm = new Date("2026-10-04T12:00:00Z");
    clientDocument.findFirst.mockResolvedValue(envio({ recipients: [{ id: "linha-1", signedAt: assinadoEm, signerName: "Fulana de Tal" }] }));
    clientDocumentRecipient.findMany.mockResolvedValueOnce([linhaDoBanco({ firstViewedAt: assinadoEm, signedAt: assinadoEm, signerName: "Fulana de Tal" })]);
    const aberto = await abrirEnvioDoCliente(ESCOPO, EMAIL, "doc-1", PROVA);
    expect(aberto?.aceite).toEqual({ nome: "Fulana de Tal", em: assinadoEm, meu: true });
  });
});

describe("o aceite pelo portal", () => {
  const preenchido = { nome: "Fulana de Tal", consentimento: "true" };

  it("grava nome, IP e data na linha da pessoa, só se ainda não há aceite, e deixa a trilha SIGNED", async () => {
    clientDocument.findFirst.mockResolvedValue(envio());
    clientDocumentRecipient.findMany.mockResolvedValue([linhaDoBanco()]);
    expect(await aceitarEnvioDoCliente(ESCOPO, EMAIL, "doc-1", preenchido, PROVA)).toEqual({ ok: true });

    const { where, data } = clientDocumentRecipient.updateMany.mock.calls[0]![0];
    expect(where).toEqual({ id: "linha-1", signedAt: null });
    expect(data).toMatchObject({ signerName: "Fulana de Tal", signerIp: "200.1.2.3" });
    expect(data.signedAt).toBeInstanceOf(Date);
    expect(clientDocumentView.create).toHaveBeenCalledWith({
      data: { recipientId: "linha-1", action: "SIGNED", ipAddress: "200.1.2.3", userAgent: "Navegador" },
    });
  });

  it("valida antes de tocar no banco: sem nome ou sem a marca, nada é gravado", async () => {
    expect(await aceitarEnvioDoCliente(ESCOPO, EMAIL, "doc-1", { nome: "Fu", consentimento: "true" }, PROVA)).toEqual({
      ok: false,
      erro: "Informe seu nome completo para assinar.",
    });
    expect(await aceitarEnvioDoCliente(ESCOPO, EMAIL, "doc-1", { nome: "Fulana", consentimento: "false" }, PROVA)).toMatchObject({ ok: false });
    expect(clientDocument.findFirst).not.toHaveBeenCalled();
    expect(clientDocumentRecipient.updateMany).not.toHaveBeenCalled();
  });

  it("envio de outra empresa, ou que não pede aceite, recusa sem gravar", async () => {
    clientDocument.findFirst.mockResolvedValueOnce(null);
    expect(await aceitarEnvioDoCliente(ESCOPO, EMAIL, "doc-de-outro", preenchido, PROVA)).toEqual({ ok: false, erro: "Documento não encontrado." });
    clientDocument.findFirst.mockResolvedValueOnce(envio({ requiresSignature: false }));
    expect(await aceitarEnvioDoCliente(ESCOPO, EMAIL, "doc-1", preenchido, PROVA)).toEqual({ ok: false, erro: "Este documento não pede aceite." });
    expect(clientDocumentRecipient.updateMany).not.toHaveBeenCalled();
    expect(clientDocumentRecipient.create).not.toHaveBeenCalled();
  });

  it("aceite não se repete: com aceite de alguém do cliente, não grava outro", async () => {
    clientDocument.findFirst.mockResolvedValue(envio({ recipients: [{ id: "linha-do-socio", signedAt: new Date(), signerName: "Sócio" }] }));
    expect(await aceitarEnvioDoCliente(ESCOPO, EMAIL, "doc-1", preenchido, PROVA)).toEqual({
      ok: false,
      erro: "O aceite deste documento já foi registrado.",
    });
    expect(clientDocumentRecipient.updateMany).not.toHaveBeenCalled();
    expect(clientDocumentView.create).not.toHaveBeenCalled();
  });

  it("dois cliques ao mesmo tempo: o segundo não sobrescreve o primeiro nem deixa outra linha SIGNED", async () => {
    clientDocument.findFirst.mockResolvedValue(envio());
    clientDocumentRecipient.findMany.mockResolvedValue([linhaDoBanco()]);
    clientDocumentRecipient.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await aceitarEnvioDoCliente(ESCOPO, EMAIL, "doc-1", preenchido, PROVA)).toEqual({
      ok: false,
      erro: "O aceite deste documento já foi registrado.",
    });
    expect(clientDocumentView.create).not.toHaveBeenCalled();
  });
});
