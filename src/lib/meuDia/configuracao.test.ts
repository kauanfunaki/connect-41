import { describe, expect, it } from "vitest";
import { DEFAULT_TASK_WIDGETS } from "@/lib/taskWidgets";
import { blocosDaPessoa, podeConfigurarAPessoa, podeConfigurarOSetor } from "./configuracao";

const coordenador = { userId: "c", role: "SECTOR_ADMIN" as const, sectors: ["bpo"] };
const colaborador = { userId: "u", role: "SECTOR_USER" as const, sectors: ["bpo"] };
const admin = { userId: "a", role: "ADMIN" as const, sectors: [] };

describe("quem configura o Meu dia", () => {
  it("cada um o seu", () => {
    expect(podeConfigurarAPessoa(colaborador, { id: "u", role: "SECTOR_USER", sectors: ["bpo"] })).toBe(true);
  });

  it("o coordenador, o dos colaboradores dos setores dele — não o de outro coordenador nem o de outro setor", () => {
    expect(podeConfigurarAPessoa(coordenador, { id: "u", role: "SECTOR_USER", sectors: ["bpo", "fiscal"] })).toBe(true);
    expect(podeConfigurarAPessoa(coordenador, { id: "x", role: "SECTOR_USER", sectors: ["dp"] })).toBe(false);
    expect(podeConfigurarAPessoa(coordenador, { id: "y", role: "SECTOR_ADMIN", sectors: ["bpo"] })).toBe(false);
  });

  it("o colaborador não mexe no dos outros", () => {
    expect(podeConfigurarAPessoa(colaborador, { id: "z", role: "SECTOR_USER", sectors: ["bpo"] })).toBe(false);
  });

  it("Admin e Super Admin: qualquer pessoa e o padrão do setor", () => {
    expect(podeConfigurarAPessoa(admin, { id: "y", role: "SECTOR_ADMIN", sectors: ["dp"] })).toBe(true);
    expect(podeConfigurarOSetor(admin)).toBe(true);
    expect(podeConfigurarOSetor({ role: "SUPER_ADMIN" })).toBe(true);
    expect(podeConfigurarOSetor(coordenador)).toBe(false);
  });
});

describe("blocosDaPessoa", () => {
  const porSetor = { bpo: ["cards-kanban" as const] };

  it("a configuração da pessoa vale mais que a do setor", () => {
    expect(blocosDaPessoa(JSON.stringify(["reunioes"]), ["bpo"], porSetor)).toEqual(["reunioes"]);
  });

  it("sem a dela, a do setor; sem setor configurado, tudo", () => {
    expect(blocosDaPessoa(null, ["bpo"], porSetor)).toEqual(["cards-kanban"]);
    expect(blocosDaPessoa(null, ["dp"], porSetor)).toEqual(DEFAULT_TASK_WIDGETS);
  });

  it("a da pessoa pode ser vazia de propósito", () => {
    expect(blocosDaPessoa("[]", ["bpo"], porSetor)).toEqual([]);
  });
});
