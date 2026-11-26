import { describe, expect, it } from "vitest";
import { destinoDaAbertura, lerFormularioDaAbertura, resumoDoDestino, separarAutomaticos, VALOR_DA_LISTA_PADRAO } from "./aberturaAutomatica";

const formulario = (campos: Record<string, string>) => ({ get: (nome: string) => campos[nome] ?? null });

describe("onde o processo vira cartão", () => {
  it("sem configuração, ligada na lista padrão", () => {
    expect(destinoDaAbertura(null)).toEqual({ ligada: true, lista: { tipo: "padrao" } });
  });

  it("desligada não abre, seja qual for a lista", () => {
    expect(destinoDaAbertura({ ativo: false, pipelineId: "l1" })).toEqual({ ligada: false });
  });

  it("ligada na lista escolhida, ou na padrão quando a escolhida sumiu", () => {
    expect(destinoDaAbertura({ ativo: true, pipelineId: "l1" })).toEqual({ ligada: true, lista: { tipo: "escolhida", pipelineId: "l1" } });
    expect(destinoDaAbertura({ ativo: true, pipelineId: null })).toEqual({ ligada: true, lista: { tipo: "padrao" } });
  });

  it("o resumo diz o destino em português", () => {
    expect(resumoDoDestino({ ligada: false }, null)).toMatch(/^Desligada/);
    expect(resumoDoDestino({ ligada: true, lista: { tipo: "padrao" } }, null)).toContain("Processos › Processos societários");
    expect(resumoDoDestino({ ligada: true, lista: { tipo: "escolhida", pipelineId: "l1" } }, "Societário › Abertura")).toContain("Societário › Abertura");
  });
});

describe("o formulário da tela", () => {
  it("lê o liga/desliga e a lista", () => {
    expect(lerFormularioDaAbertura(formulario({ ativo: "1", lista: "l1" }))).toEqual({ ok: true, ativo: true, pipelineId: "l1" });
    expect(lerFormularioDaAbertura(formulario({ lista: VALOR_DA_LISTA_PADRAO }))).toEqual({ ok: true, ativo: false, pipelineId: null });
    expect(lerFormularioDaAbertura(formulario({ ativo: "1" }))).toEqual({ ok: true, ativo: true, pipelineId: null });
  });

  it("recusa valor fora do tamanho de um id", () => {
    expect(lerFormularioDaAbertura(formulario({ ativo: "1", lista: "x".repeat(200) })).ok).toBe(false);
  });
});

it("separa o que o sistema criou do que a equipe criou, na ordem", () => {
  const { automaticos, daEquipe } = separarAutomaticos([
    { id: "a", systemKey: null },
    { id: "b", systemKey: "processos" },
    { id: "c", systemKey: null },
  ]);
  expect(automaticos.map((i) => i.id)).toEqual(["b"]);
  expect(daEquipe.map((i) => i.id)).toEqual(["a", "c"]);
});
