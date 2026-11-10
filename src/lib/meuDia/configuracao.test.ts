import { describe, expect, it } from "vitest";
import { DEFAULT_TASK_WIDGETS, padraoDoSetor, serializeTaskWidgets } from "@/lib/taskWidgets";
import { blocosDaPessoa, blocosDoSetor, podeConfigurarAPessoa, podeConfigurarOSetor, setoresQueConfigura } from "./configuracao";

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

  it("Admin e Super Admin: qualquer pessoa e o padrão de qualquer setor", () => {
    expect(podeConfigurarAPessoa(admin, { id: "y", role: "SECTOR_ADMIN", sectors: ["dp"] })).toBe(true);
    expect(podeConfigurarOSetor(admin, "bpo")).toBe(true);
    expect(podeConfigurarOSetor({ role: "SUPER_ADMIN", sectors: [] }, "dp")).toBe(true);
  });

  // 10/11/2026 (pedido do Kauan): o coordenador também define o padrão do setor dele.
  it("o coordenador configura o padrão do setor dele, e só dele", () => {
    expect(podeConfigurarOSetor(coordenador, "bpo")).toBe(true);
    expect(podeConfigurarOSetor(coordenador, "fiscal")).toBe(false);
  });

  it("colaborador e somente leitura não configuram setor", () => {
    expect(podeConfigurarOSetor(colaborador, "bpo")).toBe(false);
    expect(podeConfigurarOSetor({ role: "READONLY", sectors: ["bpo"] }, "bpo")).toBe(false);
  });

  it("os setores do “Padrão do setor”: todos para o admin, os dele para o coordenador", () => {
    const setores = [{ code: "bpo" }, { code: "fiscal" }, { code: "dp" }];
    expect(setoresQueConfigura(admin, setores).map((s) => s.code)).toEqual(["bpo", "fiscal", "dp"]);
    expect(setoresQueConfigura(coordenador, setores).map((s) => s.code)).toEqual(["bpo"]);
    expect(setoresQueConfigura(colaborador, setores)).toEqual([]);
  });
});

describe("blocosDoSetor", () => {
  it("sem configuração, o padrão do código — sem reuniões no setor que não usa", () => {
    expect(blocosDoSetor(null, true)).toEqual(DEFAULT_TASK_WIDGETS);
    expect(blocosDoSetor(null, false)).not.toContain("reunioes");
  });

  it("a configuração gravada vale mais que o código", () => {
    expect(blocosDoSetor(serializeTaskWidgets(["reunioes"]), false)).toEqual(["reunioes"]);
  });

  it("a lista antiga do setor decide as três chaves de antes; as novas vêm do código", () => {
    const blocos = blocosDoSetor(JSON.stringify(["cards-kanban"]), true);
    expect(blocos).toContain("cards-kanban");
    expect(blocos).not.toContain("transferencias");
    expect(blocos).not.toContain("reunioes");
    expect(blocos).toContain("prazos-semana");
  });
});

describe("blocosDaPessoa", () => {
  const porSetor = { bpo: ["cards-kanban" as const] };

  it("a configuração da pessoa vale mais que a do setor", () => {
    expect(blocosDaPessoa(serializeTaskWidgets(["reunioes"]), ["bpo"], porSetor)).toEqual(["reunioes"]);
  });

  it("sem a dela, a do setor; sem setor configurado, o padrão do código", () => {
    expect(blocosDaPessoa(null, ["bpo"], porSetor)).toEqual(["cards-kanban"]);
    expect(blocosDaPessoa(null, ["dp"], porSetor)).toEqual(DEFAULT_TASK_WIDGETS);
    expect(blocosDaPessoa(null, ["dp"], porSetor, () => padraoDoSetor(false))).not.toContain("reunioes");
  });

  it("a da pessoa pode ser vazia de propósito", () => {
    expect(blocosDaPessoa(serializeTaskWidgets([]), ["bpo"], porSetor)).toEqual([]);
  });

  // Pessoa > setor > código, chave a chave: a lista antiga da pessoa só fala
  // das três chaves de antes; as novas seguem o setor dela.
  it("o que a configuração da pessoa não conhece segue o setor", () => {
    const doSetor = { fiscal: padraoDoSetor(false).filter((k) => k !== "societario") };
    const blocos = blocosDaPessoa(JSON.stringify(["reunioes"]), ["fiscal"], doSetor);
    expect(blocos).toContain("reunioes");
    expect(blocos).toContain("prazos-semana");
    expect(blocos).not.toContain("societario");
    expect(blocos).not.toContain("transferencias");
  });
});
