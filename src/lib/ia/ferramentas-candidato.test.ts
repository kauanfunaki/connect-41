import { describe, expect, it } from "vitest";
import { linkDeInscricao } from "./ferramentas-candidato";

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
