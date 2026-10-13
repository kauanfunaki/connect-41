import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarBancoFalso } from "@/lib/exclusao/bancoFalso";

// O que se testa: as actions da exclusão conferem papel, assinatura e tenant
// no servidor — chamadas por POST direto, sem passar pela tela. Gestor de
// setor, colaborador e somente leitura não excluem nada, nem pedem a prévia.

const ctx = { tenantId: "t1", userId: "admin", role: "ADMIN", subscriptionReadOnly: false, sectors: [] as string[] };
let banco = criarBancoFalso();

vi.mock("@/lib/prisma", () => ({ getPrisma: () => banco.banco }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/auth/context", async (original) => ({
  ...(await original<typeof import("@/lib/auth/context")>()),
  getAuthContext: async () => ctx,
}));

const { previaDaExclusao, excluirCadastro } = await import("./exclusao-actions");
const { excluirEmpresasEmMassa } = await import("./empresas/actions");

beforeEach(() => {
  banco = criarBancoFalso();
  ctx.role = "ADMIN";
  ctx.subscriptionReadOnly = false;
  ctx.tenantId = "t1";
});

describe("actions da exclusão", () => {
  for (const role of ["SECTOR_ADMIN", "SECTOR_USER", "READONLY"]) {
    it(`${role}: nem prévia, nem exclusão, nem massa — e nada toca no banco`, async () => {
      ctx.role = role;
      const erro = "Só o Administrador ou o Super Admin pode excluir.";
      expect(await previaDaExclusao("empresa", "e1")).toEqual({ erro });
      for (const tipo of ["empresa", "pessoa", "usuario"] as const) {
        expect(await excluirCadastro({ tipo, id: "x", modo: "completo", confirmacao: "x" })).toEqual({ ok: false, erro });
      }
      expect(await excluirEmpresasEmMassa(["e1"])).toEqual({ erro });
      expect(banco.chamadas).toEqual([]);
    });
  }

  it("assinatura em somente leitura: administrador também não exclui", async () => {
    ctx.subscriptionReadOnly = true;
    expect(await excluirCadastro({ tipo: "empresa", id: "e1", modo: "simples" })).toMatchObject({ ok: false, erro: expect.stringContaining("somente leitura") });
    expect(await excluirEmpresasEmMassa(["e1"])).toMatchObject({ erro: expect.stringContaining("somente leitura") });
    expect(banco.chamadas).toEqual([]);
  });

  it("pedido torto não chega ao banco", async () => {
    expect(await excluirCadastro({ tipo: "tenant" as never, id: "e1", modo: "simples" })).toEqual({ ok: false, erro: "Pedido inválido." });
    expect(await excluirCadastro({ tipo: "empresa", id: "e1", modo: "tudo" as never })).toEqual({ ok: false, erro: "Pedido inválido." });
    expect(await previaDaExclusao("empresa", "")).toEqual({ erro: "Pedido inválido." });
    expect(banco.chamadas).toEqual([]);
  });

  it("administrador: a busca vai pelo tenant da sessão", async () => {
    expect(await previaDaExclusao("empresa", "e1")).toEqual({ erro: "Cadastro não encontrado." });
    expect(banco.chamadas[0]).toMatchObject({ delegado: "company", metodo: "findFirst", args: { where: { id: "e1", tenantId: "t1" } } });

    expect(await excluirCadastro({ tipo: "usuario", id: "u9", modo: "simples" })).toEqual({ ok: false, erro: "Usuário não encontrado." });
    expect(banco.chamadas.at(-1)).toMatchObject({ delegado: "user", metodo: "findFirst", args: { where: { id: "u9", tenantId: "t1" } } });
  });
});
