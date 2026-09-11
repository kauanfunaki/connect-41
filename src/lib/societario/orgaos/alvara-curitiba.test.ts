import { describe, it, expect } from "vitest";
import {
  normalizarInscricao,
  inscricaoValida,
  lerObservacoes,
  CONTRATO_PENDENTE,
  ACEITE_ANTES_DE_IMPRIMIR,
} from "./alvara-curitiba";

describe("inscrição municipal", () => {
  // O site exibe formatada — "17 19 804.925-8" — e aceita só os oito números.
  // Mandar a máscara devolve "não encontrado", e registrar isso como se a
  // empresa não tivesse alvará é o erro mais bobo desta classe de robô.
  it("tira a máscara que o próprio site mostra", () => {
    // O que a pessoa digita são os oito dígitos; a máscara vem com ou sem.
    expect(normalizarInscricao("0804925-8")).toBe("08049258");
    expect(normalizarInscricao("08049258")).toBe("08049258");
    // O que o site EXIBE de volta tem prefixo e onze dígitos — não é o que se
    // digita, e por isso não passa na validação de oito.
    expect(normalizarInscricao("17 19 804.925-8")).toBe("17198049258");
  });

  it("valida os oito dígitos", () => {
    expect(inscricaoValida("0804925-8")).toBe(true);
    expect(inscricaoValida("08049258")).toBe(true);
  });

  it("recusa o que não tem oito dígitos", () => {
    expect(inscricaoValida("804925")).toBe(false);
    expect(inscricaoValida("171980492 58")).toBe(false);
    expect(inscricaoValida("")).toBe(false);
    expect(inscricaoValida(null)).toBe(false);
  });
});

describe("lerObservacoes", () => {
  // O texto real, copiado da consulta de 11/09/2026.
  const REAL = "Alvará emitido pelo Protocolo PRP2151987803, em 11/08/2023.";

  it("extrai o protocolo e a data da observação real", () => {
    expect(lerObservacoes(REAL)).toEqual({
      protocolo: "PRP2151987803",
      emitidoEm: "11/08/2023",
    });
  });

  // Observação é campo livre do órgão. Um regex que force o casamento produz
  // data errada na ficha da empresa — e data errada de alvará é pior que data
  // ausente, porque ninguém vai conferir.
  it("texto fora do formato devolve nulo, e não um palpite", () => {
    expect(lerObservacoes("Alvará vigente.")).toBeNull();
    expect(lerObservacoes("")).toBeNull();
    expect(lerObservacoes("emitido em 11/08/2023")).toBeNull();
  });
});

describe("o contrato", () => {
  // Três itens, contra oito do SIMA: a consulta pública é a parte que já foi
  // observada de ponta a ponta.
  it("o que falta é curto, e nomeado", () => {
    expect(CONTRATO_PENDENTE).toHaveLength(3);
  });

  // O aceite é declaração em nome do cliente. Quem marca assume — por isso ele
  // está registrado como texto, e não como passo automático.
  it("o aceite de acessibilidade está guardado verbatim", () => {
    expect(ACEITE_ANTES_DE_IMPRIMIR).toContain("acessibilidade");
    expect(ACEITE_ANTES_DE_IMPRIMIR).toContain("adequarei");
  });
});
