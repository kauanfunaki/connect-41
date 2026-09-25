// As regras do chat de IA do canto da tela — puras, testadas em `regras.test.ts`.
//
// Plano em Obsidian: Projects/Connect-41/Plano-Chat-IA-por-Setor-2026-09-25.
// O que mora aqui: quem vê o chat (piloto), quantas perguntas por dia, por
// quanto tempo a conversa fica, o que a tela aberta diz ao agente e o texto do
// passo que aparece enquanto ele consulta.

import type { AiChatAudience, UserRole } from "@/generated/prisma/enums";

/** Perguntas por pessoa por dia, somando todos os agentes do chat. */
export const LIMITE_DE_PERGUNTAS_POR_DIA = 30;

/** Dias sem mensagem depois dos quais a conversa é apagada. */
export const DIAS_DE_RETENCAO = 90;

/** Tamanho máximo da pergunta. */
export const MAX_CARACTERES_DA_PERGUNTA = 2_000;

/**
 * Quem conta como coordenador no piloto. `READONLY` (diretoria) fica fora: o
 * chat propõe mudanças, e quem só lê não aplica nenhuma.
 */
const COORDENADORES: ReadonlySet<UserRole> = new Set(["SUPER_ADMIN", "ADMIN", "SECTOR_ADMIN"]);

/** A pessoa vê o chat, dado o público configurado no escritório? */
export function publicoPermite(role: UserRole, audiencia: AiChatAudience): boolean {
  if (audiencia === "TODOS") return role !== "READONLY";
  return COORDENADORES.has(role);
}

/** O primeiro instante do dia corrente em São Paulo (UTC-3, sem horário de verão). */
export function inicioDoDiaEmSaoPaulo(agora: Date): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const n = (t: string) => Number(partes.find((p) => p.type === t)!.value);
  return new Date(Date.UTC(n("year"), n("month") - 1, n("day"), 3, 0, 0, 0));
}

/** A data de corte da retenção: conversas paradas desde antes disto são apagadas. */
export function corteDaRetencao(agora: Date): Date {
  return new Date(agora.getTime() - DIAS_DE_RETENCAO * 24 * 60 * 60 * 1000);
}

/** O nome da conversa na lista: a primeira pergunta, numa linha, cortada. */
export function tituloDaConversa(pergunta: string): string {
  const linha = pergunta.replace(/\s+/g, " ").trim();
  return linha.length > 80 ? `${linha.slice(0, 79)}…` : linha || "Conversa";
}

