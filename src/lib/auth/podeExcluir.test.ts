import { describe, expect, it } from "vitest";
import type { UserRole } from "@/generated/prisma/enums";
import { podeExcluir, canManageSector } from "./papeis";

// A regra de 13/10/2026: "Usuário, coordenador e gestor não pode excluir nada,
// só admin e super admin." O gestor do setor (SECTOR_ADMIN) segue gerindo o
// setor — só a exclusão sobe para o administrador.
const quem = (role: UserRole, subscriptionReadOnly = false) => ({ role, sectors: ["bpo"], subscriptionReadOnly });

describe("podeExcluir — matriz de papéis", () => {
  const matriz: [UserRole, boolean][] = [
    ["SUPER_ADMIN", true],
    ["ADMIN", true],
    ["SECTOR_ADMIN", false],
    ["SECTOR_USER", false],
    ["READONLY", false],
  ];

  it.each(matriz)("%s → %s", (role, esperado) => {
    expect(podeExcluir(quem(role))).toBe(esperado);
  });

  it("o gestor do setor gere o setor, mas não exclui", () => {
    const gestor = quem("SECTOR_ADMIN");
    expect(canManageSector(gestor, "bpo")).toBe(true);
    expect(podeExcluir(gestor)).toBe(false);
  });

  it("assinatura em somente leitura barra até o administrador", () => {
    expect(podeExcluir(quem("SUPER_ADMIN", true))).toBe(false);
    expect(podeExcluir(quem("ADMIN", true))).toBe(false);
  });
});
