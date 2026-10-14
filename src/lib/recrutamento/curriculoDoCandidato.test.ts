import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import {
  TETO_DO_RESUMO,
  escolherCurriculo,
  guardarResumoDoCurriculo,
  lerResumoDoCurriculo,
  nomeDoCurriculoDoPortal,
  resumoEhDoArquivo,
  type CurriculoAnexado,
  type CurriculoDoPortal,
} from "./curriculoDoCandidato";

const dia = (d: string) => new Date(`${d}T12:00:00Z`);
const portal = (id: string, em: string): CurriculoDoPortal => ({ candidaturaId: id, vagaTitulo: "Auxiliar de produção", em: dia(em) });
const anexo = (id: string, em: string, mimeType = "application/pdf"): CurriculoAnexado => ({
  documentId: id,
  fileName: `${id}.${mimeType === "application/pdf" ? "pdf" : "jpg"}`,
  fileUrl: `t1/${id}`,
  mimeType,
  enviadoPor: "Helena Prado",
  em: dia(em),
});

describe("qual é o currículo da ficha", () => {
  it("sem nada, nenhum", () => {
    expect(escolherCurriculo([], [])).toBeNull();
  });

  it("o PDF mais novo, venha do portal ou da ficha", () => {
    expect(escolherCurriculo([portal("c1", "2026-10-04")], [anexo("d1", "2026-10-01")])).toMatchObject({ tipo: "portal", candidaturaId: "c1", pdf: true });
    expect(escolherCurriculo([portal("c1", "2026-10-04")], [anexo("d2", "2026-10-10")])).toMatchObject({ tipo: "documento", documentId: "d2", pdf: true });
  });

  it("uma foto mais nova não passa na frente do PDF — a IA só lê PDF", () => {
    expect(escolherCurriculo([], [anexo("foto", "2026-10-12", "image/jpeg"), anexo("d1", "2026-10-01")])).toMatchObject({ documentId: "d1", pdf: true });
  });

  it("só foto: aparece, marcada como não PDF", () => {
    expect(escolherCurriculo([], [anexo("foto", "2026-10-12", "image/jpeg")])).toMatchObject({ tipo: "documento", documentId: "foto", pdf: false });
  });

  it("o nome do currículo do portal, sem acento nem espaço", () => {
    expect(nomeDoCurriculoDoPortal("Eduardo Ramos")).toBe("curriculo-eduardo-ramos.pdf");
    expect(nomeDoCurriculoDoPortal("  João  da Conceição ")).toBe("curriculo-joao-da-conceicao.pdf");
    expect(nomeDoCurriculoDoPortal("")).toBe("curriculo.pdf");
  });

  it("o resumo é do arquivo do bloco, ou de um anterior", () => {
    const resumo = { sourceDocumentId: "d1", sourceCandidaturaId: null };
    expect(resumoEhDoArquivo(resumo, { tipo: "documento", pdf: true, ...anexo("d1", "2026-10-01") })).toBe(true);
    expect(resumoEhDoArquivo(resumo, { tipo: "documento", pdf: true, ...anexo("d2", "2026-10-02") })).toBe(false);
    expect(resumoEhDoArquivo(resumo, { tipo: "portal", pdf: true, ...portal("c1", "2026-10-02") })).toBe(false);
  });
});

/** Um `prisma.candidateResumeSummary` de mentira. */
function banco(comportamento: { findFirst?: () => unknown; upsert?: () => unknown }) {
  const findFirst = vi.fn(async () => comportamento.findFirst?.() ?? null);
  const upsert = vi.fn(async () => comportamento.upsert?.() ?? {});
  return { db: { candidateResumeSummary: { findFirst, upsert } } as unknown as PrismaClient, findFirst, upsert };
}
const semTabela = () => {
  throw Object.assign(new Error("The table `candidate_resume_summaries` does not exist"), { code: "P2021" });
};

