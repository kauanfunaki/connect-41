import { beforeEach, describe, expect, it, vi } from "vitest";

// Anexar e tirar arquivo de uma conta (lote H2, 19/10): sempre dentro do
// escritório de quem pede, com o teto por conta, e sem deixar arquivo órfão no
// disco quando o banco recusa.

const m = vi.hoisted(() => {
  const db = {
    financeEntry: { findFirst: vi.fn() },
    financeEntryAttachment: { createMany: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  };
  return {
    db,
    ctx: { tenantId: "escritorio-a", userId: "u1", role: "SECTOR_USER", sectors: ["bpo"], subscriptionReadOnly: false },
    podeEditar: vi.fn(),
    gravarAnexos: vi.fn(),
    apagarAnexosGravados: vi.fn(),
    apagarArquivos: vi.fn(),
    logAudit: vi.fn(),
  };
});

// Sem empresa em foco (21/10/2026): a trava do foco tem o teste dela (`focoServidor.test.ts`).
vi.mock("@/lib/empresas/focoServidor", () => ({
  recusaDoFoco: async () => null,
  leituraNoFoco: async (_ctx: unknown, empresa: string) => ({ ok: true, empresaId: empresa, empresaIds: undefined }),
}));
vi.mock("@/lib/prisma", () => ({ getPrisma: () => m.db }));
vi.mock("@/lib/auth/context", async () => ({ ...(await import("@/lib/auth/papeis")), getAuthContext: async () => m.ctx }));
vi.mock("./acessoDaConta", () => ({ podeEditarOTipo: m.podeEditar }));
vi.mock("@/lib/audit", () => ({ logAudit: m.logAudit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./anexos", () => ({
  MAXIMO_DE_ANEXOS_POR_CONTA: 20,
  armazenamentoDosAnexos: { gravarAnexos: m.gravarAnexos, apagarAnexosGravados: m.apagarAnexosGravados, apagarArquivos: m.apagarArquivos },
  anexosDaConta: async () => [{ id: "a1", nome: "boleto.pdf", tamanho: 10, enviadoEm: "2026-10-19T12:00:00.000Z", enviadoPor: "Ana" }],
}));

import { anexarAoLancamento, removerAnexoDoLancamento } from "./anexosServidor";

const PDF = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], "boleto.pdf", { type: "application/pdf" });
const GRAVADO = { fileName: "boleto.pdf", fileUrl: "escritorio-a/x.pdf", mimeType: "application/pdf", sizeBytes: 5 };

function envio(arquivos: File[] = [PDF]) {
  const f = new FormData();
  f.set("entryId", "conta-1");
  for (const a of arquivos) f.append("anexos", a);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  m.podeEditar.mockResolvedValue({ ctx: m.ctx, erro: null });
  m.db.financeEntry.findFirst.mockResolvedValue({ id: "conta-1", kind: "PAGAR", _count: { attachments: 0 } });
  m.gravarAnexos.mockResolvedValue({ ok: true, anexos: [GRAVADO] });
});

describe("anexarAoLancamento", () => {
  it("grava no escritório de quem pede e devolve a lista nova", async () => {
    const r = await anexarAoLancamento(envio());
    expect(m.db.financeEntry.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "conta-1", tenantId: "escritorio-a" } }));
    expect(m.db.financeEntryAttachment.createMany).toHaveBeenCalledWith({
      data: [{ ...GRAVADO, tenantId: "escritorio-a", entryId: "conta-1", uploadedByUserId: "u1" }],
    });
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "finance.attachment_added", entityId: "conta-1" }));
    expect(r).toMatchObject({ ok: true, anexos: [{ id: "a1" }] });
  });

  it("conta de outro escritório responde como inexistente, sem gravar nada", async () => {
    m.db.financeEntry.findFirst.mockResolvedValue(null);
    expect(await anexarAoLancamento(envio())).toEqual({ error: "Lançamento não encontrado." });
    expect(m.gravarAnexos).not.toHaveBeenCalled();
  });

  it("sem permissão no tipo da conta, recusa antes do disco", async () => {
    m.podeEditar.mockResolvedValue({ ctx: null, erro: "Sem permissão em contas a pagar." });
    expect(await anexarAoLancamento(envio())).toEqual({ error: "Sem permissão em contas a pagar." });
    expect(m.gravarAnexos).not.toHaveBeenCalled();
  });

  it("passa do teto de anexos da conta", async () => {
    m.db.financeEntry.findFirst.mockResolvedValue({ id: "conta-1", kind: "PAGAR", _count: { attachments: 20 } });
    expect(await anexarAoLancamento(envio())).toEqual({ error: "Uma conta guarda até 20 anexos." });
  });

  it("sem arquivo, pede um", async () => {
    expect(await anexarAoLancamento(envio([]))).toEqual({ error: "Escolha um arquivo." });
  });

  it("arquivo recusado pelo disco (tipo pelos bytes) volta como erro", async () => {
    m.gravarAnexos.mockResolvedValue({ ok: false, erro: "boleto.pdf: formato não aceito." });
    expect(await anexarAoLancamento(envio())).toEqual({ error: "boleto.pdf: formato não aceito." });
    expect(m.db.financeEntryAttachment.createMany).not.toHaveBeenCalled();
  });

  it("banco recusou: o arquivo já gravado sai do disco", async () => {
    m.db.financeEntryAttachment.createMany.mockRejectedValue(new Error("falhou"));
    await expect(anexarAoLancamento(envio())).rejects.toThrow("falhou");
    expect(m.apagarAnexosGravados).toHaveBeenCalledWith([GRAVADO]);
  });
});

describe("removerAnexoDoLancamento", () => {
  beforeEach(() => {
    m.db.financeEntryAttachment.findFirst.mockResolvedValue({
      id: "a1",
      entryId: "conta-1",
      fileName: "boleto.pdf",
      fileUrl: "escritorio-a/x.pdf",
      entry: { kind: "PAGAR" },
    });
    m.db.financeEntryAttachment.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("apaga a linha e depois o arquivo, dentro do escritório", async () => {
    const r = await removerAnexoDoLancamento("a1");
    expect(m.db.financeEntryAttachment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a1", tenantId: "escritorio-a" } }));
    expect(m.db.financeEntryAttachment.deleteMany).toHaveBeenCalledWith({ where: { id: "a1", tenantId: "escritorio-a" } });
    expect(m.apagarArquivos).toHaveBeenCalledWith(["escritorio-a/x.pdf"]);
    expect(m.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "finance.attachment_removed", entityId: "conta-1" }));
    expect(r).toMatchObject({ ok: true });
  });

  it("anexo de outro escritório responde como inexistente", async () => {
    m.db.financeEntryAttachment.findFirst.mockResolvedValue(null);
    expect(await removerAnexoDoLancamento("a1")).toEqual({ error: "Anexo não encontrado." });
    expect(m.db.financeEntryAttachment.deleteMany).not.toHaveBeenCalled();
  });

  it("sem permissão, não apaga", async () => {
    m.podeEditar.mockResolvedValue({ ctx: null, erro: "Sem permissão em contas a pagar." });
    expect(await removerAnexoDoLancamento("a1")).toEqual({ error: "Sem permissão em contas a pagar." });
    expect(m.db.financeEntryAttachment.deleteMany).not.toHaveBeenCalled();
  });

  it("a linha já tinha saído (outra pessoa tirou): não mexe no disco", async () => {
    m.db.financeEntryAttachment.deleteMany.mockResolvedValue({ count: 0 });
    await removerAnexoDoLancamento("a1");
    expect(m.apagarArquivos).not.toHaveBeenCalled();
  });
});
