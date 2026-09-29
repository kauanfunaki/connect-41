// Como um atendimento do WhatsApp termina.
//
// Pedido do Kauan nos testes de 29/09: não havia como encerrar uma conversa —
// para recomeçar um teste foi preciso mandar "PARAR". Encerrar é o que um
// atendimento de call center faz: fecha com um desfecho, e o próximo contato do
// candidato abre outro. O modelo está em `WhatsappAtendimento`.

export const DESFECHOS = {
  RESOLVIDO: "Resolvido",
  SEM_RETORNO: "Candidato parou de responder",
  NAO_ERA_VAGA: "Não era sobre vaga",
  TESTE: "Teste interno",
  OUTRO: "Outro",
  /** Só do próprio candidato, pelo PARAR — ninguém escolhe este na tela. */
  PEDIU_PARA_PARAR: "Pediu para parar",
} as const;

export type Desfecho = keyof typeof DESFECHOS;

/** O que uma pessoa pode escolher ao encerrar, na ordem da tela. */
export const DESFECHOS_DA_TELA: Desfecho[] = ["RESOLVIDO", "SEM_RETORNO", "NAO_ERA_VAGA", "TESTE", "OUTRO"];

export function desfechoDaTela(valor: string): valor is Desfecho {
  return (DESFECHOS_DA_TELA as string[]).includes(valor);
}

export function rotuloDoDesfecho(valor: string | null): string {
  return valor && valor in DESFECHOS ? DESFECHOS[valor as Desfecho] : "Encerrado";
}

/**
 * O que a conversa perde quando o atendimento fecha — pelo botão ou pelo
 * PARAR. Volta ao assistente, sem responsável, e uma confirmação de nome pela
 * metade é abandonada: o próximo atendimento pergunta de novo, se precisar.
 * O vínculo com a candidatura fica — a pessoa continua sendo quem é.
 */
export const LIMPEZA_AO_ENCERRAR = {
  handoffAt: null,
  handoffReason: null,
  assignedToId: null,
  assignedAt: null,
  linkPendingPersonId: null,
  linkAttempts: 0,
} as const;
