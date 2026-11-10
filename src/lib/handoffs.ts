import type { Prisma } from "@/generated/prisma/client";
import type { HandoffPriority, HandoffSectorStatus } from "@/generated/prisma/enums";

// Vocabulário do dia a dia (item 6 do levantamento): a transferência nasce
// "Nova", vira "Resolvendo" quando algum setor começa a trabalhar e
// "Finalizada" quando todos terminam. "Devolvida" (10/11/2026, pedido do
// Kauan): um setor devolveu a parte dele a quem pediu, com o motivo.
export const HANDOFF_STATUS_LABEL: Record<HandoffSectorStatus, string> = {
  NEW: "Nova",
  IN_PROGRESS: "Resolvendo",
  DONE: "Finalizada",
  RETURNED: "Devolvida",
};

// "Devolvida" em vermelho (10/11/2026): é a única situação que trava o setor
// e pede ação de quem pediu. O âmbar já é da "Nova" — duas situações com a
// mesma cor na faixa e no sinal da lista ficariam ambíguas —, e o cinza
// (`neutro`) é, pela regra do Selo, de situação encerrada, que não pede nada.
export const HANDOFF_STATUS_BADGE: Record<HandoffSectorStatus, "warning" | "info" | "success" | "danger"> = {
  NEW: "warning",
  IN_PROGRESS: "info",
  DONE: "success",
  RETURNED: "danger",
};

export const HANDOFF_PRIORITY_LABEL: Record<HandoffPriority, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  URGENT: "Urgente",
};

// O tom do Selo de cada prioridade (10/11/2026, pedido do Kauan): Baixa em
// cinza, Média em azul, Alta em âmbar, Urgente em vermelho. Era um mapa de
// variantes do Badge com Baixa em verde — a cor de "ok", que fazia a
// transferência de prioridade baixa parecer resolvida.
export const HANDOFF_PRIORITY_TOM: Record<HandoffPriority, "neutro" | "marca" | "atencao" | "perigo"> = {
  LOW: "neutro",
  MEDIUM: "marca",
  HIGH: "atencao",
  URGENT: "perigo",
};

// O tom do sinal de cada setor na lista (10/11/2026): nova em âmbar (espera
// alguém começar), resolvendo em azul, finalizada em verde, devolvida em
// vermelho — os mesmos tons de HANDOFF_STATUS_BADGE, no vocabulário do Selo.
export const HANDOFF_STATUS_TOM: Record<HandoffSectorStatus, "atencao" | "marca" | "sucesso" | "perigo"> = {
  NEW: "atencao",
  IN_PROGRESS: "marca",
  DONE: "sucesso",
  RETURNED: "perigo",
};

/**
 * As situações em que a parte está COM o setor de destino (10/11/2026): nova
 * ou resolvendo. A devolvida está com quem pediu, e a finalizada, com ninguém.
 * É o que as abas "Para o meu setor" e "Comigo" e o aviso de parada olham.
 */
export const SITUACOES_COM_O_SETOR: HandoffSectorStatus[] = ["NEW", "IN_PROGRESS"];

/**
 * Dias com um setor sem finalizar para a transferência contar como parada
 * (10/11/2026, pedido do Kauan). É o número do aviso de "transferência parada"
 * (`checkHandoffsParados`, em src/lib/alerts.ts), que passou a ler daqui: o
 * relógio âmbar da lista e o aviso do sino mudam juntos.
 */
export const HANDOFF_PARADA_DIAS = 3;

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Um setor de destino parado: a parte está com ele (nova ou resolvendo) e
 * chegou há HANDOFF_PARADA_DIAS dias ou mais. A devolvida não conta
 * (10/11/2026): ela espera quem pediu, e não o setor.
 */
export function setorParado(setor: { status: HandoffSectorStatus; createdAt: Date }, agora: Date): boolean {
  return SITUACOES_COM_O_SETOR.includes(setor.status) && agora.getTime() - setor.createdAt.getTime() >= HANDOFF_PARADA_DIAS * DIA_MS;
}

/** A transferência está parada quando algum setor de destino está (o relógio âmbar da lista). */
export function transferenciaParada(setores: { status: HandoffSectorStatus; createdAt: Date }[], agora: Date): boolean {
  return setores.some((s) => setorParado(s, agora));
}

/** O texto de quem não tem assunto: as transferências de antes de 10/11/2026. */
export const SEM_ASSUNTO = "Sem assunto";

/**
 * O assunto guardado, sem espaço sobrando; null quando não há (transferência
 * de antes de 10/11/2026). Quem mostra decide o que pôr no lugar: a lista
 * escreve "Sem assunto" apagado, o detalhe usa "Transferência" no título.
 */
export function assuntoDaTransferencia(h: { subject?: string | null }): string | null {
  const assunto = h.subject?.replace(/\s+/g, " ").trim();
  return assunto ? assunto : null;
}

