import { describe, expect, it } from "vitest";
import { telaDaSugestao, validarSugestao } from "./sugestao";

// A sugestão do portal (21/10/2026) vira o texto de uma solicitação: a nota e a
// tela em cima, o que o cliente escreveu embaixo.
describe("validarSugestao", () => {
  it("monta o texto com a nota, a tela e o comentário", () => {
    expect(validarSugestao({ nota: "4", texto: "  O filtro de mês some no celular. ", tela: "/portal/pagar?mes=2026-10" })).toEqual({
      ok: true,
      descricao: "Nota do portal: 4 de 5 (Bom)\nTela: /portal/pagar\n\nO filtro de mês some no celular.",
    });
  });

  it("só a nota vale; só o texto também; os dois vazios, não", () => {
    expect(validarSugestao({ nota: "5", texto: "", tela: "/portal" })).toMatchObject({ ok: true, descricao: expect.stringContaining("(sem comentário)") });
    expect(validarSugestao({ nota: "", texto: "Gostei", tela: "" })).toEqual({ ok: true, descricao: "\nGostei" });
    expect(validarSugestao({ nota: "", texto: "  ", tela: "/portal" })).toMatchObject({ ok: false });
    expect(validarSugestao({ nota: "9", texto: "", tela: "/portal" })).toMatchObject({ ok: false });
  });

  it("recusa o texto longo demais", () => {
    expect(validarSugestao({ nota: "3", texto: "a".repeat(4001), tela: "/portal" })).toMatchObject({ ok: false });
  });
});

describe("telaDaSugestao", () => {
  it("guarda só caminho do portal, sem consulta nem outro site", () => {
    expect(telaDaSugestao("/portal/solicitacoes/abc#topo")).toBe("/portal/solicitacoes/abc");
    expect(telaDaSugestao("https://outro.site/portal")).toBeNull();
    expect(telaDaSugestao("/admin")).toBeNull();
    expect(telaDaSugestao("/portal/<script>")).toBeNull();
  });
});
