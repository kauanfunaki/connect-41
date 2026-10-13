import { describe, expect, it } from "vitest";
import { CONTAGEM_DO_ACESSO, confirmacaoConfere, podeExcluirDeVerdade, resumirHistoricoDoAcesso, type ContagemDoAcesso } from "./exclusaoConfirmada";

const zerada = Object.fromEntries(Object.keys(CONTAGEM_DO_ACESSO).map((k) => [k, 0])) as ContagemDoAcesso;

describe("podeExcluirDeVerdade", () => {
  // Decisão do Kauan, 13/10/2026: só administrador exclui, em qualquer modo.
  it("só ADMIN e SUPER_ADMIN", () => {
    expect(podeExcluirDeVerdade({ role: "SUPER_ADMIN" })).toBe(true);
    expect(podeExcluirDeVerdade({ role: "ADMIN" })).toBe(true);
    expect(podeExcluirDeVerdade({ role: "SECTOR_ADMIN" })).toBe(false);
    expect(podeExcluirDeVerdade({ role: "SECTOR_USER" })).toBe(false);
    expect(podeExcluirDeVerdade({ role: "READONLY" })).toBe(false);
  });

  it("assinatura em modo leitura barra até o administrador", () => {
    expect(podeExcluirDeVerdade({ role: "ADMIN", subscriptionReadOnly: true })).toBe(false);
  });
});

describe("confirmacaoConfere", () => {
  it("aceita o nome sem diferença de maiúscula nem espaço sobrando", () => {
    expect(confirmacaoConfere("  irriga   four ", ["IRRIGA FOUR"])).toBe(true);
  });

  it("aceita qualquer um dos textos aceitos (nome ou e-mail)", () => {
    expect(confirmacaoConfere("ana@exemplo.com", ["Ana Souza", "ana@exemplo.com"])).toBe(true);
  });

  it("recusa texto diferente, pedaço do nome e vazio", () => {
    expect(confirmacaoConfere("IRRIGA", ["IRRIGA FOUR"])).toBe(false);
    expect(confirmacaoConfere("IRRIGA FIVE", ["IRRIGA FOUR"])).toBe(false);
    expect(confirmacaoConfere("", ["IRRIGA FOUR"])).toBe(false);
    expect(confirmacaoConfere("   ", [""])).toBe(false);
  });

  it("acento conta", () => {
    expect(confirmacaoConfere("Joao", ["João"])).toBe(false);
  });
});

describe("resumirHistoricoDoAcesso", () => {
  it("sem nada ligado, as duas listas vêm vazias", () => {
    expect(resumirHistoricoDoAcesso(zerada)).toEqual({ ficam: [], apagados: [] });
  });

  it("soma as mensagens e os arquivos de todas as telas, e separa o que fica do que sai", () => {
    const r = resumirHistoricoDoAcesso({
      ...zerada,
      clientRequestMessages: 2,
      companyMessages: 1,
      serviceRequestMessages: 3,
      processMessages: 1,
      serviceRequestsOpened: 1,
      clientRequestAttachments: 1,
      driveFilesEnviados: 2,
      financeApprovalEvents: 4,
      driveAcessos: 9,
      approvalLimits: 2,
      announcementReads: 1,
      pushSubscriptions: 1,
    });
    expect(r.ficam).toEqual([
      "7 mensagens",
      "1 solicitação aberta",
      "3 arquivos enviados",
      "4 aprovações ou reprovações de pagamento",
      "9 registros de arquivo aberto ou baixado",
    ]);
    expect(r.apagados).toEqual([
      "2 limites de aprovação de pagamento",
      "1 marca de comunicado lido",
      "1 aparelho cadastrado para notificações",
    ]);
  });
});
