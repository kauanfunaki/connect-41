import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import type { EntityType } from "@/generated/prisma/enums";

/** Valor preenchido de verdade: nem nulo, nem vazio. */
const PREENCHIDO = { AND: [{ value: { not: null } }, { value: { not: "" } }] };

export type DadosDoConstrutor = {
  /** Em quantas fichas cada campo (pelo id) está preenchido. */
  preenchidos: Record<string, number>;
  /** Quantas fichas deste tipo estão ligadas ao setor: o "de N". */
  ligadas: number;
  /** A ficha da prévia, com os valores dela; sem ficha ligada, nenhuma. */
  exemplo: { nome: string; valores: Record<string, string | null> } | null;
};

/**
 * O que o construtor dos campos mostra além dos campos (5A, 20/10/2026): o
 * preenchimento de cada um e a ficha de verdade da prévia.
 *
 * As fichas ligadas ao setor são as mesmas de `getApplicableCustomFields`:
 * empresa pelos serviços contratados, pessoa pelos quadros em que aparece. A
 * prévia usa a que mais preencheu estes campos; sem nenhuma, a primeira
 * ligada, com os campos vazios.
 */
export async function dadosDoConstrutor(
  tenantId: string,
  sectorCode: string,
  entityType: EntityType,
  campoIds: string[]
): Promise<DadosDoConstrutor> {
  const prisma = getPrisma();
  const [preenchimentos, ligadas, maisPreenchida] = await Promise.all([
    campoIds.length
      ? prisma.customValue.groupBy({
          by: ["customFieldId"],
          where: { tenantId, customFieldId: { in: campoIds }, ...PREENCHIDO },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    entityType === "COMPANY"
      ? prisma.companyService
          .findMany({ where: { tenantId, sectorCode }, select: { companyId: true }, distinct: ["companyId"] })
          .then((r) => r.map((x) => x.companyId))
      : prisma.pipelineItem
          .findMany({
            where: { tenantId, entityType: "PERSON", pipeline: { sectorCode } },
            select: { entityId: true },
            distinct: ["entityId"],
          })
          .then((r) => r.map((x) => x.entityId)),
    campoIds.length
      ? prisma.customValue.groupBy({
          by: ["entityId"],
          where: { tenantId, customFieldId: { in: campoIds }, ...PREENCHIDO },
          _count: { entityId: true },
          orderBy: [{ _count: { entityId: "desc" } }, { entityId: "asc" }],
          take: 1,
        })
      : Promise.resolve([]),
  ]);

  const preenchidos = Object.fromEntries(preenchimentos.map((p) => [p.customFieldId, p._count._all]));
  const exemploId = maisPreenchida[0]?.entityId ?? ligadas[0] ?? null;
  if (!exemploId || campoIds.length === 0) return { preenchidos, ligadas: ligadas.length, exemplo: null };

  const [nome, valores] = await Promise.all([
    entityType === "COMPANY"
      ? prisma.company
          .findFirst({ where: { id: exemploId, tenantId }, select: { name: true, displayName: true } })
          .then((e) => (e ? nomeExibicao(e) : null))
      : prisma.person.findFirst({ where: { id: exemploId, tenantId }, select: { name: true } }).then((p) => p?.name ?? null),
    prisma.customValue.findMany({
      where: { tenantId, entityId: exemploId, customFieldId: { in: campoIds } },
      select: { customFieldId: true, value: true },
    }),
  ]);
  return {
    preenchidos,
    ligadas: ligadas.length,
    exemplo: nome ? { nome, valores: Object.fromEntries(valores.map((v) => [v.customFieldId, v.value])) } : null,
  };
}
