import type { HandoffEventType, HandoffSectorStatus } from "@/generated/prisma/enums";
import type { AuthContext } from "@/lib/auth/context";
import { canManageSector } from "@/lib/auth/papeis";
import { formatarNumero } from "@/lib/format";

// As regras da transferência aberta (10/11/2026, pedido do Kauan — Controle
// interno melhoria-591, escolha "B · Andamento no topo e a conversa ao lado").
// Sem Prisma de verdade (só os tipos): as actions, a tela e os testes leem as
// mesmas regras, e o componente de cliente pode importar os rótulos.
//
// A parte de cada setor anda por botões com a ação escrita, no lugar do
// seletor de situação solto:
//   Nova ──Começar──▶ Resolvendo ──Finalizar──▶ Finalizada
//   Nova/Resolvendo ──Devolver (motivo)──▶ Devolvida ──Responder e reenviar──▶ Nova
//   Finalizada ──Reabrir──▶ Resolvendo
// "Devolvida" é situação nova: o setor de destino devolve a parte dele a quem
// pediu, com o motivo obrigatório; quem pediu responde e reenvia.

export type AcaoNaParte = "comecar" | "finalizar" | "devolver" | "reenviar" | "reabrir";

type Transicao = {
  /** As situações de onde a ação parte. */
  de: readonly HandoffSectorStatus[];
  para: HandoffSectorStatus;
  /** O evento que a ação grava na Atividade. */
  evento: HandoffEventType;
  /** Quem age: o lado do setor de destino ou o lado de quem pediu. */
  lado: "destino" | "pedido";
};

export const TRANSICOES: Record<AcaoNaParte, Transicao> = {
  comecar: { de: ["NEW"], para: "IN_PROGRESS", evento: "STARTED", lado: "destino" },
  finalizar: { de: ["NEW", "IN_PROGRESS"], para: "DONE", evento: "DONE", lado: "destino" },
  devolver: { de: ["NEW", "IN_PROGRESS"], para: "RETURNED", evento: "RETURNED", lado: "destino" },
  reenviar: { de: ["RETURNED"], para: "NEW", evento: "RESENT", lado: "pedido" },
  // Reabrir não estava na lista do pedido, mas o seletor de antes deixava
  // voltar uma parte finalizada por engano; sem ele, a parte ficaria presa.
  reabrir: { de: ["DONE"], para: "IN_PROGRESS", evento: "REOPENED", lado: "destino" },
};

export const ACOES_NA_PARTE = Object.keys(TRANSICOES) as AcaoNaParte[];

export function ehAcaoNaParte(v: unknown): v is AcaoNaParte {
  return typeof v === "string" && (ACOES_NA_PARTE as string[]).includes(v);
}

/** A situação depois da ação, ou null quando a ação não vale a partir da situação atual. */
export function proximaSituacao(acao: AcaoNaParte, atual: HandoffSectorStatus): HandoffSectorStatus | null {
  const t = TRANSICOES[acao];
  return t.de.includes(atual) ? t.para : null;
}

/** O que as regras leem de quem age — tirado do AuthContext. */
export type QuemAge = Pick<AuthContext, "userId" | "role" | "sectors" | "subscriptionReadOnly">;

export type ParteParaARegra = { sectorCode: string; status: HandoffSectorStatus; responsaveis: readonly string[] };
export type PedidoParaARegra = { requestedBy: string; fromSector: string };

/**
 * Quem cuida da parte de um setor de destino — a regra de antes do seletor,
 * sem mudança: quem gerencia aquele setor (coordenação ou administrador) ou é
 * responsável pela parte; nunca o somente leitura.
 */
export function cuidaDaParte(quem: QuemAge, parte: ParteParaARegra): boolean {
  if (quem.role === "READONLY") return false;
  if (canManageSector(quem, parte.sectorCode)) return true;
  return Boolean(quem.userId) && parte.responsaveis.includes(quem.userId);
}

/**
 * Quem responde pelo pedido: quem pediu, a coordenação do setor de origem e o
 * administrador. É quem recebe a devolução, responde e reenvia, e quem edita
 * assunto, descrição e prioridade.
 */
