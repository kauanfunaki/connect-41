// As horas de operação (29/09, vindas do 41-gestao): tudo o que foi apontado,
// em card e em processo, com o setor e o cliente de cada hora.

import { getPrisma } from "@/lib/prisma";
import { setorDoModulo } from "@/lib/modules";
import { nomeExibicao } from "@/lib/companyName";
import { configDoValora } from "@/lib/valora/servidor";
import { custoDaHora, type Apontamento, type CustoDaHora } from "@/lib/gestao/custo";
import { podeVerSetor } from "@/lib/gestao/regras";

export type LinhaDeHora = Apontamento & {
  id: string;
  dia: Date;
  nota: string | null;
  titulo: string;
  href: string;
};

export type Periodo = { chave: "mes" | "anterior" | "90d"; rotulo: string; de: Date; ate: Date; meses: number };

/** Os três recortes de tempo da tela, no calendário de São Paulo. */
export function periodoDaUrl(valor: string | undefined, agora = new Date()): Periodo {
  const sp = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  const inicioDoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 1, 3));
  const esteMes = inicioDoMes(sp.getUTCFullYear(), sp.getUTCMonth());
  if (valor === "anterior") {
    return { chave: "anterior", rotulo: "Mês passado", de: inicioDoMes(sp.getUTCFullYear(), sp.getUTCMonth() - 1), ate: esteMes, meses: 1 };
  }
  if (valor === "90d") {
    return { chave: "90d", rotulo: "Últimos 90 dias", de: new Date(agora.getTime() - 90 * 24 * 60 * 60 * 1000), ate: agora, meses: 3 };
  }
  return { chave: "mes", rotulo: "Este mês", de: esteMes, ate: agora, meses: 1 };
}

/** Os apontamentos do período, de card e de processo, no recorte de quem vê. */
export async function horasDoPeriodo(tenantId: string, recorte: "todos" | string[], de: Date, ate: Date): Promise<LinhaDeHora[]> {
  const prisma = getPrisma();
  const setorDoSocietario = (await setorDoModulo(tenantId, "societario_processos")) ?? "societario";
  const lista = await prisma.timeEntry.findMany({
    where: { tenantId, loggedOn: { gte: de, lt: ate } },
    orderBy: { loggedOn: "desc" },
    take: 20_000,
    select: {
      id: true,
      userId: true,
      minutes: true,
      note: true,
      loggedOn: true,
      pipelineItem: {
        select: { id: true, title: true, entityType: true, entityId: true, pipelineId: true, pipeline: { select: { sectorCode: true, name: true } } },
      },
      process: {
        select: { id: true, companyId: true, type: { select: { name: true } }, company: { select: { name: true, displayName: true } } },
      },
    },
  });
  const linhas: LinhaDeHora[] = [];
  for (const e of lista) {
    if (e.process) {
      linhas.push({
        id: e.id,
        setor: setorDoSocietario,
        userId: e.userId,
        minutos: e.minutes,
        companyId: e.process.companyId,
        dia: e.loggedOn,
        nota: e.note,
        titulo: `${e.process.type.name} — ${nomeExibicao(e.process.company)}`,
        href: `/processos/${e.process.id}`,
      });
    } else if (e.pipelineItem) {
      const c = e.pipelineItem;
      linhas.push({
        id: e.id,
        setor: c.pipeline.sectorCode,
        userId: e.userId,
        minutos: e.minutes,
        companyId: c.entityType === "COMPANY" ? c.entityId : null,
        dia: e.loggedOn,
        nota: e.note,
        titulo: `${c.title ?? "Card"} — ${c.pipeline.name}`,
        href: `/kanban/${c.pipelineId}/itens/${c.id}`,
      });
    }
  }
  return linhas.filter((l) => podeVerSetor(recorte, l.setor));
}

/** O custo da hora de cada setor, lido uma vez do Valora do tenant. */
export async function custosDoTenant(tenantId: string): Promise<{ custoDe: (setor: string) => CustoDaHora | null; configurado: boolean }> {
  const cfg = await configDoValora(tenantId);
  const cache = new Map<string, CustoDaHora | null>();
  return {
    configurado: cfg.configurado,
    custoDe: (setor) => {
      if (!cache.has(setor)) cache.set(setor, custoDaHora(cfg.catalogo, cfg.parametros, setor));
      return cache.get(setor)!;
    },
  };
}