/** O título da transferência aberta: o assunto, ou "Transferência" nas antigas. */
export function tituloDaTransferencia(h: { subject?: string | null }): string {
  return assuntoDaTransferencia(h) ?? "Transferência";
}

/** O tamanho máximo do assunto — o da coluna `handoffs.subject`. */
export const ASSUNTO_MAXIMO = 160;

/**
 * Quanto tempo a transferência está aberta, na coluna "Aberta há" da lista
 * (10/11/2026): "5 min", "4 h", "1 dia", "12 dias". Sem o "há", que está no
 * cabeçalho da coluna.
 */
export function abertaHa(desde: Date, agora: Date): string {
  const minutos = Math.max(0, Math.floor((agora.getTime() - desde.getTime()) / 60_000));
  if (minutos < 60) return `${Math.max(1, minutos)} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "1 dia" : `${dias} dias`;
}

export const HANDOFF_PRIORITY_OPTIONS: { value: HandoffPriority; label: string }[] = [
  { value: "LOW", label: "Baixa" },
  { value: "MEDIUM", label: "Média" },
  { value: "HIGH", label: "Alta" },
  { value: "URGENT", label: "Urgente" },
];

// Status agregado da transferência a partir dos status por setor. Uma parte
// devolvida vence as outras (10/11/2026): a transferência espera quem pediu
// responder, e é isso que o Selo do cabeçalho e o sinal da lista têm de dizer.
export function aggregateHandoffStatus(statuses: HandoffSectorStatus[]): HandoffSectorStatus {
  if (statuses.length === 0) return "NEW";
  if (statuses.some((s) => s === "RETURNED")) return "RETURNED";
  if (statuses.every((s) => s === "DONE")) return "DONE";
  if (statuses.every((s) => s === "NEW")) return "NEW";
  return "IN_PROGRESS";
}

// A mesma regra de `aggregateHandoffStatus`, escrita como filtro do banco, para
// a lista de /transferencias paginar no servidor em vez de ler tudo e filtrar
// em JS (10/11/2026). Exatamente um dos quatro casa com cada transferência —
// `handoffs.test.ts` confere contra a função, de 0 a 3 setores.
// No Prisma, `every` numa relação vazia é verdadeiro: por isso "Nova" pega a
// transferência sem setor nenhum, e "Finalizada" precisa do `some: {}`.
export function whereDaSituacao(status: HandoffSectorStatus): Prisma.HandoffWhereInput {
  switch (status) {
    case "NEW":
      return { sectors: { every: { status: "NEW" } } };
    case "DONE":
      return { sectors: { some: {}, every: { status: "DONE" } } };
    case "RETURNED":
      return { sectors: { some: { status: "RETURNED" } } };
    case "IN_PROGRESS":
      return {
        AND: [
          { sectors: { some: { status: { not: "NEW" } } } },
          { sectors: { some: { status: { not: "DONE" } } } },
          { sectors: { every: { status: { not: "RETURNED" } } } },
        ],
      };
  }
}

// Quem pode LER a instrução escrita para um setor.
//
// A instrução é conteúdo dirigido a UM setor — diferente da mensagem da
// transferência, que é para todos os envolvidos. Ver a transferência não dá
// direito de ler o que foi dito a outro setor. Achado na conferência ao vivo
// de 2026-08-24: quem estava no setor X lia a instrução do setor Y, porque a
// tela de detalhe só tinha guarda para EDITAR (canManageSector/isAssignee),
// nenhuma para ler.
//
// O card do setor continua visível para todo mundo, de propósito: escondê-lo
// faria o status agregado depender de um setor invisível na tela, e quem
// acompanha não entenderia por que a transferência não fecha.
//
// Usa os setores da PESSOA (`userSectors`), não o setor ativo do subworkspace:
// trocar de subworkspace muda o que se lista, não o que se tem direito de ler
// — mesma razão pela qual `scopedHandoffWhere` também ignora o setor ativo.
export function canReadSectorInstruction(params: {
  /** Papel dá visão geral do tenant (ADMIN, SUPER_ADMIN, READONLY). */
  fullAccess: boolean;
  /** Id de quem está olhando. Null = sessão sem usuário. */
  userId: string | null;
  /** Quem abriu a transferência — escreveu as instruções, então lê todas. */
  requestedBy: string;
  /** Setores da pessoa (UserSector), não o setor ativo. */
  userSectors: string[];
  /** Setor do card. */
  sectorCode: string;
  /** Responsável designado pode ser de fora do setor — e precisa da instrução. */
  isAssignee: boolean;
}): boolean {
  const { fullAccess, userId, requestedBy, userSectors, sectorCode, isAssignee } = params;
  if (fullAccess) return true;
  if (userId !== null && userId === requestedBy) return true;
  if (userSectors.includes(sectorCode)) return true;
  return isAssignee;
}
