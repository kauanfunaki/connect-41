// Expediente da Agenda (05/10/2026): o horário que a grade de dia e de semana
// cobre. Era fixo, das 7h às 21h; um escritório que trabalha à noite ou de
// madrugada não via as próprias reuniões. Agora o escritório define o padrão
// e cada pessoa pode usar o dele ou o seu.
//
// Tudo que é regra mora aqui — padrão, validação, em que coluna cai cada
// instante — para a tela, o servidor e os testes falarem a mesma coisa.
//
// O horário pode passar da meia-noite (22h → 6h). Aí a coluna de cada dia vai
// das 22h daquele dia às 6h do dia seguinte: uma reunião à 01h de terça aparece
// na coluna de segunda. Os prazos (dia inteiro) continuam por data de
// calendário — não passam por aqui.
//
// Mesma premissa de src/lib/agenda.ts: Brasília em UTC-3 fixo.

import { addDaysToKey, saoPauloDateTimeToUtc, saoPauloParts, toSaoPauloDateTimeLocal } from "@/lib/agenda";

/**
 * Início e fim da coluna de um dia, em horas cheias (0–23). O fim é exclusivo:
 * 7 → 21 vai até 20:59. Fim menor que o início passa da meia-noite; início
 * igual ao fim cobre as 24 horas.
 */
export type Expediente = { inicio: number; fim: number };

/** Sem configuração nenhuma, a Agenda segue como sempre foi. */
export const EXPEDIENTE_PADRAO: Expediente = { inicio: 7, fim: 21 };

/** Abaixo disso a grade não serve de agenda — 4 horas foi a decisão de 05/10. */
export const DURACAO_MINIMA_HORAS = 4;

const HORA_MS = 3_600_000;
const MINUTO_MS = 60_000;

/** Quantas horas a coluna cobre: de 4 a 24. */
export function duracaoEmHoras(e: Expediente): number {
  const d = (e.fim - e.inicio + 24) % 24;
  return d === 0 ? 24 : d;
}

/** A coluna termina no dia seguinte ao que ela representa. */
export function passaDaMeiaNoite(e: Expediente): boolean {
  return e.inicio + duracaoEmHoras(e) > 24;
}

function horaValida(h: unknown): h is number {
  return typeof h === "number" && Number.isInteger(h) && h >= 0 && h <= 23;
}

/** `null` quando está tudo certo; senão, a mensagem para quem preencheu. */
export function erroDoExpediente(inicio: unknown, fim: unknown): string | null {
  if (!horaValida(inicio) || !horaValida(fim)) return "Escolha o início e o fim em horas cheias, de 0h a 23h.";
  if (duracaoEmHoras({ inicio, fim }) < DURACAO_MINIMA_HORAS) {
    return `O horário precisa cobrir pelo menos ${DURACAO_MINIMA_HORAS} horas.`;
  }
  return null;
}

export function expedienteValido(e: Partial<Expediente> | null | undefined): e is Expediente {
  return !!e && erroDoExpediente(e.inicio, e.fim) === null;
}

/**
 * Lê os dois campos de um formulário ("22", "6"). Campo vazio ou fora do
 * formato vira erro — nunca um padrão silencioso, senão um "Salvar" com o
 * campo apagado gravaria 0h sem ninguém ter escolhido.
 */
export function lerExpediente(
  inicioBruto: FormDataEntryValue | null,
  fimBruto: FormDataEntryValue | null,
): { ok: true; expediente: Expediente } | { ok: false; erro: string } {
  const numero = (v: FormDataEntryValue | null) =>
    typeof v === "string" && /^\d{1,2}$/.test(v.trim()) ? Number(v.trim()) : NaN;
  const inicio = numero(inicioBruto);
  const fim = numero(fimBruto);
  const erro = erroDoExpediente(inicio, fim);
  return erro ? { ok: false, erro } : { ok: true, expediente: { inicio, fim } };
}

/**
 * O expediente que a grade usa: o da pessoa, se ela definiu um; senão o do
 * escritório; senão o padrão. Linha inválida no banco (alguém mexeu à mão) é
 * ignorada em vez de quebrar a Agenda.
 */
export function resolverExpediente(
  escritorio: Partial<Expediente> | null | undefined,
  pessoa: Partial<Expediente> | null | undefined,
): Expediente {
  if (expedienteValido(pessoa)) return { inicio: pessoa.inicio, fim: pessoa.fim };
  if (expedienteValido(escritorio)) return { inicio: escritorio.inicio, fim: escritorio.fim };
  return EXPEDIENTE_PADRAO;
}

