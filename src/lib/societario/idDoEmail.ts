import { createHash } from "node:crypto";

/**
 * O identificador do e-mail que chega à caixa do Societário (09/10/2026).
 *
 * Vale o `Message-ID` quando ele vem. Nem todo remetente manda: o código de
 * primeiro acesso do Sistema Nacional da NFS-e chegou sem, e a rota recusava o
 * e-mail ("messageId é obrigatório") — o n8n marcava erro, e um aviso de verdade
 * sem o cabeçalho se perderia do mesmo jeito. Sem ele, o identificador é um
 * resumo fixo do próprio e-mail (remetente, data, assunto e o começo do
 * texto): o mesmo e-mail entregue duas vezes continua dando o mesmo id, que é
 * o que a gravação usa para não duplicar.
 */
export function idDoEmail(email: {
  messageId?: string | null;
  remetente?: string | null;
  data?: string | null;
  assunto?: string | null;
  texto?: string | null;
}): string {
  const doCabecalho = email.messageId?.trim();
  if (doCabecalho) return doCabecalho.slice(0, 255);
  const base = [email.remetente, email.data, email.assunto, (email.texto ?? "").slice(0, 500)]
    .map((parte) => (parte ?? "").trim())
    .join("\n");
  return `sem-message-id:${createHash("sha256").update(base).digest("hex")}`;
}
