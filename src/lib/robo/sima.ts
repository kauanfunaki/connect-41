// O acompanhamento dos protocolos do SIMA pelo robô (03/11/2026) — o que vai e
// o que volta da máquina, sem banco. A gravação é a do observador de
// protocolo (`societario/observadorServidor.ts`).
//
// Uma tarefa por rodada, e não uma por protocolo: a máquina entra no SIMA com o
// certificado da 041, abre "Minhas Solicitações" uma vez e lê os cartões dos
// protocolos pedidos, nas três abas. O que está finalizado sem deferimento
// ganha o motivo, lido no detalhe.
//
// Ninguém pede: a tarefa nasce quando a máquina pede trabalho com
// `observar_sima` nas capacidades, há protocolo do SIMA pendente e a última
// rodada foi há mais de `INTERVALO_DO_SIMA_HORAS`.

import { z } from "zod";
import { ABAS, classificarSolicitacao, normalizarProtocolo, protocoloValido } from "@/lib/societario/orgaos/sima";
import { decidir, type Decisao, type ProtocoloParaVerificar } from "@/lib/societario/observador";

export const INTERVALO_DO_SIMA_HORAS = 6;

/** Teto de protocolos por rodada: a tarefa tem 15 minutos na máquina. */
export const PROTOCOLOS_POR_RODADA = 60;

export type PedidoDoSima = { protocolos: string[] };

/** Só os números com a cara de protocolo do SIMA, sem repetir. */
export function pedidoDoSima(numeros: (string | null)[]): PedidoDoSima {
  const vistos = new Set<string>();
  for (const n of numeros) {
    if (!n || !protocoloValido(n)) continue;
    vistos.add(normalizarProtocolo(n));
  }
  return { protocolos: [...vistos].slice(0, PROTOCOLOS_POR_RODADA) };
}

/** O que a máquina devolve: um cartão por protocolo pedido que ela achou. */
export const resultadoDoSimaSchema = z.object({
  itens: z
    .array(
      z.object({
        protocolo: z.string().trim().min(1).max(40),
        aba: z.enum(ABAS),
        selo: z.string().trim().min(1).max(120),
        motivo: z.string().trim().max(500).nullish(),
      })
    )
    .max(500),
});
export type ResultadoDoSima = z.infer<typeof resultadoDoSimaSchema>;

export type ProtocoloDoSima = ProtocoloParaVerificar & { tenantId: string; stepId: string | null };

export type LeituraDoProtocoloDoSima =
  | { id: string; tipo: "decisao"; decisao: Decisao }
  | { id: string; tipo: "falha"; mensagem: string };

/**
 * O que fazer com cada protocolo pendente, dada a leitura da máquina.
 *
 * Protocolo pedido que não apareceu não é "segue pendente": quase sempre foi
 * aberto com outro certificado (o SIMA só mostra os pedidos do login, MA-3), e
 * fica anotado como falha da verificação, para o setor ver na ficha. Selo que
 * a tela ainda não tinha mostrado também vira falha anotada — nunca palpite.
 */
export function lerProtocolosDoSima(pendentes: ProtocoloDoSima[], resultado: ResultadoDoSima): LeituraDoProtocoloDoSima[] {
  const porNumero = new Map(resultado.itens.map((i) => [normalizarProtocolo(i.protocolo), i]));
  return pendentes.map((p) => {
    const item = p.numero ? porNumero.get(normalizarProtocolo(p.numero)) : undefined;
    if (!item) {
      return {
        id: p.id,
        tipo: "falha",
        mensagem: `O protocolo ${p.numero ?? "(sem número)"} não aparece em Minhas Solicitações do SIMA no login da 041. Se ele foi aberto com o certificado do cliente, o robô não o enxerga.`,
      };
    }
    try {
      return { id: p.id, tipo: "decisao", decisao: decidir(p, classificarSolicitacao(item)) };
    } catch (err) {
      return { id: p.id, tipo: "falha", mensagem: err instanceof Error ? err.message : "falha ao ler o selo do SIMA" };
    }
  });
}

/** Pode criar a próxima rodada? A última tem de ter sido há mais do intervalo. */
export function rodadaDoSimaPodeComecar(ultimaCriadaEm: Date | null, agora: Date): boolean {
  if (!ultimaCriadaEm) return true;
  return agora.getTime() - ultimaCriadaEm.getTime() >= INTERVALO_DO_SIMA_HORAS * 3_600_000;
}
