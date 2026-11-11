// Dias úteis e de descanso do mês, para o DSR sobre horas extras (11/11/2026).
//
// Descanso = domingos e feriados nacionais (Lei 605/1949). Sábado conta como
// dia útil, que é a regra para o DSR. Feriados estaduais e municipais entram
// por `extras` ("AAAA-MM-DD"), quando o escritório tiver.
//
// Puro, sem banco.

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), em UTC. */
export function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Feriados nacionais do ano ("AAAA-MM-DD"), com a Sexta-feira Santa. */
export function feriadosNacionais(ano: number): string[] {
  const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"].map((md) => `${ano}-${md}`);
  const sexta = pascoa(ano);
  sexta.setUTCDate(sexta.getUTCDate() - 2);
  return [...fixos, iso(sexta)].sort();
}

export type DiasDoMes = { diasUteis: number; diasDeDescanso: number; feriados: string[] };

export function diasDoMes(ano: number, mes: number, extras: readonly string[] = []): DiasDoMes {
  const feriados = new Set([...feriadosNacionais(ano), ...extras]);
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  let diasUteis = 0;
  let diasDeDescanso = 0;
  const doMes: string[] = [];
  for (let dia = 1; dia <= ultimo; dia++) {
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    const chave = iso(d);
    if (d.getUTCDay() === 0 || feriados.has(chave)) {
      diasDeDescanso++;
      if (feriados.has(chave) && d.getUTCDay() !== 0) doMes.push(chave);
    } else {
      diasUteis++;
    }
  }
  return { diasUteis, diasDeDescanso, feriados: doMes };
}
