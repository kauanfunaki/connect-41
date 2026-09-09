// Converte o valor de um <input type="datetime-local"> ("YYYY-MM-DDTHH:mm"),
// que não carrega timezone, assumindo que representa hora de wall-clock em
// América/Sao_Paulo (UTC-3 fixo — sem horário de verão desde 2019) — não a
// hora local do processo Node, que normalmente roda em UTC no servidor
// (causava reuniões criadas às 14h aparecerem como "passadas" 3h antes da
// hora real, já que `new Date(str)` sem timezone é interpretado como hora
// local do servidor, não do usuário).
export function parseSaoPauloDateTimeLocal(value: string): Date {
  const [datePart, timePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = (timePart ?? "00:00").split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour + 3, minute));
}

/**
 * Segundos decorridos desde um instante ISO vindo do servidor.
 *
 * Nunca devolve negativo: o `startedAt` é gravado com o relógio do servidor e
 * lido com o do navegador, e um relógio de usuário adiantado produziria uma
 * contagem negativa nos primeiros segundos. "0" é mais honesto que "-3".
 */
export function segundosDesde(inicioIso: string, agora = Date.now()): number {
  const inicio = new Date(inicioIso).getTime();
  if (Number.isNaN(inicio)) return 0;
  return Math.max(0, Math.floor((agora - inicio) / 1000));
}

/**
 * Duração em curso, no formato de cronômetro: `M:SS` até uma hora, `H:MM:SS`
 * daí em diante.
 *
 * É diferente do `formatMinutes` do apontamento de horas ("2h30min"), e de
 * propósito: aquele resume um lançamento fechado, este conta enquanto anda, e
 * um contador que não mostra os segundos parece travado.
 */
export function formatarDecorrido(segundos: number): string {
  const total = Math.max(0, Math.floor(segundos));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const doisDigitos = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${doisDigitos(m)}:${doisDigitos(s)}` : `${m}:${doisDigitos(s)}`;
}

/**
 * Quantos minutos o cronômetro aponta para uma duração em segundos.
 *
 * Minuto cheio, com piso de 1: apontamento de horas é cobrado em minutos, e
 * uma sessão curta de verdade não pode virar zero. `0:47` vale 1 minuto,
 * `1:29` também.
 *
 * Vive aqui, e não solta dentro da action, porque a tela precisa da MESMA
 * regra para dizer de antemão o que será gravado. Duas cópias da conversão
 * divergiriam, e aí o contador voltaria a mentir — que é o problema que esta
 * função existe para resolver.
 */
export function minutosApontados(segundos: number): number {
  return Math.max(1, Math.round(Math.max(0, segundos) / 60));
}
