// O processo societário vira cartão nos Quadros (27/11/2026, funcionalidade-844).
// Regras puras — a leitura e a gravação moram em `cartaoDoProcessoServidor.ts`.
// O molde é o cartão da solicitação (src/lib/solicitacoes/cartao.ts).
//
// ─── O processo manda, em mão única ──────────────────────────────────────────
//
// Um cartão por processo (`PipelineItem.processId` é único). O cartão espelha o
// título (nº + tipo + empresa), a empresa, o responsável, a prioridade e a
// coluna. A coluna é a situação do processo:
//
//   lista criada pelo sistema: a coluna com a mesma `systemKey` da situação;
//   lista escolhida pelo setor: a primeira coluna do tipo da situação
//                               (`TIPO_DA_COLUNA`), como na solicitação.
//
// O caminho de volta não existe: mover o cartão para outra coluna à mão é
// recusado ("registre no processo") — a situação sai dos protocolos e das
// ações do processo, e uma coluna escolhida à mão faria a tela mentir. Pela
// mesma razão, responsável, título e prioridade ficam travados no cartão.
// Comentário, etiqueta, anexo, checklist e capa ficam livres.
//
// O prazo não é copiado: o cartão lê o prazo combinado do processo na hora de
// mostrar. Copiado, viraria um segundo alerta de vencimento do mesmo trabalho.

import type { StageType } from "@/generated/prisma/enums";
import { situacaoDoProcesso, type Protocolo, type StatusDoProcesso } from "@/lib/societario/processo";

export type ChaveDaColuna =
  | "EM_ANDAMENTO"
  | "AGUARDANDO_ORGAO"
  | "EM_EXIGENCIA"
  | "AGUARDANDO_CLIENTE"
  | "SUSPENSO"
  | "CONCLUIDO"
  | "CANCELADO";

export type DefinicaoDaColuna = { chave: ChaveDaColuna; nome: string; tipo: StageType; cor: string };

/**
 * As colunas da lista criada pelo sistema, na ordem do fluxo — as do kanban de
 * processos (`COLUNAS_DO_KANBAN`) mais "Cancelado/Indeferido", o fim que não é
 * conclusão. As duas finais são "concluídas" (DONE): o processo encerrado vai
 * direto para uma delas.
 */
export const COLUNAS_DO_PROCESSO: readonly DefinicaoDaColuna[] = [
  { chave: "EM_ANDAMENTO", nome: "Em andamento", tipo: "IN_PROGRESS", cor: "#2563EB" },
  { chave: "AGUARDANDO_ORGAO", nome: "Aguardando órgão", tipo: "PENDING", cor: "#0E7490" },
  { chave: "EM_EXIGENCIA", nome: "Em exigência", tipo: "IN_PROGRESS", cor: "#B45309" },
  { chave: "AGUARDANDO_CLIENTE", nome: "Aguardando cliente", tipo: "PENDING", cor: "#A16207" },
  { chave: "SUSPENSO", nome: "Suspenso", tipo: "PENDING", cor: "#B91C1C" },
  { chave: "CONCLUIDO", nome: "Concluído", tipo: "DONE", cor: "#059669" },
  { chave: "CANCELADO", nome: "Cancelado/Indeferido", tipo: "DONE", cor: "#586577" },
];

/** O tipo de coluna de cada situação — o caminho na lista que o setor escolheu. */
export const TIPO_DA_COLUNA: Record<ChaveDaColuna, StageType> = Object.fromEntries(
  COLUNAS_DO_PROCESSO.map((c) => [c.chave, c.tipo])
) as Record<ChaveDaColuna, StageType>;

export const NOME_DA_COLUNA: Record<ChaveDaColuna, string> = Object.fromEntries(
  COLUNAS_DO_PROCESSO.map((c) => [c.chave, c.nome])
) as Record<ChaveDaColuna, string>;

export function ehChaveDaColuna(valor: unknown): valor is ChaveDaColuna {
  return typeof valor === "string" && valor in TIPO_DA_COLUNA;
}

/**
 * A coluna do processo: a situação da fila (`situacaoDoProcesso`), com o
 * encerramento sem conclusão — cancelado ou indeferido — na coluna dele.
 */
export function chaveDaColuna(p: { status: StatusDoProcesso; concluido: boolean; protocolos: Protocolo[] }): ChaveDaColuna {
  if (p.status === "CANCELADO" || p.status === "INDEFERIDO") return "CANCELADO";
  return situacaoDoProcesso(p.protocolos, p.concluido, p.status);
}

export type ColunaDoCartao = { id: string; order: number; type: StageType; systemKey: string | null };

const porOrdem = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

/**
 * A coluna onde o cartão do processo deve estar: a da mesma `systemKey`; sem
 * ela (lista escolhida pelo setor, ou coluna do sistema que a equipe tirou), a
 * primeira do tipo da situação. Sem coluna desse tipo, `null`.
 */
export function colunaDaSituacao<T extends ColunaDoCartao>(colunas: readonly T[], chave: ChaveDaColuna): T | null {
  const doSistema = colunas.find((c) => c.systemKey === chave);
  if (doSistema) return doSistema;
  return [...colunas].sort(porOrdem).find((c) => c.type === TIPO_DA_COLUNA[chave]) ?? null;
}

/**
 * Onde o cartão nasce: a coluna da situação; sem ela, a primeira "não
 * iniciada", ou a primeira de todas — o cartão precisa nascer em algum lugar.
 */
export function colunaDeEntrada<T extends ColunaDoCartao>(colunas: readonly T[], chave: ChaveDaColuna): T | null {
  const certa = colunaDaSituacao(colunas, chave);
  if (certa) return certa;
  const ordenadas = [...colunas].sort(porOrdem);
  return ordenadas.find((c) => c.type === "NOT_STARTED") ?? ordenadas[0] ?? null;
}

