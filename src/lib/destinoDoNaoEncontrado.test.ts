import { describe, expect, it } from "vitest";
import { destinoDoNaoEncontrado } from "./destinoDoNaoEncontrado";

describe("destino da página não encontrada", () => {
  it("cliente no portal volta ao portal, não ao login da equipe", () => {
    expect(destinoDoNaoEncontrado("/portal/financeiro/xyz")).toEqual({ href: "/portal", rotulo: "Ir para o portal" });
  });

  it("candidato fica nas vagas da empresa do endereço", () => {
    expect(destinoDoNaoEncontrado("/carreiras/41-tallent/vagas/nao-existe")).toEqual({ href: "/carreiras/41-tallent", rotulo: "Ver as vagas" });
    expect(destinoDoNaoEncontrado("/carreiras")).toEqual({ href: "/carreiras", rotulo: "Ver o portal de vagas" });
  });

  it("link por token não tem início: volta", () => {
    for (const c of ["/admissao/abc", "/d/abc", "/teste/abc"]) expect(destinoDoNaoEncontrado(c)).toEqual({ voltar: true, rotulo: "Voltar" });
  });

  it("o resto vai ao início da equipe", () => {
    expect(destinoDoNaoEncontrado("/qualquer/coisa?x=1")).toEqual({ href: "/home", rotulo: "Ir para o início" });
    expect(destinoDoNaoEncontrado(null)).toEqual({ href: "/home", rotulo: "Ir para o início" });
  });
});
