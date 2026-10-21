// Os feriados que valem para o escritório: os nacionais, calculados
// (`datas/feriadosNacionais.ts`), mais as exceções cadastradas em
// /admin/feriados — estaduais, municipais, pontes e recessos (21/10/2026).
//
// Todo leitor de feriado passa por aqui: os prazos em dias úteis, o calendário
// do campo de data, as obrigações recorrentes e a repetição de lançamentos.

import { getPrisma } from "@/lib/prisma";
import { anosDosFeriados, feriadosNacionais } from "@/lib/datas/feriadosNacionais";
import { hojeIso } from "@/lib/datas/calendario";

/** Os nacionais dos anos em uso, como "AAAA-MM-DD" → nome. */
export function nacionaisEmUso(agora: Date = new Date()): Map<string, string> {
  const ano = Number(hojeIso(agora).slice(0, 4));
  return new Map(anosDosFeriados(ano).flatMap((a) => feriadosNacionais(a).map((f) => [f.data, f.nome] as const)));
}

/**
 * "AAAA-MM-DD" → nome. A data do cadastro é lida em UTC (gravada como
 * meia-noite UTC, ver `chaveDoFeriado` em societario/fila.ts). Na data que
 * também é nacional, fica o nome do nacional.
 */
export async function feriadosDoEscritorio(tenantId: string): Promise<Map<string, string>> {
  const cadastrados = await getPrisma().holiday.findMany({
    where: { tenantId },
    select: { date: true, name: true },
  });
  const mapa = new Map(cadastrados.map((h) => [h.date.toISOString().slice(0, 10), h.name]));
  for (const [data, nome] of nacionaisEmUso()) mapa.set(data, nome);
  return mapa;
}
