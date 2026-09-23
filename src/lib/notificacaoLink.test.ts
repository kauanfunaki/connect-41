import { describe, it, expect } from "vitest";
import { linkDaNotificacao } from "./notificacaoLink";

describe("linkDaNotificacao", () => {
  it("leva cada tipo para a sua tela", () => {
    expect(linkDaNotificacao({ type: "WHATSAPP_HANDOFF", entityId: "t1" })).toBe("/whatsapp/t1");
    expect(linkDaNotificacao({ type: "NEW_APPLICATION", entityType: "PERSON", entityId: "p1" })).toBe("/pessoas/p1");
    expect(linkDaNotificacao({ type: "COMPANY_MESSAGE", entityType: "COMPANY", entityId: "c1" })).toBe("/empresas/c1");
    expect(linkDaNotificacao({ type: "MENTION", entityType: null, entityId: null })).toBeNull();
  });
});
