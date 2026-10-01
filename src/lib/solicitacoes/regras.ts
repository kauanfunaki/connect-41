// Solicitações do cliente pelo portal (01/10): quem pode mexer em quê, o prazo
// de resposta e os assuntos que nascem com o tenant. Funções puras.
//
// ─── O status diz de quem é a vez ────────────────────────────────────────────
//
// É o inverso da pendência (ver `financeiro/pendencias/regras.ts`): lá a 41
// pede e espera o cliente; aqui o cliente pede e espera a 41.
//
//   ABERTA              chegou, ninguém da 41 respondeu
//   EM_ANDAMENTO        a 41 está tratando — a vez é dela
//   AGUARDANDO_CLIENTE  a 41 pediu algo; a vez é do cliente
//   CONCLUIDA / CANCELADA
//
// O cliente responder numa solicitação concluída **reabre** ela: o portal é o
// caminho único com a 41 (decisão de 01/10), e mandar o cliente abrir outra
// para dizer "ainda não resolveu" seria empurrá-lo de volta ao WhatsApp. A
// cancelada não reabre — foi encerrada de propósito, por um dos lados.

import { addDaysToKey, saoPauloParts } from "@/lib/agenda";

export type StatusDaSolicitacao = "ABERTA" | "EM_ANDAMENTO" | "AGUARDANDO_CLIENTE" | "CONCLUIDA" | "CANCELADA";
export type Ator = "EQUIPE" | "CLIENTE";
export type AcaoNaSolicitacao = "RESPONDER" | "ASSUMIR" | "ENCAMINHAR" | "CONCLUIR" | "CANCELAR" | "REABRIR";

/** Para onde a solicitação vai depois de a equipe responder — escolha de quem responde. */
export type DepoisDaResposta = "EM_ANDAMENTO" | "AGUARDANDO_CLIENTE" | "CONCLUIDA";
export const DEPOIS_DA_RESPOSTA: { valor: DepoisDaResposta; rotulo: string }[] = [
  { valor: "EM_ANDAMENTO", rotulo: "Continua com a equipe" },
  { valor: "AGUARDANDO_CLIENTE", rotulo: "Aguardando o cliente" },
  { valor: "CONCLUIDA", rotulo: "Concluída" },
];