export type ContextoDaTela =
  | { tipo: "processo" | "vaga" | "candidato" | "empresa" | "documento_fiscal"; id: string }
  | { tipo: "tela"; caminho: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * O que a pessoa está vendo, a partir do caminho da página.
 *
 * Só o **tipo e o id** saem daqui. Nome, empresa e permissão são resolvidos no
 * servidor, com o tenant e o acesso de quem pergunta — o caminho vem do
 * navegador e não é prova de nada.
 */
export function contextoDaTela(caminho: string): ContextoDaTela | null {
  const limpo = caminho.split(/[?#]/)[0] ?? "";
  if (!limpo.startsWith("/")) return null;
  const processo = /^\/processos\/([^/]+)\/?$/.exec(limpo);
  if (processo && UUID.test(processo[1]!)) return { tipo: "processo", id: processo[1]! };
  const vaga = /^\/vagas\/([^/]+)(?:\/.*)?$/.exec(limpo);
  if (vaga && UUID.test(vaga[1]!)) return { tipo: "vaga", id: vaga[1]! };
  const empresa = /^\/empresas\/([^/]+)(?:\/.*)?$/.exec(limpo);
  if (empresa && UUID.test(empresa[1]!)) return { tipo: "empresa", id: empresa[1]! };
  const documento = /^\/documentos-fiscais\/([^/]+)\/?$/.exec(limpo);
  if (documento && UUID.test(documento[1]!)) return { tipo: "documento_fiscal", id: documento[1]! };
  const pessoa = /^\/candidatos\/([^/]+)\/?$/.exec(limpo);
  if (pessoa && UUID.test(pessoa[1]!)) return { tipo: "candidato", id: pessoa[1]! };
  return { tipo: "tela", caminho: limpo.slice(0, 120) };
}

/** O passo mostrado enquanto o agente consulta — por ferramenta. */
const PASSOS: Record<string, string> = {
  listar_fila: "Consultando a fila de processos…",
  ver_processo: "Lendo o processo…",
  propor_concluir_etapa: "Preparando uma sugestão…",
  propor_dispensar_etapa: "Preparando uma sugestão…",
  listar_minhas_telas: "Vendo as telas que você acessa…",
  listar_vagas: "Consultando as vagas…",
  ver_vaga_do_setor: "Lendo a vaga…",
  listar_candidatos_da_vaga: "Consultando os candidatos…",
  ver_candidatura: "Lendo a candidatura…",
  buscar_candidato: "Procurando o candidato…",
  buscar_empresa: "Procurando a empresa…",
  competencias_da_empresa: "Vendo os meses com documentos…",
  resumo_fiscal_do_mes: "Somando os documentos do mês…",
  listar_documentos_fiscais: "Listando os documentos…",
  fila_de_lancamento: "Contando a fila de lançamento…",
  contas_do_bpo: "Consultando as contas…",
  dre_do_mes: "Montando o DRE…",
  pendencias_de_clientes: "Consultando as pendências…",
  conciliacao_pendente: "Vendo a conciliação…",
  aprovacoes_aguardando: "Vendo as aprovações…",
  propor_mover_etapa: "Preparando uma sugestão…",
  propor_encerrar_candidatura: "Preparando uma sugestão…",
  buscar_nos_manuais: "Procurando nos manuais…",
};

export function textoDoPasso(ferramenta: string): string {
  return PASSOS[ferramenta] ?? "Consultando o Connect…";
}

/** Uma proposta gravada na mensagem, com o estado de aplicação. */
export type PropostaGravada = {
  ferramenta: string;
  descricao: string;
  argumentos: Record<string, unknown>;
  /** De quem é a proposta, resolvido no servidor ("Maria Souza", "Registro na Junta"). */
  alvo?: string;
  aplicada?: boolean;
};

/** Lê as propostas do JSON gravado, descartando o que não tiver a forma certa. */
export function lerPropostas(bruto: unknown): PropostaGravada[] {
  if (!Array.isArray(bruto)) return [];
  return bruto.flatMap((p) => {
    if (!p || typeof p !== "object") return [];
    const o = p as Record<string, unknown>;
    if (typeof o.ferramenta !== "string") return [];
    return [
      {
        ferramenta: o.ferramenta,
        descricao: typeof o.descricao === "string" ? o.descricao : "",
        argumentos: o.argumentos && typeof o.argumentos === "object" ? (o.argumentos as Record<string, unknown>) : {},
        ...(typeof o.alvo === "string" ? { alvo: o.alvo } : {}),
        aplicada: o.aplicada === true,
      },
    ];
  });
}

/** O que o cartão da proposta diz, em uma linha. */
const ETAPA_DO_FUNIL: Record<string, string> = {
  TRIAGEM: "Triagem",
  ENTREVISTA: "Entrevista",
  TESTE: "Teste",
  PROPOSTA: "Proposta",
  CONTRATADO: "Contratado",
};

export function descreverProposta(p: {
  ferramenta: string;
  descricao: string;
  argumentos?: Record<string, unknown>;
  alvo?: string;
}): string {
  const a = p.argumentos ?? {};
  const motivo = typeof a.motivo === "string" && a.motivo.trim() ? ` — ${a.motivo.trim()}` : "";
  const alvo = p.alvo ? ` ${p.alvo}` : "";
  if (p.ferramenta === "propor_concluir_etapa") return `Concluir a etapa${alvo ? ` "${p.alvo}"` : ""}${motivo}`;
  if (p.ferramenta === "propor_dispensar_etapa") return `Dispensar a etapa${alvo ? ` "${p.alvo}"` : ""}${motivo}`;
  if (p.ferramenta === "propor_mover_etapa") {
    const etapa = typeof a.etapa === "string" ? (ETAPA_DO_FUNIL[a.etapa] ?? a.etapa) : "outra etapa";
    return `Mover${alvo || " o candidato"} para ${etapa}${motivo}`;
  }
  if (p.ferramenta === "propor_encerrar_candidatura") {
    const desfecho = a.desfecho === "DESISTENTE" ? "desistente" : "reprovado";
    return `Encerrar${alvo || " a candidatura"} como ${desfecho}${motivo}`;
  }
  return p.descricao;
}
