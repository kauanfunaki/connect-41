// Horários de trabalho do DP 2 (25/11/2026, funcionalidade-752, entrega 1).
//
// Cada empresa cadastra os horários (dias da semana, entrada, saída e
// intervalo); o contrato liga o colaborador a um deles, e daí saem as horas
// por mês do cálculo (horas semanais × 5, como os 220 h das 44 h) e a jornada
// do eSocial (tipo e texto do S-2200/S-2206).
//
// Puro, sem banco.

/** Os dias, de segunda a domingo, como "1111100" (segunda a sexta). */
export const NOMES_DOS_DIAS = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"] as const;
const ABREVIADOS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"] as const;

export type Horario = { nome: string; dias: string; entrada: string; saida: string; intervaloMinutos: number; tipoJornada: string };

export type HorasDoHorario = { diarias: number; semanais: number; mensais: number; descricao: string };

const minutos = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
};
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** "Segunda a sexta", "Segunda a sábado", "Segunda, quarta e sexta". */
export function diasPorExtenso(dias: string): string {
  const marcados = [...dias].map((d, i) => (d === "1" ? i : -1)).filter((i) => i >= 0);
  if (marcados.length === 0) return "Nenhum dia";
  const seguidos = marcados.every((d, k) => k === 0 || d === marcados[k - 1] + 1);
  const nome = (i: number) => NOMES_DOS_DIAS[i];
  const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
  if (marcados.length === 1) return cap(nome(marcados[0]));
  if (seguidos && marcados.length > 2) return cap(`${nome(marcados[0])} a ${nome(marcados[marcados.length - 1])}`);
  const nomes = marcados.map(nome);
  return cap(`${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`);
}

/** Lê o horário digitado; devolve o erro em português quando não fecha. */
export function lerHorario(e: { nome: string; dias: readonly string[]; entrada: string; saida: string; intervalo: string; tipoJornada: string }): { ok: true; horario: Horario } | { ok: false; erro: string } {
  const nome = e.nome.trim().slice(0, 80);
  if (!nome) return { ok: false, erro: "Dê um nome ao horário (ex.: Comercial 44 h)." };
  const dias = ABREVIADOS.map((_, i) => (e.dias.includes(String(i)) ? "1" : "0")).join("");
  if (!dias.includes("1")) return { ok: false, erro: "Marque os dias da semana do horário." };
  const ini = minutos(e.entrada);
  const fim = minutos(e.saida);
  if (ini === null || fim === null) return { ok: false, erro: "Informe a entrada e a saída em HH:MM." };
  const intervaloMinutos = Number(e.intervalo || 0);
  if (!Number.isInteger(intervaloMinutos) || intervaloMinutos < 0 || intervaloMinutos > 240) return { ok: false, erro: "Intervalo em minutos, de 0 a 240." };
  // Saída antes da entrada = virada de dia (turno da noite).
  const bruto = fim > ini ? fim - ini : fim + 1440 - ini;
  if (bruto - intervaloMinutos <= 0) return { ok: false, erro: "O intervalo é maior que a jornada." };
  const tipoJornada = ["2", "3", "9"].includes(e.tipoJornada) ? e.tipoJornada : "9";
  return { ok: true, horario: { nome, dias, entrada: hhmm(ini), saida: hhmm(fim), intervaloMinutos, tipoJornada } };
}

/** As horas do horário e a jornada por extenso do eSocial. */
export function horasDoHorario(h: Horario): HorasDoHorario {
  const ini = minutos(h.entrada) ?? 0;
  const fim = minutos(h.saida) ?? 0;
  const bruto = fim > ini ? fim - ini : fim + 1440 - ini;
  const diariasMin = Math.max(0, bruto - h.intervaloMinutos);
  const diasNaSemana = [...h.dias].filter((d) => d === "1").length;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  const diarias = r2(diariasMin / 60);
  const semanais = r2((diariasMin * diasNaSemana) / 60);
  const intervalo = h.intervaloMinutos === 0 ? "sem intervalo" : h.intervaloMinutos % 60 === 0 ? `${h.intervaloMinutos / 60}h de intervalo` : `${h.intervaloMinutos} min de intervalo`;
  return {
    diarias,
    semanais,
    // 44 h por semana = 220 h por mês: semanais × 5.
    mensais: Math.round(semanais * 5),
    descricao: `${diasPorExtenso(h.dias)}, ${h.entrada} às ${h.saida}, ${intervalo}`,
  };
}
