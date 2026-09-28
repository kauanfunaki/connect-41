import { describe, expect, it } from "vitest";
import { lerAvisoDaJunta, textoDoEmail } from "./junta-email";

// Textos sintéticos: em 28/09 ainda não havia e-mail real da Junta de exemplo.
// Quando chegarem, entram aqui como casos de verdade.
const PENDENTES = ["PRN2512345678", "PRP2523827360"];
const email = (texto: string, assunto = "Empresa Fácil - andamento do processo", remetente = "naoresponda@empresafacil.pr.gov.br") => ({
  remetente,
  assunto,
  texto,
});

describe("aviso da Junta por e-mail", () => {
  it("acha o protocolo que acompanhamos, mesmo com espaço e hífen no meio", () => {
    const r = lerAvisoDaJunta(email("O processo PRN 2512-345678 foi colocado em exigência."), PENDENTES);
    expect(r.protocolos).toEqual(["PRN2512345678"]);
    expect(r.ehDaJunta).toBe(true);
  });

  it("exigência vira sugestão de exigência, com o trecho para a pessoa revisar", () => {
    const r = lerAvisoDaJunta(
      email("Prezado,\n\nProtocolo PRN2512345678.\nSituação: EM EXIGÊNCIA\nFalta a assinatura do sócio no contrato."),
      PENDENTES
    );
    expect(r.sugestao).toBe("EXIGENCIA");
    expect(r.detalhe).toContain("Falta a assinatura do sócio");
  });

  it("deferido vira sugestão de deferido", () => {
    const r = lerAvisoDaJunta(email("Seu processo PRN2512345678 foi DEFERIDO e registrado."), PENDENTES);
    expect(r.sugestao).toBe("DEFERIDO");
    expect(r.detalhe).toBeNull();
  });

  it("INDEFERIDO não conta como deferido", () => {
    const r = lerAvisoDaJunta(email("O processo PRN2512345678 foi indeferido."), PENDENTES);
    expect(r.sugestao).toBe("CANCELADO");
  });

  it("reaproveitamento sugere cancelado e traz o protocolo novo", () => {
    const r = lerAvisoDaJunta(
      email(
        "ESTE PROCESSO ESTÁ CANCELADO POR TER SIDO REAPROVEITADO PELO USUÁRIO, GERANDO OUTRO PROTOCOLO DE NÚMERO: PRP2523827360."
      ),
      PENDENTES
    );
    expect(r.sugestao).toBe("CANCELADO");
    expect(r.protocoloNovo).toBe("PRP2523827360");
  });

  it("dois desfechos no mesmo texto não viram palpite: vai para revisão", () => {
    const r = lerAvisoDaJunta(email("Consulta prévia DEFERIDA. Inscrição municipal EM EXIGÊNCIA."), PENDENTES);
    expect(r.sugestao).toBe("REVISAR");
  });

  it("sem palavra de desfecho, revisão", () => {
    expect(lerAvisoDaJunta(email("Seu protocolo PRN2512345678 foi recebido."), PENDENTES).sugestao).toBe("REVISAR");
  });

  it("e-mail que não é da Junta nem cita protocolo nosso é reconhecido como alheio", () => {
    const r = lerAvisoDaJunta(email("Segue o contrato assinado.", "Contrato", "cliente@empresa.com.br"), PENDENTES);
    expect(r.ehDaJunta).toBe(false);
    expect(r.protocolos).toEqual([]);
  });

  it("número curto demais não casa por acaso com qualquer texto", () => {
    const r = lerAvisoDaJunta(email("Pedido 12345 atualizado."), ["12345"]);
    expect(r.protocolos).toEqual([]);
  });
});

describe("texto do e-mail", () => {
  it("usa o texto puro quando existe", () => {
    expect(textoDoEmail("  Olá\n\n\n\nmundo ", "<p>ignorado</p>")).toBe("Olá\n\nmundo");
  });
  it("tira o HTML quando só vem HTML", () => {
    expect(textoDoEmail(null, "<p>Processo <b>DEFERIDO</b></p><script>x()</script>")).toBe("Processo DEFERIDO");
  });
});
