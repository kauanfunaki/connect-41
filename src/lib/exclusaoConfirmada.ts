// A exclusão de verdade (regras aprovadas pelo Kauan em 13/10/2026):
//
// - registro sem histórico é excluído de fato;
// - registro com histórico mostra o que está ligado a ele e deixa excluir tudo
//   junto;
// - só administrador (ADMIN ou SUPER_ADMIN);
// - a pessoa digita o nome para confirmar;
// - fica registrado quem excluiu.
//
// Inativar não bastava: ~95% do que está em produção é dado de teste, e
// inativo continua ocupando o e-mail, a raiz do CNPJ e a lista.
//
// Este arquivo é a parte pura dessas regras — testada sem Prisma.

import { isFullWrite } from "@/lib/auth/papeis";
import type { UserRole } from "@/generated/prisma/enums";

/** Quem pode excluir de verdade: administrador, e com a assinatura em dia. */
export function podeExcluirDeVerdade(ctx: { role: UserRole; subscriptionReadOnly?: boolean }): boolean {
  return isFullWrite(ctx.role) && !ctx.subscriptionReadOnly;
}

/**
 * Como o texto digitado é comparado: sem espaço sobrando nas pontas ou
 * repetido no meio, e sem diferença de maiúscula. Acento conta — "Joao" não é
 * "João". O objetivo é a pessoa ter lido o nome, não acertar a digitação
 * letra por letra.
 */
export function normalizarParaConfirmar(texto: string): string {
  return texto.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

/** O texto digitado bate com algum dos aceitos (nome, ou nome e e-mail)? Vazio nunca bate. */
export function confirmacaoConfere(digitado: string, aceitos: (string | null | undefined)[]): boolean {
  const d = normalizarParaConfirmar(digitado);
  if (!d) return false;
  return aceitos.some((a) => !!a && normalizarParaConfirmar(a) === d);
}

const NUMERO = new Intl.NumberFormat("pt-BR");

/** "1 mensagem" / "3 mensagens" / "1.204 registros". */
export function plural(n: number, um: string, varios: string): string {
  return `${NUMERO.format(n)} ${n === 1 ? um : varios}`;
}

/**
 * O que um acesso do portal tem ligado a ele, no `_count` do Prisma. Os nomes
 * são os das relações de `PortalUser` no schema.
 */
export const CONTAGEM_DO_ACESSO = {
  clientRequestMessages: true,
  companyMessages: true,
  serviceRequestMessages: true,
  processMessages: true,
  serviceRequestsOpened: true,
  clientRequestAttachments: true,
  serviceRequestAttachments: true,
  processDocuments: true,
  driveFilesEnviados: true,
  financeApprovalEvents: true,
  driveAcessos: true,
  approvalLimits: true,
  announcementReads: true,
  pushSubscriptions: true,
} as const;

export type ContagemDoAcesso = { [K in keyof typeof CONTAGEM_DO_ACESSO]: number };

export type HistoricoDoAcesso = {
  /** O que fica, sem o nome de quem fez (as FKs são `SET NULL`). */
  ficam: string[];
  /** O que é apagado junto (as FKs são `CASCADE`). */
  apagados: string[];
};

/**
 * A contagem, em frases para a janela de confirmação.
 *
 * A divisão segue o banco, não uma escolha da tela: mensagens, solicitações,
 * arquivos, aprovações e registros de download têm `ON DELETE SET NULL` no
 * autor — ficam, sem o nome; limite de aprovação, "comunicado lido" e o
 * aparelho de notificação têm `CASCADE` — são da pessoa e vão com ela.
 */
export function resumirHistoricoDoAcesso(c: ContagemDoAcesso): HistoricoDoAcesso {
  const mensagens = c.clientRequestMessages + c.companyMessages + c.serviceRequestMessages + c.processMessages;
  const arquivos = c.clientRequestAttachments + c.serviceRequestAttachments + c.processDocuments + c.driveFilesEnviados;

  const ficam: string[] = [];
  if (mensagens) ficam.push(plural(mensagens, "mensagem", "mensagens"));
  if (c.serviceRequestsOpened) ficam.push(plural(c.serviceRequestsOpened, "solicitação aberta", "solicitações abertas"));
  if (arquivos) ficam.push(plural(arquivos, "arquivo enviado", "arquivos enviados"));
  if (c.financeApprovalEvents) {
    ficam.push(plural(c.financeApprovalEvents, "aprovação ou reprovação de pagamento", "aprovações ou reprovações de pagamento"));
  }
  if (c.driveAcessos) ficam.push(plural(c.driveAcessos, "registro de arquivo aberto ou baixado", "registros de arquivo aberto ou baixado"));

  const apagados: string[] = [];
  if (c.approvalLimits) apagados.push(plural(c.approvalLimits, "limite de aprovação de pagamento", "limites de aprovação de pagamento"));
  if (c.announcementReads) apagados.push(plural(c.announcementReads, "marca de comunicado lido", "marcas de comunicado lido"));
  if (c.pushSubscriptions) apagados.push(plural(c.pushSubscriptions, "aparelho cadastrado para notificações", "aparelhos cadastrados para notificações"));

  return { ficam, apagados };
}
