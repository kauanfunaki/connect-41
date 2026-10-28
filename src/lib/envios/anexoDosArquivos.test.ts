import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/auth/context";

// O anexo do envio tirado dos Arquivos (28/10/2026): só arquivo que a pessoa
// vê e que é da própria empresa do envio; o envio guarda uma cópia.

const m = vi.hoisted(() => ({
  ligado: true,
  alvo: null as null | { arquivo: { id: string; name: string; mimeType: string; storageKey: string }; pasta: { companyId: string | null }; caminho: { name: string }[] },
  bytes: Buffer.from("%PDF-1.4") as Buffer | null,
  salvar: vi.fn(),
  achados: [] as { id: string; nome: string; mime: string; tamanho: number; pastaRotulo: string }[],
}));

vi.mock("@/lib/modules", () => ({ isModuleEnabled: async () => m.ligado }));
vi.mock("@/lib/drive/regras", () => ({ MODULO_ARQUIVOS: "arquivos" }));
vi.mock("@/lib/drive/servidor", () => ({
  arquivoParaAEquipe: async () => m.alvo,
  armazenamentoDoDrive: { lerAnexo: async () => m.bytes },
  buscarNoDrive: async () => m.achados,
}));
vi.mock("@/lib/clientDocuments", () => ({
  saveClientDocumentBytes: m.salvar,
  cabeNoEnvio: (mime: string, tamanho: number) => mime === "application/pdf" && tamanho <= 10 * 1024 * 1024,
}));

const { anexoDosArquivos, arquivoParaOEnvio, arquivosParaOEnvio } = await import("./anexoDosArquivos");

const ctx = { tenantId: "t1", userId: "u1" } as AuthContext;
const GUIA = { arquivo: { id: "a1", name: "DAS 09-2026.pdf", mimeType: "application/pdf", storageKey: "t1/a1.pdf" }, pasta: { companyId: "c1" }, caminho: [{ name: "Guias" }] };

beforeEach(() => {
  m.ligado = true;
  m.alvo = GUIA;
  m.bytes = Buffer.from("%PDF-1.4");
  m.salvar.mockReset().mockResolvedValue({ fileName: "DAS 09-2026.pdf", fileUrl: "t1/novo.pdf", mimeType: "application/pdf", fileSize: 8 });
});

describe("anexo dos Arquivos", () => {
  it("copia o arquivo da empresa para o envio", async () => {
    expect(await anexoDosArquivos(ctx, "c1", "a1")).toEqual({ ok: true, anexo: expect.objectContaining({ fileUrl: "t1/novo.pdf" }) });
    expect(m.salvar).toHaveBeenCalledWith("t1", { nome: "DAS 09-2026.pdf", mime: "application/pdf", bytes: m.bytes });
  });

  it("arquivo de outra empresa não vai", async () => {
    expect(await anexoDosArquivos(ctx, "c2", "a1")).toMatchObject({ ok: false });
    expect(await arquivoParaOEnvio(ctx, "c2", "a1")).toBeNull();
    expect(m.salvar).not.toHaveBeenCalled();
  });

  it("arquivo que a pessoa não vê (setor, lixeira) ou que sumiu do disco não vai", async () => {
    m.alvo = null;
    expect(await anexoDosArquivos(ctx, "c1", "a1")).toMatchObject({ ok: false });
    m.alvo = GUIA;
    m.bytes = null;
    expect(await anexoDosArquivos(ctx, "c1", "a1")).toMatchObject({ ok: false });
  });

  it("com os Arquivos desligados, nada", async () => {
    m.ligado = false;
    expect(await anexoDosArquivos(ctx, "c1", "a1")).toMatchObject({ ok: false });
    expect(await arquivoParaOEnvio(ctx, "c1", "a1")).toBeNull();
  });

  it("a busca só traz o que cabe no envio", async () => {
    m.achados = [
      { id: "a1", nome: "DAS.pdf", mime: "application/pdf", tamanho: 1000, pastaRotulo: "Guias" },
      { id: "a2", nome: "Planilha.xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", tamanho: 1000, pastaRotulo: "Fiscal" },
      { id: "a3", nome: "Grande.pdf", mime: "application/pdf", tamanho: 30 * 1024 * 1024, pastaRotulo: "Fiscal" },
    ];
    expect(await arquivosParaOEnvio(ctx, "c1", "das")).toEqual([{ id: "a1", nome: "DAS.pdf", pasta: "Guias" }]);
  });

  it("chega escolhido com o caminho da pasta", async () => {
    expect(await arquivoParaOEnvio(ctx, "c1", "a1")).toEqual({ id: "a1", nome: "DAS 09-2026.pdf", pasta: "Guias" });
  });
});
