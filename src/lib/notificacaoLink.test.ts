import { describe, it, expect } from "vitest";
import { linkDaNotificacao } from "./notificacaoLink";

describe("linkDaNotificacao", () => {
  it("leva cada tipo para a sua tela", () => {
    expect(linkDaNotificacao({ type: "WHATSAPP_HANDOFF", entityId: "t1" })).toBe("/whatsapp/t1");
    expect(linkDaNotificacao({ type: "NEW_APPLICATION", entityType: "PERSON", entityId: "p1" })).toBe("/pessoas/p1");
    expect(linkDaNotificacao({ type: "COMPANY_MESSAGE", entityType: "COMPANY", entityId: "c1" })).toBe("/empresas/c1");
    expect(linkDaNotificacao({ type: "PROCESS_MESSAGE", entityId: "pr1" })).toBe("/processos/pr1");
    expect(linkDaNotificacao({ type: "SOLICITACAO_NOVA", entityId: "s1" })).toBe("/solicitacoes/s1");
    expect(linkDaNotificacao({ type: "SOLICITACAO_PRAZO", entityId: "s1" })).toBe("/solicitacoes/s1");
    expect(linkDaNotificacao({ type: "LEAD_NOVO", entityId: "l1" })).toBe("/leads/l1");
    expect(linkDaNotificacao({ type: "client_request_answered", entityId: "r1" })).toBe("/pendencias/r1");
    expect(linkDaNotificacao({ type: "MENTION", entityType: null, entityId: null })).toBeNull();
  });

  it("menção e comentário levam ao card; as antigas, com empresa, continuam na empresa", () => {
    expect(linkDaNotificacao({ type: "MENTION", entityType: null, entityId: "i1" })).toBe("/kanban/itens/i1");
    expect(linkDaNotificacao({ type: "COMMENT", entityId: "i1" })).toBe("/kanban/itens/i1");
    expect(linkDaNotificacao({ type: "COMMENT", entityType: "COMPANY", entityId: "c1" })).toBe("/empresas/c1");
  });

  it("com o número já lido (o chip do sino), vai pelo endereço curto — só se for da mesma tela (10/11/2026)", () => {
    expect(linkDaNotificacao({ type: "PROCESS_MESSAGE", entityId: "pr1" }, { tela: "processo", numero: 12 })).toBe("/processos/processo-12");
    expect(linkDaNotificacao({ type: "COMMENT", entityId: "i1" }, { tela: "tarefa", numero: 77 })).toBe("/kanban/itens/tarefa-77");
    expect(linkDaNotificacao({ type: "COMPANY_MESSAGE", entityType: "COMPANY", entityId: "c1" }, { tela: "empresa", numero: 301 })).toBe("/empresas/empresa-301");
    expect(linkDaNotificacao({ type: "HANDOFF_RECEIVED", entityId: "h1" }, { tela: "transferencia", numero: 8 })).toBe("/transferencias/transferencia-8");
    expect(linkDaNotificacao({ type: "client_request_answered", entityId: "r1" }, { tela: "pendencia", numero: 9 })).toBe("/pendencias/pendencia-9");
    // Número de outra tela não entra: o link fica com o uuid.
    expect(linkDaNotificacao({ type: "PROCESS_MESSAGE", entityId: "pr1" }, { tela: "empresa", numero: 3 })).toBe("/processos/pr1");
    expect(linkDaNotificacao({ type: "CHAMADO_NOVO", entityId: "t1" })).toBe("/chamados/t1");
  });

  it("robô parado no captcha abre a tela espelhada daquela tarefa", () => {
    expect(linkDaNotificacao({ type: "ROBO_CAPTCHA", entityId: "0b6f3c1e-8d2a-4c6b-9f1e-2a3b4c5d6e7f" })).toBe("/robo/assistir/0b6f3c1e-8d2a-4c6b-9f1e-2a3b4c5d6e7f");
    expect(linkDaNotificacao({ type: "ROBO_CAPTCHA" })).toBe("/robo");
    expect(linkDaNotificacao({ type: "ROBO_PRECISA_DE_VOCE", entityId: "t1" })).toBe("/robo");
  });

  it("aviso de transferência novo abre a transferência; o de antes, com empresa ou pessoa, abre a ficha", () => {
    for (const type of [
      "HANDOFF_RECEIVED",
      "HANDOFF_ASSIGNED",
      "HANDOFF_MENTION",
      "HANDOFF_SECTOR_DONE",
      "HANDOFF_STALE",
      // A transferência aberta (10/11/2026).
      "HANDOFF_RETURNED",
      "HANDOFF_RESENT",
      "HANDOFF_COMMENT",
    ]) {
      expect(linkDaNotificacao({ type, entityType: null, entityId: "h1" })).toBe("/transferencias/h1");
    }
    expect(linkDaNotificacao({ type: "HANDOFF_RECEIVED", entityType: "COMPANY", entityId: "c1" })).toBe("/empresas/c1");
    expect(linkDaNotificacao({ type: "HANDOFF_ASSIGNED", entityType: "PERSON", entityId: "p1" })).toBe("/pessoas/p1");
    expect(linkDaNotificacao({ type: "HANDOFF_RECEIVED", entityType: null, entityId: null })).toBeNull();
    // A conversa passada no WhatsApp não é transferência entre setores.
    expect(linkDaNotificacao({ type: "WHATSAPP_HANDOFF", entityId: "t1" })).toBe("/whatsapp/t1");
  });

  it("aviso da Junta sem processo leva à lista de avisos", () => {
    expect(linkDaNotificacao({ type: "AVISO_ORGAO_SEM_PROCESSO" })).toBe("/processos/avisos");
    expect(linkDaNotificacao({ type: "PROCESS_AVISO_JUNTA", entityId: "pr1" })).toBe("/processos/pr1");
  });
});