export const ROTULO_PARA_EQUIPE: Record<StatusDaSolicitacao, string> = {
  ABERTA: "Nova",
  EM_ANDAMENTO: "Em andamento",
  AGUARDANDO_CLIENTE: "Aguardando cliente",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

/** O mesmo status contado do lado do cliente: "nova" para ele é "recebida". */
export const ROTULO_PARA_CLIENTE: Record<StatusDaSolicitacao, string> = {
  ABERTA: "Recebida",
  EM_ANDAMENTO: "Em andamento",
  AGUARDANDO_CLIENTE: "Aguardando você",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

/** Ainda há trabalho, de um lado ou do outro. */
export function emAberto(status: StatusDaSolicitacao): boolean {
  return status !== "CONCLUIDA" && status !== "CANCELADA";
}

export type Transicao = { ok: true; novo: StatusDaSolicitacao } | { ok: false; motivo: string };

/**
 * Para onde a solicitação vai quando este ator faz esta ação — ou por que não pode.
 *
 * `depois` só vale para a resposta da equipe: é ela quem diz se a bola fica
 * com a 41, passa para o cliente ou se o assunto acabou.
 */
export function transicao(
  status: StatusDaSolicitacao,
  ator: Ator,
  acao: AcaoNaSolicitacao,
  depois: DepoisDaResposta = "EM_ANDAMENTO"
): Transicao {
  const aberta = emAberto(status);

  if (acao === "RESPONDER") {
    if (ator === "CLIENTE") {
      if (status === "CANCELADA") return { ok: false, motivo: "Esta solicitação foi cancelada. Abra uma nova, se precisar." };
      // Resposta do cliente devolve a vez à 41 — e, numa concluída, reabre.
      return { ok: true, novo: status === "ABERTA" ? "ABERTA" : "EM_ANDAMENTO" };
    }
    if (!aberta) return { ok: false, motivo: "Solicitação encerrada. Reabra antes de responder." };
    return { ok: true, novo: depois };
  }

  if (acao === "CANCELAR") {
    if (!aberta) return { ok: false, motivo: "A solicitação já está encerrada." };
    return { ok: true, novo: "CANCELADA" };
  }

  if (ator === "CLIENTE") {
    return { ok: false, motivo: "Só a equipe assume, encaminha, conclui ou reabre uma solicitação." };
  }

  switch (acao) {
    case "ASSUMIR":
      if (!aberta) return { ok: false, motivo: "A solicitação já está encerrada." };
      // Assumir não é responder: o prazo da primeira resposta continua
      // correndo, mas o cliente já vê que alguém pegou o assunto.
      return { ok: true, novo: status === "ABERTA" ? "EM_ANDAMENTO" : status };
    case "ENCAMINHAR":
      if (!aberta) return { ok: false, motivo: "A solicitação já está encerrada." };
      return { ok: true, novo: status };
    case "CONCLUIR":
      if (!aberta) return { ok: false, motivo: "A solicitação já está encerrada." };
      return { ok: true, novo: "CONCLUIDA" };
    case "REABRIR":
      if (aberta) return { ok: false, motivo: "A solicitação não está encerrada." };
      return { ok: true, novo: "EM_ANDAMENTO" };
  }
}

// ─── Prazo de resposta ───────────────────────────────────────────────────────

/** Teto de iteração: assunto mal cadastrado não vira laço comprido. */
const MAX_DIAS_UTEIS = 60;

/**
 * O dia útil que fica `dias` dias úteis depois de `inicioKey` ("AAAA-MM-DD").
 *
 * O próprio dia da abertura não conta: aberta numa sexta com prazo de 2 dias
 * úteis, a resposta vence na terça. Feriado é por tenant, como na contagem do
 * Societário (`diasUteisEntre`).
 */
export function somarDiasUteis(inicioKey: string, dias: number, feriados: ReadonlySet<string>): string {
  const alvo = Math.min(Math.max(Math.trunc(dias), 1), MAX_DIAS_UTEIS);
  let chave = inicioKey;
  let contados = 0;
  // Mais que o bastante para `alvo` dias úteis mesmo com feriados em sequência.
  for (let i = 0; i < alvo * 3 + 30 && contados < alvo; i++) {
    chave = addDaysToKey(chave, 1);
    const diaDaSemana = new Date(`${chave}T12:00:00Z`).getUTCDay();
    if (diaDaSemana !== 0 && diaDaSemana !== 6 && !feriados.has(chave)) contados += 1;
  }
  return chave;
}

export type SituacaoDaResposta = "RESPONDIDA" | "ENCERRADA" | "ATRASADA" | "VENCE_HOJE" | "NO_PRAZO";

export const ROTULO_DA_RESPOSTA: Record<SituacaoDaResposta, string> = {
  RESPONDIDA: "Respondida",
  ENCERRADA: "Encerrada",
  ATRASADA: "Resposta atrasada",
  VENCE_HOJE: "Responder hoje",
  NO_PRAZO: "No prazo",
};

/**
 * Como está a promessa de resposta feita ao cliente.
 *
 * Compara **dias civis em São Paulo** pelo mesmo motivo da pendência: o prazo
 * fica gravado ao meio-dia UTC, e comparar instantes venceria o prazo do dia 10
 * às 21h do dia 9.
 */
export function situacaoDaResposta(
  s: { status: StatusDaSolicitacao; responseDue: Date; firstResponseAt: Date | null },
  agora: Date
): SituacaoDaResposta {
  if (s.firstResponseAt) return "RESPONDIDA";
  if (!emAberto(s.status)) return "ENCERRADA";
  const dia = saoPauloParts(s.responseDue).dateKey;
  const hoje = saoPauloParts(agora).dateKey;
  if (dia < hoje) return "ATRASADA";
  if (dia === hoje) return "VENCE_HOJE";
  return "NO_PRAZO";
}

// ─── Validação ───────────────────────────────────────────────────────────────

export const LIMITE_DA_DESCRICAO = 5_000;
export const MINIMO_DA_DESCRICAO = 5;

/** O que o cliente escreveu ao abrir. Anexo sozinho não basta: a equipe precisa saber o que fazer com ele. */
export function validarAbertura(descricao: string): { ok: true; texto: string } | { ok: false; erro: string } {
  const texto = descricao.trim();
  if (texto.length < MINIMO_DA_DESCRICAO) return { ok: false, erro: "Conte em poucas palavras o que você precisa." };
  if (texto.length > LIMITE_DA_DESCRICAO) return { ok: false, erro: "Use no máximo 5.000 caracteres." };
  return { ok: true, texto };
}

export const PRAZO_MINIMO = 1;
export const PRAZO_MAXIMO = 30;

export type CamposDoAssunto = { label: string; description: string | null; sectorCode: string; responseDays: number };

export function validarAssunto(bruto: {
  label: string;
  description: string;
  sectorCode: string;
  responseDays: string;
}): { ok: true; dados: CamposDoAssunto } | { ok: false; erro: string } {
  const label = bruto.label.trim();
  if (!label) return { ok: false, erro: "Dê um nome ao assunto." };
  if (label.length > 120) return { ok: false, erro: "Nome com no máximo 120 caracteres." };
  const description = bruto.description.trim() || null;
  if (description && description.length > 255) return { ok: false, erro: "Explicação com no máximo 255 caracteres." };
  const sectorCode = bruto.sectorCode.trim();
  if (!sectorCode) return { ok: false, erro: "Escolha o setor que atende." };
  const responseDays = Number(bruto.responseDays);
  if (!Number.isInteger(responseDays) || responseDays < PRAZO_MINIMO || responseDays > PRAZO_MAXIMO) {
    return { ok: false, erro: `O prazo de resposta vai de ${PRAZO_MINIMO} a ${PRAZO_MAXIMO} dias úteis.` };
  }
  return { ok: true, dados: { label, description, sectorCode, responseDays } };
}

// ─── Assuntos que nascem com o tenant ────────────────────────────────────────

type AssuntoPadrao = { label: string; description: string; setor: string; responseDays: number };

/**
 * A lista mostrada ao Kauan em 01/10 — ponto de partida, editável no admin.
 *
 * Os genéricos ("pedir um documento", "outro assunto") caem na Controladoria,
 * que cuida do atendimento e encaminha para quem resolve: o cliente não sabe,
 * nem precisa saber, que balancete é do Contábil e holerite é do DP.
 */
export const ASSUNTOS_PADRAO: readonly AssuntoPadrao[] = [
  { label: "Pedir um documento", description: "Contrato social, certidão, guia, balancete, declaração…", setor: "controladoria", responseDays: 2 },
  { label: "Alteração cadastral ou contratual", description: "Endereço, sócios, atividade, capital, nome da empresa…", setor: "societario", responseDays: 5 },
  { label: "Folha de pagamento e funcionários", description: "Admissão, demissão, férias, holerite, ponto…", setor: "dp", responseDays: 2 },
  { label: "Notas fiscais e impostos", description: "Emissão de nota, impostos, guias, notas que faltam…", setor: "fiscal", responseDays: 2 },
  { label: "Financeiro: contas e pagamentos", description: "Contas a pagar e a receber, pagamentos, extratos…", setor: "bpo", responseDays: 1 },
  { label: "Outro assunto", description: "Qualquer outra coisa: a equipe encaminha para quem resolve.", setor: "controladoria", responseDays: 2 },
];

/**
 * Os assuntos padrão com o setor de cada um resolvido para **este** tenant.
 *
 * Setor que o tenant não tem cai na Controladoria; sem ela, no primeiro setor
 * ativo. Tenant sem setor nenhum não ganha assunto — não haveria quem atender.
 */
export function assuntosPadraoDoTenant(setoresAtivos: readonly string[]): CamposDoAssunto[] {
  if (setoresAtivos.length === 0) return [];
  const existe = new Set(setoresAtivos);
  const reserva = existe.has("controladoria") ? "controladoria" : setoresAtivos[0]!;
  return ASSUNTOS_PADRAO.map((a) => ({
    label: a.label,
    description: a.description,
    sectorCode: existe.has(a.setor) ? a.setor : reserva,
    responseDays: a.responseDays,
  }));
}
