import { describe, expect, it } from "vitest";
import { idDoEmail } from "./idDoEmail";

describe("idDoEmail (09/10/2026)", () => {
  it("usa o Message-ID quando ele vem", () => {
    expect(idDoEmail({ messageId: "  <abc@junta.pr.gov.br>  " })).toBe("<abc@junta.pr.gov.br>");
  });

  it("sem Message-ID, monta um id fixo do próprio e-mail", () => {
    const email = { remetente: "nao-responda@nfse.gov.br", data: "2026-10-07T19:31:44.000Z", assunto: "Primeiro acesso ao Sistema Nacional da NFS-e", texto: "O código para validação…" };
    const id = idDoEmail(email);
    expect(id).toMatch(/^sem-message-id:[0-9a-f]{64}$/);
    // O mesmo e-mail entregue de novo dá o mesmo id — é o que evita duplicar.
    expect(idDoEmail({ ...email, messageId: null })).toBe(id);
  });

  it("e-mails diferentes sem Message-ID dão ids diferentes", () => {
    const a = idDoEmail({ remetente: "x@y", data: "2026-10-07", assunto: "A" });
    const b = idDoEmail({ remetente: "x@y", data: "2026-10-07", assunto: "B" });
    expect(a).not.toBe(b);
  });

  it("cabe na coluna (255)", () => {
    expect(idDoEmail({ messageId: "x".repeat(400) }).length).toBe(255);
    expect(idDoEmail({ assunto: "z".repeat(5000) }).length).toBeLessThanOrEqual(255);
  });
});
