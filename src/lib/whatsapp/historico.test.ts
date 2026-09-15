import { describe, it, expect } from "vitest";
import {
  montarPerguntaComHistorico,
  MAX_MENSAGENS_NO_HISTORICO,
  MAX_CARACTERES_POR_MENSAGEM,
  type MensagemDoHistorico,
} from "./historico";

describe("montarPerguntaComHistorico", () => {
  it("sem histórico, a pergunta é só a mensagem nova", () => {
    expect(montarPerguntaComHistorico([], "Oi")).toBe("Oi");
  });

  it("leva o que foi oferecido, para o 'quero' ter contexto", () => {
    const pergunta = montarPerguntaComHistorico(
      [
        { direcao: "ENTRADA", texto: "Quem são vocês" },
        { direcao: "SAIDA", texto: "Quer que eu verifique o seu status ou mostre as vagas disponíveis?" },
      ],
      "Quero por favor"
    );
    expect(pergunta).toContain("Candidato: Quem são vocês");
    expect(pergunta).toContain("Você: Quer que eu verifique o seu status ou mostre as vagas disponíveis?");
    expect(pergunta.trim().endsWith("Quero por favor")).toBe(true);
  });

  it("mantém a ordem da mais antiga para a mais nova", () => {
    const pergunta = montarPerguntaComHistorico(
      [
        { direcao: "ENTRADA", texto: "primeira" },
        { direcao: "SAIDA", texto: "segunda" },
      ],
      "terceira"
    );
    expect(pergunta.indexOf("primeira")).toBeLessThan(pergunta.indexOf("segunda"));
    expect(pergunta.indexOf("segunda")).toBeLessThan(pergunta.indexOf("terceira"));
  });

  it("guarda só as últimas mensagens", () => {
    const anteriores: MensagemDoHistorico[] = Array.from({ length: MAX_MENSAGENS_NO_HISTORICO + 5 }, (_, i) => ({
      direcao: "ENTRADA",
      texto: `msg-${i}`,
    }));
    const pergunta = montarPerguntaComHistorico(anteriores, "nova");
    expect(pergunta).not.toContain("msg-0\n");
    expect(pergunta).not.toContain("msg-4\n");
    expect(pergunta).toContain(`msg-${MAX_MENSAGENS_NO_HISTORICO + 4}`);
  });

  it("corta mensagem enorme e descarta vazia", () => {
    const pergunta = montarPerguntaComHistorico(
      [
        { direcao: "ENTRADA", texto: "x".repeat(MAX_CARACTERES_POR_MENSAGEM + 100) },
        { direcao: "SAIDA", texto: "   " },
      ],
      "nova"
    );
    expect(pergunta).toContain(`${"x".repeat(MAX_CARACTERES_POR_MENSAGEM)}…`);
    expect(pergunta).not.toContain("Você:");
  });
});
