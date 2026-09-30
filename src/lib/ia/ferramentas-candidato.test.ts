import { describe, expect, it } from "vitest";
import { linkDeInscricao, primeiroNome } from "./ferramentas-candidato";

// No teste de 30/09, sem nome nenhum, o assistente chamou o candidato de
// "Claude". O primeiro nome vem do cadastro, só com o vínculo confirmado.
describe("primeiroNome", () => {
  it("pega a primeira palavra, com só a inicial maiúscula", () => {
    expect(primeiroNome("MARIA DA SILVA")).toBe("Maria");
    expect(primeiroNome("  joão pedro souza ")).toBe("João");
    expect(primeiroNome("Kauan")).toBe("Kauan");
  });
});

// No teste de 29/09, o assistente não tinha como mandar o link de inscrição e
// inventou uma inscrição pelo WhatsApp. O link é o mesmo que a tela da vaga
// mostra como "link público".
describe("linkDeInscricao", () => {
  it("monta o endereço da vaga no portal de carreiras", () => {
    expect(linkDeInscricao("https://useconnect.com.br", "41tech", "e584ec32-0000")).toBe(
      "https://useconnect.com.br/carreiras/41tech/e584ec32-0000"
    );
  });

  it("não duplica a barra da URL base", () => {
    expect(linkDeInscricao("https://useconnect.com.br/", "41tech", "v1")).toBe("https://useconnect.com.br/carreiras/41tech/v1");
  });
});