/** A hora de cada linha da grade, de cima para baixo: 22, 23, 0, 1, … */
export function horasDaGrade(e: Expediente): number[] {
  return Array.from({ length: duracaoEmHoras(e) }, (_, i) => (e.inicio + i) % 24);
}

export function rotuloDaHora(h: number): string {
  return `${h}:00`;
}

/** "7:00 às 21:00", "22:00 às 6:00 do dia seguinte", "24 horas, a partir das 7:00". */
export function descreverExpediente(e: Expediente): string {
  if (duracaoEmHoras(e) === 24) return `24 horas, a partir das ${rotuloDaHora(e.inicio)}`;
  const base = `${rotuloDaHora(e.inicio)} às ${rotuloDaHora(e.fim)}`;
  // 18 → 0 termina à meia-noite em ponto: não entra no dia seguinte.
  return passaDaMeiaNoite(e) && e.fim !== 0 ? `${base} do dia seguinte` : base;
}

// ── Instantes ────────────────────────────────────────────────────────────────

/** Instante em que a coluna do dia `dia` ("YYYY-MM-DD") começa. */
export function inicioDaColuna(e: Expediente, dia: string): Date {
  return saoPauloDateTimeToUtc(dia, e.inicio, 0);
}

/**
 * A coluna que começou por último antes do instante (ou nele), e a quantos
 * minutos do topo dela o instante está. Pode passar do fim da coluna — é o
 * intervalo entre ela e a próxima, quando o expediente não cobre 24 horas.
 */
function colunaAnterior(e: Expediente, instante: Date): { dia: string; minuto: number } {
  const sp = saoPauloParts(instante);
  const dia = sp.hour >= e.inicio ? sp.dateKey : addDaysToKey(sp.dateKey, -1);
  return { dia, minuto: (instante.getTime() - inicioDaColuna(e, dia).getTime()) / MINUTO_MS };
}

/**
 * Em que coluna o instante cai e a quantos minutos do topo. `null` quando ele
 * fica fora do horário — entre o fim de uma coluna e o começo da seguinte.
 */
export function colunaDoInstante(e: Expediente, instante: Date): { dia: string; minuto: number } | null {
  const c = colunaAnterior(e, instante);
  return c.minuto < duracaoEmHoras(e) * 60 ? c : null;
}

/** Reunião mais curta que isso ainda ganha altura de 15 minutos — senão vira um risco. */
const ALTURA_MINIMA_MIN = 15;

export type PosicaoNaGrade = {
  /** Coluna em que a reunião aparece. */
  dia: string;
  /** Minutos do topo da coluna até o começo e o fim do bloco — já cortados ao horário. */
  inicioMin: number;
  fimMin: number;
};

/**
 * Onde a reunião aparece na grade. Ela vai para a coluna em que começa; a
 * parte que passa do fim da coluna é cortada (como já era com a reunião que
 * virava o dia). A que começa fora do horário, mas entra nele, aparece cortada
 * no topo da coluna seguinte. `null` = inteira fora do horário.
 */
export function posicaoDaReuniao(e: Expediente, inicio: Date, fim: Date): PosicaoNaGrade | null {
  const total = duracaoEmHoras(e) * 60;
  let coluna = colunaDoInstante(e, inicio);
  if (!coluna) {
    const proximo = addDaysToKey(colunaAnterior(e, inicio).dia, 1);
    if (fim.getTime() <= inicioDaColuna(e, proximo).getTime()) return null;
    coluna = { dia: proximo, minuto: 0 };
  }
  const fimReal = (fim.getTime() - inicioDaColuna(e, coluna.dia).getTime()) / MINUTO_MS;
  const fimMin = Math.min(Math.max(fimReal, coluna.minuto + ALTURA_MINIMA_MIN), total);
  return { dia: coluna.dia, inicioMin: coluna.minuto, fimMin };
}

/**
 * Quantas reuniões dos dias exibidos não aparecem na grade porque começam
 * fora do horário. Conta só as do calendário dos dias à vista: a reunião da
 * madrugada de segunda num expediente 22h → 6h é da coluna de domingo — está
 * no horário, só que em outro dia.
 */
export function contarForaDoHorario(
  e: Expediente,
  dias: string[],
  reunioes: { startAt: string; endAt: string }[],
): number {
  const exibidos = new Set(dias);
  let n = 0;
  for (const r of reunioes) {
    const inicio = new Date(r.startAt);
    if (!exibidos.has(saoPauloParts(inicio).dateKey) || colunaDoInstante(e, inicio)) continue;
    const pos = posicaoDaReuniao(e, inicio, new Date(r.endAt));
    if (!pos || !exibidos.has(pos.dia)) n++;
  }
  return n;
}