export function respondePeloPedido(quem: QuemAge, pedido: PedidoParaARegra): boolean {
  if (quem.role === "READONLY") return false;
  if (quem.userId && quem.userId === pedido.requestedBy) return true;
  return canManageSector(quem, pedido.fromSector);
}

/** Pode fazer esta ação nesta parte agora (a situação e quem é). */
export function podeAgirNaParte(acao: AcaoNaParte, quem: QuemAge, parte: ParteParaARegra, pedido: PedidoParaARegra): boolean {
  if (!proximaSituacao(acao, parte.status)) return false;
  return TRANSICOES[acao].lado === "pedido" ? respondePeloPedido(quem, pedido) : cuidaDaParte(quem, parte);
}

/** As ações que a pessoa pode fazer na parte, na ordem dos botões. */
export function acoesDaParte(quem: QuemAge, parte: ParteParaARegra, pedido: PedidoParaARegra): AcaoNaParte[] {
  return ACOES_NA_PARTE.filter((a) => podeAgirNaParte(a, quem, parte, pedido));
}

/**
 * Quem acrescenta e retira responsáveis da parte: quem gerencia o setor de
 * destino — a regra de antes (a coordenadora do Fiscal escolhe gente do
 * Fiscal). O responsável sozinho não chama colegas.
 */
export function podeMudarResponsaveis(quem: QuemAge, parte: Pick<ParteParaARegra, "sectorCode">): boolean {
  if (quem.role === "READONLY") return false;
  return canManageSector(quem, parte.sectorCode);
}

/** Editar assunto, descrição e prioridade: o lado de quem pediu. */
export function podeEditarATransferencia(quem: QuemAge, pedido: PedidoParaARegra): boolean {
  return respondePeloPedido(quem, pedido);
}

/** Comentar: quem vê a transferência e escreve (o somente leitura só lê). */
export function podeComentar(quem: Pick<QuemAge, "userId" | "role">): boolean {
  return Boolean(quem.userId) && quem.role !== "READONLY";
}

// ─── Textos ─────────────────────────────────────────────────────────────────

/** O tamanho do motivo da devolução e da resposta do reenvio. */
export const MOTIVO_MAXIMO = 1000;
/** O tamanho do comentário. */
export const COMENTARIO_MAXIMO = 5000;

export type TextoValidado = { ok: true; texto: string | null } | { ok: false; erro: string };

/** O texto que a ação leva: obrigatório em devolver e reenviar, nenhum nas outras. */
export function textoDaAcao(acao: AcaoNaParte, bruto: string | null | undefined): TextoValidado {
  if (acao !== "devolver" && acao !== "reenviar") return { ok: true, texto: null };
  const texto = (bruto ?? "").trim();
  if (!texto) {
    return { ok: false, erro: acao === "devolver" ? "Escreva o motivo da devolução." : "Escreva a resposta antes de reenviar." };
  }
  if (texto.length > MOTIVO_MAXIMO) {
    return { ok: false, erro: `${acao === "devolver" ? "O motivo" : "A resposta"} pode ter até ${formatarNumero(MOTIVO_MAXIMO, 0)} caracteres.` };
  }
  return { ok: true, texto };
}

/** O comentário, sem espaço sobrando; recusado vazio ou longo demais. */
export function textoDoComentario(bruto: string | null | undefined): TextoValidado {
  const texto = (bruto ?? "").trim();
  if (!texto) return { ok: false, erro: "Escreva o comentário." };
  if (texto.length > COMENTARIO_MAXIMO) return { ok: false, erro: `O comentário pode ter até ${formatarNumero(COMENTARIO_MAXIMO, 0)} caracteres.` };
  return { ok: true, texto };
}

/**
 * "do Fiscal" / "da Controladoria", "ao Societário" / "à Gestão". O nome do
 * setor é livre (o administrador renomeia), então o gênero sai da terminação:
 * -a e -ão são femininos (Controladoria, Corretora, Gestão); o resto,
 * masculino (Fiscal, DP, BPO, Contábil). Sem isso, "Devolver ao
 * Controladoria".
 */
