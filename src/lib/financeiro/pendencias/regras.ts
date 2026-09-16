// Pendências ao cliente: quem pode mexer em quê, e quando o prazo aperta.
// Funções puras.
//
// ─── O status diz de quem é a vez ────────────────────────────────────────────
//
// `ABERTA` espera o cliente; `RESPONDIDA` espera a equipe. Por isso a resposta
// da equipe devolve para `ABERTA` (a bola voltou para o cliente) e a do cliente
// leva para `RESPONDIDA`. Encerrar — resolver ou cancelar — é decisão só da
// equipe: o cliente mandar o arquivo não prova que o arquivo serve, e deixar o
// cliente fechar a pendência tiraria da fila justamente o que ainda precisa
// ser conferido.

import { saoPauloParts } from "@/lib/agenda";
import { lerDataDoCampo } from "@/lib/societario/datas";

export type StatusDaPendencia = "ABERTA" | "RESPONDIDA" | "RESOLVIDA" | "CANCELADA";
export type TipoDaPendencia = "DOCUMENTO" | "INFORMACAO" | "CONFIRMACAO";
export type Ator = "EQUIPE" | "CLIENTE";
export type AcaoNaPendencia = "RESPONDER" | "RESOLVER" | "REABRIR" | "CANCELAR";

export const TIPOS_DA_PENDENCIA: TipoDaPendencia[] = ["DOCUMENTO", "INFORMACAO", "CONFIRMACAO"];

export const ROTULO_DO_TIPO: Record<TipoDaPendencia, string> = {
  DOCUMENTO: "Documento",
  INFORMACAO: "Informação",
  CONFIRMACAO: "Confirmação",
};

export const ROTULO_DO_STATUS: Record<StatusDaPendencia, string> = {
  ABERTA: "Aguardando cliente",
  RESPONDIDA: "Respondida",
  RESOLVIDA: "Resolvida",
  CANCELADA: "Cancelada",
};

/** Ainda há trabalho: de um lado ou do outro. */
export function emAndamento(status: StatusDaPendencia): boolean {
  return status === "ABERTA" || status === "RESPONDIDA";
}

export type Transicao = { ok: true; novo: StatusDaPendencia } | { ok: false; motivo: string };

/**
 * Para onde a pendência vai quando este ator faz esta ação — ou por que não pode.
 *
 * Pendência encerrada não recebe resposta de ninguém: a equipe reabre antes, e
 * o cliente, que não reabre, fala com a equipe por fora. Aceitar resposta em
 * pendência resolvida criaria uma conversa que nenhuma fila mostra.
 */
export function transicao(status: StatusDaPendencia, ator: Ator, acao: AcaoNaPendencia): Transicao {
  const encerrada = !emAndamento(status);

  if (acao === "RESPONDER") {
    if (encerrada) {
      return {
        ok: false,
        motivo:
          ator === "EQUIPE"
            ? "Pendência encerrada. Reabra antes de responder."
            : "Esta pendência já foi encerrada pela equipe.",
      };
    }
    return { ok: true, novo: ator === "EQUIPE" ? "ABERTA" : "RESPONDIDA" };
  }

  if (ator === "CLIENTE") {
    return { ok: false, motivo: "Só a equipe resolve, cancela ou reabre uma pendência." };
  }

  switch (acao) {
    case "RESOLVER":
      if (encerrada) return { ok: false, motivo: "A pendência já está encerrada." };
      return { ok: true, novo: "RESOLVIDA" };
    case "CANCELAR":
      if (encerrada) return { ok: false, motivo: "A pendência já está encerrada." };
      return { ok: true, novo: "CANCELADA" };
    case "REABRIR":
      if (!encerrada) return { ok: false, motivo: "A pendência não está encerrada." };
      return { ok: true, novo: "ABERTA" };
  }
}

export type SituacaoDoPrazo = "SEM_PRAZO" | "VENCIDA" | "VENCE_HOJE" | "NO_PRAZO";

export const ROTULO_DO_PRAZO: Record<SituacaoDoPrazo, string> = {
  SEM_PRAZO: "Sem prazo",
  VENCIDA: "Vencida",
  VENCE_HOJE: "Vence hoje",
  NO_PRAZO: "No prazo",
};

/**
 * Como está o prazo, comparando **dias civis em São Paulo**.
 *
 * O prazo é gravado ao meio-dia UTC (ver `lerDataDoCampo`), e "hoje" sai do
 * relógio do servidor, que roda em UTC: comparar instantes faria a pendência do
 * dia 10 vencer às 21h do dia 9 em Brasília. Comparando a chave do dia, os dois
 * lados falam do mesmo calendário.
 */
export function situacaoDoPrazo(prazo: Date | null, agora: Date): SituacaoDoPrazo {
  if (!prazo) return "SEM_PRAZO";
  const dia = saoPauloParts(prazo).dateKey;
  const hoje = saoPauloParts(agora).dateKey;
  if (dia < hoje) return "VENCIDA";
  if (dia === hoje) return "VENCE_HOJE";
  return "NO_PRAZO";
}

export const LIMITE_DO_TITULO = 160;
export const LIMITE_DA_DESCRICAO = 5_000;
export const LIMITE_DA_MENSAGEM = 5_000;

export type CamposDaPendencia = {
  kind: TipoDaPendencia;
  title: string;
  description: string | null;
  dueDate: Date | null;
};

/** Valida o que a equipe digitou ao abrir a pendência. */
export function validarCamposDaPendencia(bruto: {
  kind: string;
  title: string;
  description: string;
  dueDate: string;
}): { ok: true; dados: CamposDaPendencia } | { ok: false; erro: string } {
  const kind = TIPOS_DA_PENDENCIA.find((t) => t === bruto.kind);
  if (!kind) return { ok: false, erro: "Escolha o tipo da pendência." };

  const title = bruto.title.trim().replace(/\s+/g, " ");
  if (title.length < 3) return { ok: false, erro: "Dê um título à pendência — é o que o cliente lê primeiro." };
  if (title.length > LIMITE_DO_TITULO) return { ok: false, erro: `Título com mais de ${LIMITE_DO_TITULO} caracteres.` };

  const description = bruto.description.trim();
  if (description.length > LIMITE_DA_DESCRICAO) {
    return { ok: false, erro: `Descrição com mais de ${LIMITE_DA_DESCRICAO} caracteres.` };
  }

  const data = lerDataDoCampo(bruto.dueDate);
  if (!data.ok) return { ok: false, erro: "Prazo inválido." };

  return { ok: true, dados: { kind, title, description: description || null, dueDate: data.data } };
}

/**
 * Uma resposta precisa dizer alguma coisa: texto, anexo ou os dois.
 *
 * Só anexo é resposta válida — "segue o comprovante" não acrescenta nada ao
 * arquivo. O corpo vazio é gravado como texto vazio, e a tela mostra só os anexos.
 */
export function validarResposta(texto: string, quantidadeDeAnexos: number): { ok: true; corpo: string } | { ok: false; erro: string } {
  const corpo = texto.trim();
  if (!corpo && quantidadeDeAnexos === 0) return { ok: false, erro: "Escreva uma mensagem ou anexe um arquivo." };
  if (corpo.length > LIMITE_DA_MENSAGEM) return { ok: false, erro: `Mensagem com mais de ${LIMITE_DA_MENSAGEM} caracteres.` };
  return { ok: true, corpo };
}
