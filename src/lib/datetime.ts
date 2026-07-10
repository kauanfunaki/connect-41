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