export function setorFeminino(rotulo: string): boolean {
  return /(a|ão)$/i.test(rotulo.trim());
}
export const doSetor = (rotulo: string) => `${setorFeminino(rotulo) ? "da" : "do"} ${rotulo}`;
export const aoSetor = (rotulo: string) => `${setorFeminino(rotulo) ? "à" : "ao"} ${rotulo}`;
export const peloSetor = (rotulo: string) => `${setorFeminino(rotulo) ? "pela" : "pelo"} ${rotulo}`;

/** O texto do botão de cada ação, com o setor da parte e o de origem. */
export function rotuloDaAcao(acao: AcaoNaParte, setores: { parte: string; origem: string }): string {
  switch (acao) {
    case "comecar":
      return "Começar";
    case "finalizar":
      return `Finalizar a parte ${doSetor(setores.parte)}`;
    case "devolver":
      return `Devolver ${aoSetor(setores.origem)}`;
    case "reenviar":
      return "Responder e reenviar";
    case "reabrir":
      return "Reabrir a parte";
  }
}

/** O aviso de sucesso de cada ação (o toast). */
export function avisoDaAcao(acao: AcaoNaParte, setores: { parte: string; origem: string }): string {
  switch (acao) {
    case "comecar":
      return `Parte ${doSetor(setores.parte)} em andamento.`;
    case "finalizar":
      return `Parte ${doSetor(setores.parte)} finalizada.`;
    case "devolver":
      return `Parte ${doSetor(setores.parte)} devolvida ${aoSetor(setores.origem)}.`;
    case "reenviar":
      return `Reenviada ${aoSetor(setores.parte)}.`;
    case "reabrir":
      return `Parte ${doSetor(setores.parte)} reaberta.`;
  }
}

// ─── Responsáveis ───────────────────────────────────────────────────────────

/**
 * Quem entra e quem sai da lista de responsáveis (10/11/2026). Só quem entra
 * é avisado: a troca de antes apagava a lista inteira e regravava, e a pessoa
 * que já era responsável recebia o aviso de novo.
 */
export function diferencaDeResponsaveis(antes: readonly string[], depois: readonly string[]): { entram: string[]; saem: string[] } {
  const a = new Set(antes);
  const d = new Set(depois);
  return { entram: [...d].filter((id) => !a.has(id)), saem: [...a].filter((id) => !d.has(id)) };
}

/** "Ana", "Ana e Bruno", "Ana, Bruno e Carla". */
export function juntarNomes(nomes: readonly string[]): string {
  if (nomes.length <= 1) return nomes[0] ?? "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/** O resumo da mudança de responsáveis guardado no evento: "Entram: Ana. Saem: Bruno." */
export function resumoDosResponsaveis(entram: readonly string[], saem: readonly string[]): string {
  const partes: string[] = [];
  if (entram.length > 0) partes.push(`${entram.length === 1 ? "Entra" : "Entram"}: ${juntarNomes(entram)}.`);
  if (saem.length > 0) partes.push(`${saem.length === 1 ? "Sai" : "Saem"}: ${juntarNomes(saem)}.`);
  return partes.join(" ");
}

// ─── Notificações ───────────────────────────────────────────────────────────

/**
 * Quem recebe o aviso de comentário (10/11/2026): quem pediu e os responsáveis
 * de todas as partes ganham HANDOFF_COMMENT; o mencionado com @ ganha
 * HANDOFF_MENTION, que diz mais — e não os dois. Quem escreveu não recebe.
 */
export function destinatariosDoComentario(p: {
  autor: string;
  requestedBy: string;
  responsaveis: readonly string[];
  mencionados: readonly string[];
}): { comentario: string[]; mencao: string[] } {
  const mencao = [...new Set(p.mencionados)].filter((id) => id !== p.autor);
  const jaAvisados = new Set([p.autor, ...mencao]);
  const comentario = [...new Set([p.requestedBy, ...p.responsaveis])].filter((id) => !jaAvisados.has(id));
  return { comentario, mencao };
}

/** Corta um texto longo para caber numa linha ("Devolvida: o CNPJ…"). */
export function resumir(texto: string, maximo: number): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (limpo.length <= maximo) return limpo;
  return `${limpo.slice(0, maximo - 1).trimEnd()}…`;
}