/**
 * Janela de busca das reuniões: do começo do primeiro dia até o fim da última
 * coluna ou da meia-noite seguinte, o que vier depois. A coluna do último dia
 * entra no dia seguinte quando o expediente passa da meia-noite; e a reunião
 * de calendário dos dias à vista que caiu fora do horário precisa vir junto
 * para ser contada no aviso.
 */
export function intervaloDaBusca(e: Expediente, primeiroDia: string, ultimoDia: string): { inicio: Date; fim: Date } {
  const meiaNoiteSeguinte = saoPauloDateTimeToUtc(addDaysToKey(ultimoDia, 1), 0, 0);
  const fimDaUltima = new Date(inicioDaColuna(e, ultimoDia).getTime() + duracaoEmHoras(e) * HORA_MS);
  return {
    inicio: saoPauloDateTimeToUtc(primeiroDia, 0, 0),
    fim: fimDaUltima > meiaNoiteSeguinte ? fimDaUltima : meiaNoiteSeguinte,
  };
}

// ── Horário de uma reunião nova ───────────────────────────────────────────────

/** Início e fim no formato do <input type="datetime-local">, em Brasília. */
export type Slot = { start: string; end: string };

function slotAPartirDe(inicio: Date): Slot {
  return {
    start: toSaoPauloDateTimeLocal(inicio),
    end: toSaoPauloDateTimeLocal(new Date(inicio.getTime() + HORA_MS)),
  };
}

/** A hora `linha` (0 = a do topo) da coluna do dia — o clique num horário vazio. */
export function slotDaLinha(e: Expediente, dia: string, linha: number): Slot {
  return slotAPartirDe(new Date(inicioDaColuna(e, dia).getTime() + linha * HORA_MS));
}

function limitar(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

/**
 * A linha da grade para a hora `hora` (1–24, a próxima hora cheia), puxada
 * para dentro do horário. Sem passar da meia-noite é o `clamp` entre 7h e 20h
 * de antes: cedo demais vai para a primeira linha, tarde demais para a última.
 * Passando da meia-noite, o intervalo fora do horário fica antes de a coluna
 * do dia começar, então ele vai sempre para a primeira linha.
 */
function linhaDaHora(e: Expediente, hora: number): number {
  const duracao = duracaoEmHoras(e);
  if (!passaDaMeiaNoite(e)) return limitar(hora - e.inicio, 0, duracao - 1);
  const linha = (hora - e.inicio + 24) % 24;
  return linha < duracao ? linha : 0;
}

/**
 * Clique num dia da visão de mês: a próxima hora cheia, puxada para dentro do
 * horário, **no dia de calendário clicado** — a visão de mês é por data, então
 * a reunião tem de nascer no dia em que se clicou, mesmo na madrugada.
 */
export function slotNoDia(e: Expediente, dia: string, agora: Date): Slot {
  const hora = (e.inicio + linhaDaHora(e, saoPauloParts(agora).hour + 1)) % 24;
  return slotAPartirDe(saoPauloDateTimeToUtc(dia, hora, 0));
}

/**
 * Botão "Nova reunião": a próxima hora cheia de verdade quando a coluna em que
 * estamos agora (ou a de hoje) está à vista, presa à coluna — a madrugada de
 * terça num expediente 22h → 6h cai na coluna de segunda. Sem nenhuma das
 * duas à vista, a mesma hora na primeira coluna exibida (uma reunião criada de
 * dentro de outubro não deve nascer em setembro).
 */
export function slotParaNovaReuniao(e: Expediente, dias: string[], agora: Date): Slot {
  const sp = saoPauloParts(agora);
  const proxima = saoPauloDateTimeToUtc(sp.dateKey, sp.hour + 1, 0);
  const coluna = [colunaDoInstante(e, agora)?.dia, sp.dateKey].find((d) => d !== undefined && dias.includes(d));
  if (!coluna) return slotDaLinha(e, dias[0], linhaDaHora(e, sp.hour + 1));
  const horasDesdeOTopo = Math.round((proxima.getTime() - inicioDaColuna(e, coluna).getTime()) / HORA_MS);
  return slotDaLinha(e, coluna, limitar(horasDesdeOTopo, 0, duracaoEmHoras(e) - 1));
}