describe("o resumo guardado (Resumo da IA · lido em dd/mm)", () => {
  it("lê no escritório e devolve só textos na lista do que foi preenchido", async () => {
    const readAt = dia("2026-10-14");
    const b = banco({
      findFirst: () => ({
        personId: "p1",
        tenantId: "t1",
        summary: "Auxiliar de produção com 4 anos.",
        filledFields: ["E-mail", 3, "Cidade"],
        readAt,
        sourceDocumentId: "d1",
        sourceCandidaturaId: null,
        sourceFileName: "curriculo.pdf",
      }),
    });
    expect(await lerResumoDoCurriculo(b.db, "t1", "p1")).toEqual({
      summary: "Auxiliar de produção com 4 anos.",
      filledFields: ["E-mail", "Cidade"],
      readAt,
      sourceDocumentId: "d1",
      sourceCandidaturaId: null,
      sourceFileName: "curriculo.pdf",
    });
    expect(b.findFirst).toHaveBeenCalledWith({ where: { personId: "p1", tenantId: "t1" } });
  });

  it("sem resumo, nada", async () => {
    expect(await lerResumoDoCurriculo(banco({}).db, "t1", "p1")).toBeNull();
  });

  it("sem a tabela (deploy antes da migration), a ficha abre sem resumo", async () => {
    expect(await lerResumoDoCurriculo(banco({ findFirst: semTabela }).db, "t1", "p1")).toBeNull();
  });

  it("guarda por pessoa, com a origem do arquivo, e troca o anterior", async () => {
    const b = banco({});
    const ok = await guardarResumoDoCurriculo(b.db, {
      tenantId: "t1",
      personId: "p1",
      summary: "  Resumo.  ",
      filledFields: ["Escolaridade"],
      fonte: { tipo: "portal", pdf: true, ...portal("c1", "2026-10-04") },
      nomeDoArquivo: "curriculo-ana.pdf",
    });
    expect(ok).toBe(true);
    const args = b.upsert.mock.calls[0] as unknown as [{ where: unknown; create: Record<string, unknown>; update: Record<string, unknown> }];
    expect(args[0].where).toEqual({ personId: "p1" });
    expect(args[0].create).toMatchObject({
      personId: "p1",
      tenantId: "t1",
      summary: "Resumo.",
      filledFields: ["Escolaridade"],
      sourceCandidaturaId: "c1",
      sourceDocumentId: null,
      sourceFileName: "curriculo-ana.pdf",
    });
    expect(args[0].update).toMatchObject({ tenantId: "t1", summary: "Resumo.", sourceCandidaturaId: "c1" });
    expect(args[0].update).not.toHaveProperty("personId");
  });

  it("um resumo desgovernado é cortado no teto", async () => {
    const b = banco({});
    await guardarResumoDoCurriculo(b.db, {
      tenantId: "t1",
      personId: "p1",
      summary: "x".repeat(TETO_DO_RESUMO + 500),
      filledFields: [],
      fonte: { tipo: "documento", pdf: true, ...anexo("d1", "2026-10-01") },
      nomeDoArquivo: "d1.pdf",
    });
    const args = b.upsert.mock.calls[0] as unknown as [{ create: { summary: string; sourceDocumentId: string } }];
    expect(args[0].create.summary).toHaveLength(TETO_DO_RESUMO);
    expect(args[0].create.sourceDocumentId).toBe("d1");
  });

  it("sem a tabela, não guarda e não quebra a leitura do currículo", async () => {
    const b = banco({ upsert: semTabela });
    const ok = await guardarResumoDoCurriculo(b.db, {
      tenantId: "t1",
      personId: "p1",
      summary: "Resumo.",
      filledFields: [],
      fonte: { tipo: "documento", pdf: true, ...anexo("d1", "2026-10-01") },
      nomeDoArquivo: "d1.pdf",
    });
    expect(ok).toBe(false);
  });
});