/**
 * A coluna atual já serve à situação? Na coluna do sistema, só a da mesma
 * chave; sem coluna do sistema para a chave, qualquer uma do tipo certo — a
 * equipe pode ter duas "em andamento" na lista dela e escolhido a segunda.
 */
function colunaServe(colunas: readonly ColunaDoCartao[], coluna: ColunaDoCartao | undefined, chave: ChaveDaColuna): boolean {
  if (!coluna) return false;
  if (colunas.some((c) => c.systemKey === chave)) return coluna.systemKey === chave;
  return coluna.type === TIPO_DA_COLUNA[chave];
}

/**
 * Para onde o cartão vai quando o processo muda — ou `null`, se fica onde está
 * (já numa coluna que serve, ou a lista não tem coluna para a situação).
 */
export function destinoDoCartao<T extends ColunaDoCartao>(colunas: readonly T[], colunaAtualId: string, chave: ChaveDaColuna): T | null {
  if (colunaServe(colunas, colunas.find((c) => c.id === colunaAtualId), chave)) return null;
  return colunaDaSituacao(colunas, chave);
}

export type MovimentoDoCartao = { ok: true } | { ok: false; motivo: string };

/** O texto da recusa: o caminho é o processo. */
export function recusaDoMovimento(numero: number): string {
  return `A coluna deste cartão segue a situação do Processo nº ${numero}. Para mudar, registre no processo.`;
}

/**
 * Mover à mão o cartão de um processo para a coluna `paraId`: só vale para uma
 * coluna que também serve à situação atual (na lista da equipe, outra coluna do
 * mesmo tipo). O resto é recusado.
 */
export function movimentoDoCartao(colunas: readonly ColunaDoCartao[], paraId: string, chave: ChaveDaColuna, numero: number): MovimentoDoCartao {
  if (colunaServe(colunas, colunas.find((c) => c.id === paraId), chave)) return { ok: true };
  return { ok: false, motivo: recusaDoMovimento(numero) };
}

// ─── Os campos que o processo manda ──────────────────────────────────────────

export type PrioridadeDoProcesso = "BAIXA" | "NORMAL" | "ALTA" | "URGENTE";

/**
 * A prioridade do processo na escala do cartão (0 sem, 1 alta, 2 urgente).
 * Baixa e normal são "sem prioridade" no quadro: o cartão não tem a baixa.
 */
export function prioridadeDoCartao(p: PrioridadeDoProcesso): number {
  return p === "URGENTE" ? 2 : p === "ALTA" ? 1 : 0;
}

/** "Nº 12 · Alteração contratual — Empresa X": o número, o tipo e a empresa. */
export function tituloDoCartao(numero: number, tipo: string, empresa: string): string {
  return `Nº ${numero} · ${tipo.trim()} — ${empresa.trim()}`.slice(0, 200);
}

function escapar(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * A descrição com que o cartão nasce (o editor a mostra como HTML): de onde
 * veio e o que diferencia o processo, se tiver. Depois a descrição é da
 * equipe — o sistema não a reescreve.
 */
export function descricaoDoCartao(numero: number, tituloDoProcesso: string | null): string {
  const partes = [`<p>Cartão aberto pelo <strong>Processo nº ${numero}</strong>. A coluna, o responsável e a prioridade vêm do processo.</p>`];
  if (tituloDoProcesso?.trim()) partes.push(`<p>${escapar(tituloDoProcesso.trim())}</p>`);
  return partes.join("");
}

export type EstadoDoCartao = {
  title: string | null;
  priority: number;
  entityId: string | null;
  stageId: string;
  responsaveis: string[];
};

export type EsperadoDoCartao = {
  title: string;
  priority: number;
  entityId: string;
  /** A coluna de destino, ou `null` quando fica onde está. */
  stageId: string | null;
  responsavel: string | null;
};

export type AjusteDoCartao = {
  dados: Partial<{ title: string; priority: number; entityType: "COMPANY"; entityId: string; stageId: string }>;
  /** Quem sai e quem entra como responsável. */
  tirar: string[];
  por: string[];
};

/**
 * O que muda no cartão para ele espelhar o processo — vazio quando já espelha.
 * O responsável do processo é o único do cartão: um responsável a mais posto à
 * mão sai, porque o campo é do processo.
 */
export function ajusteDoCartao(atual: EstadoDoCartao, esperado: EsperadoDoCartao): AjusteDoCartao {
  const dados: AjusteDoCartao["dados"] = {};
  if (atual.title !== esperado.title) dados.title = esperado.title;
  if (atual.priority !== esperado.priority) dados.priority = esperado.priority;
  if (atual.entityId !== esperado.entityId) {
    dados.entityType = "COMPANY";
    dados.entityId = esperado.entityId;
  }
  if (esperado.stageId && esperado.stageId !== atual.stageId) dados.stageId = esperado.stageId;
  const quer = esperado.responsavel ? [esperado.responsavel] : [];
  return {
    dados,
    tirar: atual.responsaveis.filter((r) => !quer.includes(r)),
    por: quer.filter((r) => !atual.responsaveis.includes(r)),
  };
}

export function ajusteVazio(a: AjusteDoCartao): boolean {
  return Object.keys(a.dados).length === 0 && a.tirar.length === 0 && a.por.length === 0;
}

/** O campo que o cartão do processo não deixa mudar, com o caminho. */
export function recusaDoCampo(campo: "responsável" | "título" | "prioridade" | "prazo", numero: number): string {
  return `O ${campo} deste cartão vem do Processo nº ${numero}. Mude no processo.`;
}
