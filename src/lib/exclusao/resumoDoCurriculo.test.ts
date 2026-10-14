import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import { criarBancoFalso } from "./bancoFalso";
import { excluirPessoaDeVez } from "./pessoa";
import { COLUNAS_SOLTAS } from "./registro";

// O resumo do currículo lido pela IA (tabela `candidate_resume_summaries`,
// migration 20261014181000) sai com a pessoa. A tabela é nova e sem chave: a
// exclusão não pode depender de ela já existir.

vi.mock("fs/promises", async (original) => ({ ...(await original<typeof import("fs/promises")>()), unlink: vi.fn(async () => undefined) }));

const ADMIN = { id: "admin", role: "ADMIN" };
const CANDIDATO = {
  id: "p1",
  name: "Eduardo Ramos",
  cpf: null,
  email: "eduardo@exemplo.test",
  type: "CANDIDATO",
  isInternal: false,
  linkedUserId: null,
  dataDeletionRequestedAt: null,
};

function escritorio(mexer?: (delegado: string) => number | undefined) {
  return criarBancoFalso({
    mexer,
    achar: (delegado, metodo, args) => {
      const where = (args.where ?? {}) as Record<string, unknown>;
      if (delegado === "person" && metodo === "findFirst" && where.id === "p1" && where.tenantId === "t1") return CANDIDATO;
      if (delegado === "user" && metodo === "findUnique") return { name: "Admin Fulano" };
      return undefined;
    },
  });
}

const indice = (b: ReturnType<typeof escritorio>, delegado: string, metodo: string) =>
  b.chamadas.findIndex((c) => c.delegado === delegado && c.metodo === metodo);

beforeEach(() => vi.clearAllMocks());

describe("exclusão do candidato × resumo do currículo", () => {
  it("está no registro como coluna solta que sai junto", () => {
    expect(COLUNAS_SOLTAS.Person).toContainEqual({ modelo: "CandidateResumeSummary", coluna: "personId", tratamento: "apagar" });
  });

  it("apaga o resumo da pessoa, no escritório, antes da pessoa", async () => {
    const b = escritorio();
    const r = await excluirPessoaDeVez(b.banco as unknown as PrismaClient, { tenantId: "t1", ator: ADMIN, id: "p1", modo: "simples" });
    expect(r.ok).toBe(true);
    const resumo = indice(b, "candidateResumeSummary", "deleteMany");
    expect(resumo).toBeGreaterThan(-1);
    expect(b.chamadas[resumo].args).toEqual({ where: { tenantId: "t1", personId: { in: ["p1"] } } });
    expect(resumo).toBeLessThan(indice(b, "person", "deleteMany"));
  });

  it("sem a tabela (deploy antes da migration), a exclusão segue", async () => {
    const b = escritorio((delegado) => {
      if (delegado === "candidateResumeSummary") throw Object.assign(new Error("tabela não existe"), { code: "P2021" });
      return undefined;
    });
    const r = await excluirPessoaDeVez(b.banco as unknown as PrismaClient, { tenantId: "t1", ator: ADMIN, id: "p1", modo: "simples" });
    expect(r.ok).toBe(true);
    expect(indice(b, "person", "deleteMany")).toBeGreaterThan(-1);
  });

  it("outro erro do banco no resumo desfaz a exclusão (não engole)", async () => {
    const b = escritorio((delegado) => {
      if (delegado === "candidateResumeSummary") throw Object.assign(new Error("conexão caiu"), { code: "P1001" });
      return undefined;
    });
    const r = await excluirPessoaDeVez(b.banco as unknown as PrismaClient, { tenantId: "t1", ator: ADMIN, id: "p1", modo: "simples" });
    expect(r.ok).toBe(false);
    expect(indice(b, "person", "deleteMany")).toBe(-1);
  });
});
