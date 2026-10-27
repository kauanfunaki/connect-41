export function intervaloMes(mes: string) {
  const [ano, numero] = mes.split("-").map(Number);
  const inicio = new Date(Date.UTC(ano, numero - 1, 1));
  const fim = new Date(Date.UTC(ano, numero, 1));
  const anterior = new Date(Date.UTC(ano, numero - 2, 1)).toISOString().slice(0, 7);
  return { inicio, fim, anterior, proximo: fim.toISOString().slice(0, 7), dias: new Date(Date.UTC(ano, numero, 0)).getUTCDate(), semana: inicio.getUTCDay() };
}
