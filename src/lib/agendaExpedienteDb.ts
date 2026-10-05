// Acesso a banco do expediente da Agenda. Separado de `agendaExpediente.ts`
// para a regra continuar pura e testável sem Prisma.

import { getPrisma } from "@/lib/prisma";
import { isPrismaMissingTableError } from "@/lib/prismaErrors";
import { expedienteValido, resolverExpediente, type Expediente } from "@/lib/agendaExpediente";

export type ExpedientesDaPessoa = {
  /** O do escritório como está no banco — `null` = nunca configurado (vale o padrão). */
  escritorio: Expediente | null;
  /** O próprio da pessoa — `null` = usa o do escritório. */
  pessoa: Expediente | null;
  /** O que a grade usa. */
  efetivo: Expediente;
};

type Linha = { inicioHora: number; fimHora: number } | null;

const CAMPOS = { inicioHora: true, fimHora: true } as const;

function deLinha(linha: Linha): Expediente | null {
  const e = linha ? { inicio: linha.inicioHora, fim: linha.fimHora } : null;
  return expedienteValido(e) ? e : null;
}

/**
 * Se a migration de 05/10/2026 ainda não rodou (P2021), a leitura cai no
 * padrão em vez de derrubar a tela — qualquer outro erro sobe normalmente.
 */
async function lerComFolga(consulta: () => Promise<Linha>): Promise<Expediente | null> {
  try {
    return deLinha(await consulta());
  } catch (err) {
    if (!isPrismaMissingTableError(err)) throw err;
    console.error("[agenda:expediente] tabela do expediente ainda não existe — migration pendente", err);
    return null;
  }
}

/** O horário que o administrador definiu para o escritório, se definiu. */
export function carregarExpedienteDoEscritorio(tenantId: string): Promise<Expediente | null> {
  return lerComFolga(() => getPrisma().tenantAgendaConfig.findUnique({ where: { tenantId }, select: CAMPOS }));
}

/** Os horários que valem para a pessoa no tenant, e o que a grade usa. */
export async function carregarExpedientes(tenantId: string, userId: string): Promise<ExpedientesDaPessoa> {
  const [escritorio, pessoa] = await Promise.all([
    carregarExpedienteDoEscritorio(tenantId),
    lerComFolga(() =>
      getPrisma().userAgendaConfig.findUnique({ where: { userId_tenantId: { userId, tenantId } }, select: CAMPOS }),
    ),
  ]);
  return { escritorio, pessoa, efetivo: resolverExpediente(escritorio, pessoa) };
}
