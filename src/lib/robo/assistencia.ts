// Sessão assistida do robô (06/11/2026) — a regra, sem banco.
//
// O robô da máquina do TI preenche tudo e para no captcha ("Não sou um robô").
// Em vez de esperar alguém na própria máquina, ele espelha a tela do navegador
// no Connect, e uma pessoa do Societário resolve **só com o mouse**: o Connect
// não manda tecla, então não dá para digitar nada no site do órgão pela janela.
// Certificado e senha nunca saem da máquina.
//
// Decisões do Kauan (06/11/2026):
// - só mouse;
// - espera de 10 min no horário comercial; fora dele, direto para o caminho do PDF;
// - aviso primeiro para quem pediu e, depois de 2 min sem resposta, para o setor.
//
// Sem zod (13/11/2026, melhoria-661): este arquivo entra no menu de toda tela
// pela chamada do robô (AssistenciaAoVivo). Os esquemas que conferem o que
// chega na API moram em `assistenciaEsquemas.ts`.

import type { TipoDeTarefa } from "./tarefas";

/** Quanto o robô espera alguém resolver, no horário comercial. */
export const PRAZO_DA_ASSISTENCIA_MS = 10 * 60 * 1000;
/** Sem resposta de quem pediu depois disto, o aviso vai para o setor inteiro. */
export const ESCALAR_APOS_MS = 2 * 60 * 1000;
/** Sem quadro novo há mais disto, a tela diz que o robô parou de mandar. */
export const QUADRO_PARADO_MS = 15 * 1000;
/** O maior quadro aceito (JPEG de uma janela de 1280 px fica bem abaixo). */
export const QUADRO_MAXIMO_BYTES = 2 * 1024 * 1024;

/** Os tipos de tarefa em que o robô pode pedir ajuda. Tipo novo entra aqui e no programa da máquina. */
export const TIPOS_COM_ASSISTENCIA: readonly TipoDeTarefa[] = ["imprimir_alvara"];

export const MOTIVOS_DA_ASSISTENCIA = ["captcha"] as const;
export type MotivoDaAssistencia = (typeof MOTIVOS_DA_ASSISTENCIA)[number];
export const FINS_DA_ASSISTENCIA = ["resolvido", "prazo", "desistiu"] as const;
export type FimDaAssistencia = (typeof FINS_DA_ASSISTENCIA)[number];

/** Onde a pessoa clicou, em fração do quadro (0 a 1): o robô converte para a janela dele. Conferido por `cliqueSchema`. */
export type Clique = { x: number; y: number };

const FUSO_DE_SAO_PAULO_MS = -3 * 60 * 60 * 1000; // sem horário de verão desde 2019

/**
 * Horário comercial: segunda a sexta, das 8h às 18h de Brasília. Feriado não
 * entra — no feriado ninguém é chamado de qualquer jeito, e o robô espera os 10
 * minutos à toa antes do caminho do PDF; é o custo de não manter calendário aqui.
 */
export function dentroDoHorarioComercial(agora: Date): boolean {
  const local = new Date(agora.getTime() + FUSO_DE_SAO_PAULO_MS);
  const dia = local.getUTCDay();
  const hora = local.getUTCHours();
  return dia >= 1 && dia <= 5 && hora >= 8 && hora < 18;
}

export function prazoDaAssistencia(inicio: Date): Date {
  return new Date(inicio.getTime() + PRAZO_DA_ASSISTENCIA_MS);
}

/** Passou de 2 min, ninguém clicou e o setor ainda não foi chamado? */
export function precisaEscalar(s: { startedAt: Date; escalatedAt: Date | null; clicks: number; endedAt: Date | null }, agora: Date): boolean {
  return !s.endedAt && !s.escalatedAt && s.clicks === 0 && agora.getTime() - s.startedAt.getTime() >= ESCALAR_APOS_MS;
}

export type EstadoDaAssistencia = "aguardando_tela" | "ao_vivo" | "sem_sinal" | "resolvida" | "expirada" | "encerrada";

/** O estado que a tela mostra, a partir da sessão e do último quadro recebido. */
export function estadoDaAssistencia(
  s: { deadlineAt: Date; endedAt: Date | null; outcome: string | null },
  ultimoQuadroEm: Date | null,
  agora: Date,
): EstadoDaAssistencia {
  if (s.endedAt) return s.outcome === "resolvido" ? "resolvida" : s.outcome === "prazo" ? "expirada" : "encerrada";
  if (agora > s.deadlineAt) return "expirada";
  if (!ultimoQuadroEm) return "aguardando_tela";
  return agora.getTime() - ultimoQuadroEm.getTime() > QUADRO_PARADO_MS ? "sem_sinal" : "ao_vivo";
}

export const ROTULO_DO_ESTADO: Record<EstadoDaAssistencia, string> = {
  aguardando_tela: "Esperando a tela do robô",
  ao_vivo: "Ao vivo",
  sem_sinal: "O robô parou de mandar a tela",
  resolvida: "Resolvido",
  expirada: "Prazo encerrado",
  encerrada: "Encerrada",
};

/** A sessão ainda aceita clique? */
export function aceitaClique(estado: EstadoDaAssistencia): boolean {
  return estado === "ao_vivo" || estado === "sem_sinal";
}

/**
 * Converte o clique (fração do quadro) para a coordenada da janela do robô, em
 * pixels CSS. Fica aqui, e não só no programa da máquina, para o teste segurar
 * a conta: um clique fora do lugar marca outra coisa no site do órgão.
 */
export function cliqueNaJanela(c: Clique, janela: { largura: number; altura: number }): { x: number; y: number } {
  const limitar = (v: number, max: number) => Math.min(Math.max(0, Math.round(v)), Math.max(0, max - 1));
  return { x: limitar(c.x * janela.largura, janela.largura), y: limitar(c.y * janela.altura, janela.altura) };
}
