import { describe, expect, it } from "vitest";
import { GRUPO_DA_SECAO, SECOES_DO_PORTAL, TELAS_DO_PORTAL, grupoDoCaminho } from "./telas";

describe("grupoDoCaminho (cor por grupo, 21/10/2026)", () => {
  it("dá o grupo da tela e dos detalhes dela", () => {
    expect(grupoDoCaminho("/portal/pagar")).toBe("financeiro");
    expect(grupoDoCaminho("/portal/documentos")).toBe("fiscal");
    expect(grupoDoCaminho("/portal/processos/abc123")).toBe("processos");
    expect(grupoDoCaminho("/portal/solicitacoes/nova")).toBe("atendimento");
  });

  it("as Aprovações são do financeiro, embora morem em “Com a equipe”", () => {
    expect(grupoDoCaminho("/portal/aprovacoes")).toBe("financeiro");
  });

  it("o Início, Minha conta e Ajuda ficam na cor principal", () => {
    expect(grupoDoCaminho("/portal")).toBeNull();
    expect(grupoDoCaminho("/portal/conta")).toBeNull();
    expect(grupoDoCaminho("/portal/ajuda")).toBeNull();
  });

  it("não confunde o começo do nome com a tela", () => {
    expect(grupoDoCaminho("/portal/pagarx")).toBeNull();
  });

  it("toda tela do catálogo, fora o Início, tem grupo", () => {
    for (const t of TELAS_DO_PORTAL.filter((t) => t.href !== "/portal")) expect(t.grupo, t.href).not.toBeNull();
  });

  it("toda seção do menu tem a cor de um grupo", () => {
    for (const s of SECOES_DO_PORTAL) expect(GRUPO_DA_SECAO[s]).toBeTruthy();
  });
});
