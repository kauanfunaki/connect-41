// A ordem dos chamados. Puro: sem banco, para a consulta e os testes.
import type { Prisma } from "@/generated/prisma/client";

type Ordem = Prisma.HelpdeskTicketOrderByWithRelationInput[];

/**
 * A ordem da lista de /chamados (18/11/2026, melhoria-784): em todas as abas,
 * inclusive a Fila, do aberto mais recente para o mais antigo. O id desempata
 * os abertos no mesmo instante, para a paginação não repetir nem pular cartão.
 * A posição de atendimento na fila continua no cartão ("Posição N de M"),
 * calculada à parte na `ORDEM_DE_ATENDIMENTO`.
 */
export function ordemDaLista(): Ordem {
  return [{ createdAt: "desc" }, { id: "desc" }];
}

/**
 * A ordem de atendimento da fila: a posição gravada (`queueOrder`), e entre
 * posições iguais o mais antigo primeiro. É a que numera o "Posição N de M".
 */
export const ORDEM_DE_ATENDIMENTO: Ordem = [{ queueOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }];

/**
 * O aviso depois de adiantar ou atrasar um chamado na fila: o cartão não muda
 * de lugar (a lista vem pela data de abertura), então o aviso diz a posição nova.
 * O comando "fila" põe o chamado na posição pedida; as setas só pedem de 1 a `total`.
 */
export function avisoDaNovaPosicao(destino: number, total: number): string {
  return `Agora na posição ${destino} de ${total}`;
}
