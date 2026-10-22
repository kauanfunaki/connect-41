import { describe, expect, it } from "vitest";
import { aparenciaDoFormulario } from "./formulario";

function form(campos: Record<string, string>) {
  return { get: (nome: string) => campos[nome] ?? null };
}

describe("aparenciaDoFormulario", () => {
  it("vazio é o portal de sempre, com as cores por grupo desligadas só se pedido", () => {
    expect(aparenciaDoFormulario(form({ coresPorGrupo: "on" }))).toEqual({
      corPrincipal: null,
      coresDosGrupos: {},
      coresPorGrupo: true,
      logoNoPortal: false,
      noConnect: false,
    });
  });

  it("lê a cor principal, os grupos trocados e as chaves", () => {
    expect(
      aparenciaDoFormulario(
        form({ corPrincipal: "#e15a2b", cor_fiscal: "#ff0000", cor_financeiro: "", coresPorGrupo: "on", logoNoPortal: "on", noConnect: "on" })
      )
    ).toEqual({ corPrincipal: "#E15A2B", coresDosGrupos: { fiscal: "#FF0000" }, coresPorGrupo: true, logoNoPortal: true, noConnect: true });
  });

  it("recusa cor inválida, em vez de guardar outra coisa", () => {
    expect(aparenciaDoFormulario(form({ corPrincipal: "laranja" }))).toHaveProperty("erro");
    expect(aparenciaDoFormulario(form({ cor_processos: "#12" }))).toHaveProperty("erro");
  });
});
