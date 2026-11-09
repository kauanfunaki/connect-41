// A solicitação do cliente vira cartão no quadro do setor (09/11/2026). Regras
// puras — a leitura e a gravação moram em `cartaoServidor.ts`.
//
// O assunto escolhe a lista (`ServiceRequestSubject.cardPipelineId`). A
// solicitação nova com assunto ligado ganha um cartão na coluna "Nova" (tipo
// NOT_STARTED) daquela lista, e um só: o índice único de
// `PipelineItem.serviceRequestId` barra o segundo.
//
// ─── A solicitação manda ─────────────────────────────────────────────────────
//
// O status da solicitação leva o cartão para a coluna do tipo correspondente:
//
//   ABERTA              → NOT_STARTED  (Nova)
//   EM_ANDAMENTO        → IN_PROGRESS  (Em atendimento)
//   AGUARDANDO_CLIENTE  → PENDING      (Aguardando cliente)
//   CONCLUIDA           → DONE         (Resolvida)
//   CANCELADA           → DONE         — encerrada também, só que pelo outro motivo;
//                                        o cartão não fica parado numa coluna aberta.
//
// No caminho de volta, só a coluna concluída conta: pôr o cartão nela à mão
// conclui a solicitação, pelas mesmas regras do botão "Concluir" dela (quem
// pode, o aviso ao cliente). Entre as colunas abertas o cartão anda livre — a
// equipe organiza o quadro como quiser, e o próximo passo da solicitação o
// recoloca. Já a solicitação encerrada segura o cartão na concluída: tirá-lo de
// lá diria "em aberto" sobre algo que o cliente vê como encerrado.

import type { StageType } from "@/generated/prisma/enums";
import { emAberto, type StatusDaSolicitacao } from "./regras";

export const TIPO_DA_COLUNA: Record<StatusDaSolicitacao, StageType> = {
  ABERTA: "NOT_STARTED",
  EM_ANDAMENTO: "IN_PROGRESS",
  AGUARDANDO_CLIENTE: "PENDING",
  CONCLUIDA: "DONE",
  CANCELADA: "DONE",
};

export type ColunaDoQuadro = { id: string; order: number; type: StageType };

const porOrdem = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

/**
 * Onde o cartão nasce: a primeira coluna "não iniciada" da lista. Lista sem
 * nenhuma (colunas todas recriadas à mão) usa a primeira coluna — o cartão
 * precisa nascer em algum lugar, e a primeira é onde a equipe olha o que chegou.
 */
export function colunaDeEntrada<T extends ColunaDoQuadro>(colunas: readonly T[]): T | null {
  const ordenadas = [...colunas].sort(porOrdem);
  return ordenadas.find((c) => c.type === "NOT_STARTED") ?? ordenadas[0] ?? null;
}

/**
 * Para onde o cartão vai quando a solicitação muda de status — ou `null`, se
 * fica onde está: já numa coluna do tipo certo (a equipe pode ter duas "em
 * andamento" e escolhido a segunda), ou a lista não tem coluna desse tipo.
 */
export function destinoDoCartao<T extends ColunaDoQuadro>(
  colunas: readonly T[],
  colunaAtualId: string,
  status: StatusDaSolicitacao
): T | null {
  const tipo = TIPO_DA_COLUNA[status];
  if (colunas.find((c) => c.id === colunaAtualId)?.type === tipo) return null;
  return [...colunas].sort(porOrdem).find((c) => c.type === tipo) ?? null;
}

export type MovimentoDoCartao = { ok: true; concluir: boolean } | { ok: false; motivo: string };

/**
 * O que acontece quando alguém move à mão o cartão de uma solicitação para uma
 * coluna do tipo `para`. Quem pode concluir a solicitação é conferido à parte,
 * com a sessão (`conferirMovimentoDoCartao`).
 */
export function movimentoDoCartao(s: { numero: number; status: StatusDaSolicitacao }, para: StageType): MovimentoDoCartao {
  const aberta = emAberto(s.status);
  if (para === "DONE") return { ok: true, concluir: aberta };
  if (aberta) return { ok: true, concluir: false };
  const como = s.status === "CANCELADA" ? "cancelada" : "concluída";
  return {
    ok: false,
    motivo: `A Solicitação nº ${s.numero} está ${como}, e o cartão fica na coluna concluída. Para tirá-lo de lá, reabra a solicitação.`,
  };
}

// ─── A escolha da lista, no assunto ──────────────────────────────────────────

/** Uma lista dos Quadros que o assunto pode escolher. `nome` já leva a pasta ("Pasta › Lista"). */
export type ListaParaOAssunto = { id: string; setor: string; espaco: string; nome: string };

/** As listas do setor, agrupadas por espaço na ordem em que chegaram — os grupos do seletor. */
export function listasDoSetorPorEspaco(listas: readonly ListaParaOAssunto[], setor: string): { espaco: string; listas: ListaParaOAssunto[] }[] {
  const grupos: { espaco: string; listas: ListaParaOAssunto[] }[] = [];
  for (const l of listas) {
    if (l.setor !== setor) continue;
    const grupo = grupos.find((g) => g.espaco === l.espaco);
    if (grupo) grupo.listas.push(l);
    else grupos.push({ espaco: l.espaco, listas: [l] });
  }
  return grupos;
}

// ─── O texto do cartão ───────────────────────────────────────────────────────

/** "Pedir um documento — Empresa X": o assunto e a empresa, como pedido. */
export function tituloDoCartao(assunto: string, empresa: string): string {
  return `${assunto.trim()} — ${empresa.trim()}`.slice(0, 200);
}

function escapar(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * A descrição do cartão, no HTML que o editor da descrição mostra: de onde veio
 * e o que o cliente escreveu. O texto do cliente é escapado — ele vai para a
 * tela por `dangerouslySetInnerHTML`. O link para a solicitação não vai aqui (a
 * descrição se edita e o link se perderia): é o botão do topo do cartão.
 */
export function descricaoDoCartao(numero: number, textoDoCliente: string): string {
  const paragrafos = textoDoCliente
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.split("\n").map(escapar).join("<br>")}</p>`);
  return [`<p><strong>Solicitação nº ${numero}</strong>, aberta pelo cliente. O que ele escreveu:</p>`, ...paragrafos].join("");
}
