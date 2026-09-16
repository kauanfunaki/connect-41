// A régua de cobrança: lembretes automáticos por e-mail ao sacado, por dias de
// atraso. Funções puras — o cron decide com elas, e a fila mostra o mesmo
// veredito para quem quer saber por que um título não recebeu lembrete.

import { diasEntre } from "../periodo";
import type { SituacaoDeCobranca, UltimoContato } from "./regras";

export const PASSOS_PADRAO = [1, 7, 15, 30];
export const MAXIMO_DE_PASSOS = 10;
export const MAIOR_PASSO = 365;
/**
 * Por quantos dias o último passo continua devido depois de alcançado.
 *
 * Existe para o dia em que a régua é ligada numa carteira antiga: sem janela,
 * o título com 400 dias de atraso receberia o lembrete de 30 dias no primeiro
 * cron — e dívida velha é conversa da equipe, não e-mail automático.
 */
export const JANELA_DO_ULTIMO_PASSO = 30;

/** "1, 7,15 ,30" → [1, 7, 15, 30]. Ordena e tira repetidos; recusa o resto. */
export function lerPassos(texto: string | null | undefined): { ok: true; passos: number[] } | { ok: false; erro: string } {
  const partes = (texto ?? "")
    .split(/[,;\s]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (partes.length === 0) return { ok: false, erro: "Informe ao menos um passo, em dias de atraso." };
  const numeros: number[] = [];
  for (const p of partes) {
    if (!/^\d+$/.test(p)) return { ok: false, erro: `"${p}" não é um número de dias.` };
    const n = Number(p);
    if (n < 1 || n > MAIOR_PASSO) return { ok: false, erro: `Passos entre 1 e ${MAIOR_PASSO} dias.` };
    numeros.push(n);
  }
  const passos = [...new Set(numeros)].sort((a, b) => a - b);
  if (passos.length > MAXIMO_DE_PASSOS) return { ok: false, erro: `No máximo ${MAXIMO_DE_PASSOS} passos.` };
  return { ok: true, passos };
}

export function textoDosPassos(passos: number[]): string {
  return passos.join(",");
}

/**
 * O passo da régua devido hoje para um título, ou `null`.
 *
 * É **só o maior passo já alcançado**, e só enquanto ele não foi enviado e o
 * próximo passo não chegou. Duas consequências de propósito:
 *
 * - o cron que ficou dois dias parado não manda, na volta, o lembrete de 1 dia
 *   e o de 7 no mesmo e-mail — manda o de 7;
 * - um passo perdido (cron fora do ar do dia 7 ao dia 15) não é recuperado
 *   depois: o sacado recebe o de 15, que diz o atraso de hoje.
 */
export function passoDevido(diasDeAtraso: number, passos: number[], enviados: number[]): number | null {
  const ordenados = [...passos].sort((a, b) => a - b);
  let i = -1;
  for (let k = 0; k < ordenados.length; k++) if (ordenados[k]! <= diasDeAtraso) i = k;
  if (i < 0) return null;
  const passo = ordenados[i]!;
  const limite = ordenados[i + 1] ?? passo + JANELA_DO_ULTIMO_PASSO;
  if (diasDeAtraso >= limite) return null;
  // Enviado um passo igual ou maior — inclusive de uma configuração anterior
  // com outros números — e este já não é notícia.
  if (enviados.some((e) => e >= passo)) return null;
  return passo;
}

export type MotivoForaDaRegua =
  | "REGUA_DESLIGADA"
  | "EMPRESA_FORA"
  | "NAO_ESTA_EM_COBRANCA"
  | "EM_ACORDO"
  | "CONTESTADO"
  | "PROMESSA_DE_PAGAMENTO"
  | "SEM_EMAIL"
  | "SEM_PASSO_HOJE";

export const ROTULO_DO_MOTIVO: Record<MotivoForaDaRegua, string> = {
  REGUA_DESLIGADA: "Régua desligada",
  EMPRESA_FORA: "Empresa fora da régua",
  NAO_ESTA_EM_COBRANCA: "Fora da cobrança",
  EM_ACORDO: "Pausada: em acordo",
  CONTESTADO: "Pausada: contestado",
  PROMESSA_DE_PAGAMENTO: "Pausada: prometeu pagar",
  SEM_EMAIL: "Sacado sem e-mail",
  SEM_PASSO_HOJE: "Nenhum passo hoje",
};

export type TituloParaRegua = {
  situacao: SituacaoDeCobranca | null;
  vencimentoKey: string;
  ultimoContato: UltimoContato | null;
  email: string | null;
  empresaForaDaRegua: boolean;
  /** Passos já registrados no log deste título, com ou sem sucesso. */
  enviados: number[];
};

export type VereditoDaRegua = { enviar: number } | { enviar: null; motivo: MotivoForaDaRegua };

/**
 * Manda lembrete hoje? A ordem das perguntas é a que a tela mostra como motivo:
 * a primeira que barra é a que a pessoa precisa resolver.
 *
 * As pausas:
 *
 * - **em acordo** — o sacado está pagando parcelas; lembrar da dívida original
 *   atropela o que foi combinado;
 * - **contestou** no último contato — mandar "você está devendo" para quem
 *   disse que não deve é o que transforma contestação em reclamação;
 * - **prometeu pagar** com a data prometida ainda não passada (hoje incluído:
 *   promessa para hoje ainda pode ser cumprida hoje). Passada a data sem
 *   pagamento, a régua volta.
 *
 * Sem e-mail vem **depois** das pausas: um título pausado não precisa de
 * e-mail, e pedir cadastro para ele seria trabalho sem efeito.
 */
export function avaliarRegua(t: TituloParaRegua, config: { ligada: boolean; passos: number[] }, hojeKey: string): VereditoDaRegua {
  if (!config.ligada) return { enviar: null, motivo: "REGUA_DESLIGADA" };
  if (t.empresaForaDaRegua) return { enviar: null, motivo: "EMPRESA_FORA" };
  if (t.situacao === "EM_ACORDO") return { enviar: null, motivo: "EM_ACORDO" };
  if (t.situacao === null || t.situacao === "PERDA" || t.situacao === "EM_DIA") return { enviar: null, motivo: "NAO_ESTA_EM_COBRANCA" };
  const c = t.ultimoContato;
  if (c?.resultado === "CONTESTOU") return { enviar: null, motivo: "CONTESTADO" };
  if (c?.resultado === "PROMETEU_PAGAR" && c.proximaAcaoKey !== null && c.proximaAcaoKey >= hojeKey) {
    return { enviar: null, motivo: "PROMESSA_DE_PAGAMENTO" };
  }
  if (!t.email) return { enviar: null, motivo: "SEM_EMAIL" };
  const passo = passoDevido(diasEntre(t.vencimentoKey, hojeKey), config.passos, t.enviados);
  if (passo === null) return { enviar: null, motivo: "SEM_PASSO_HOJE" };
  return { enviar: passo };
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** E-mail do sacado normalizado, `null` quando vazio; `false` quando inválido. */
export function lerEmail(texto: string | null | undefined): string | null | false {
  const e = (texto ?? "").trim().toLowerCase();
  if (e === "") return null;
  if (e.length > 180 || !RE_EMAIL.test(e)) return false;
  return e;
}
