import { describe, expect, it } from "vitest";
import { linkDaVagaParaOCandidato, linkDeInscricao, primeiroNome } from "./ferramentas-candidato";

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

// 41 Carreiras (14/10/2026): o assistente do WhatsApp da 41 manda o endereço
// próprio do portal; os outros escritórios, o de sempre.
describe("linkDaVagaParaOCandidato", () => {
  const BASE = "https://app.useconnect.com.br";
  const PORTAL = { CARREIRAS_HOSTS: "carreiras.useconnect.com.br,carreiras.41contabil.com.br", CARREIRAS_HOST_PRINCIPAL: "carreiras.41contabil.com.br" };

  it("da 41, com o portal configurado: o endereço principal do 41 Carreiras", () => {
    expect(linkDaVagaParaOCandidato(BASE, "41tech", "v1", PORTAL)).toBe("https://carreiras.41contabil.com.br/vagas/v1");
    // Mesmo sem APP_PUBLIC_URL: o endereço do portal não depende dela.
    expect(linkDaVagaParaOCandidato("", "41tech", "v1", PORTAL)).toBe("https://carreiras.41contabil.com.br/vagas/v1");
  });

  it("dos outros escritórios, ou sem o portal: o link de sempre, e nenhum sem a URL do app", () => {
    expect(linkDaVagaParaOCandidato(BASE, "outro", "v1", PORTAL)).toBe("https://app.useconnect.com.br/carreiras/outro/v1");
    expect(linkDaVagaParaOCandidato(BASE, "41tech", "v1", {})).toBe("https://app.useconnect.com.br/carreiras/41tech/v1");
    expect(linkDaVagaParaOCandidato("", "41tech", "v1", {})).toBeNull();
    expect(linkDaVagaParaOCandidato(BASE, null, "v1", PORTAL)).toBeNull();
  });
});
