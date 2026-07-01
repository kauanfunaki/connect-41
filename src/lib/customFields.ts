import { getPrisma } from "@/lib/prisma";
import { isFullAccess, type AuthContext } from "@/lib/auth/context";
import type { EntityType, CustomFieldType } from "@/generated/prisma/enums";

export type CustomFieldWithValue = {
  id: string;
  key: string;
  label: string;
  fieldType: CustomFieldType;
  options: string[];
  required: boolean;
  sectorCode: string;
  value: string | null;
};

// Setores aos quais uma Empresa está de fato vinculada (via serviços contratados).
export async function getCompanySectors(tenantId: string, companyId: string): Promise<string[]> {
  const prisma = getPrisma();
  const services = await prisma.companyService.findMany({
    where: { tenantId, companyId },
    select: { sectorCode: true },
  });
  return [...new Set(services.map((s) => s.sectorCode))];
}

// Setores aos quais uma Pessoa está de fato vinculada (via pipelines em que aparece).
export async function getPersonSectors(tenantId: string, personId: string): Promise<string[]> {
  const prisma = getPrisma();
  const items = await prisma.pipelineItem.findMany({
    where: { tenantId, entityType: "PERSON", entityId: personId },
    select: { pipeline: { select: { sectorCode: true } } },
  });
  return [...new Set(items.map((i) => i.pipeline.sectorCode))];
}

// Campos customizados aplicáveis a uma entidade específica: definidos para um setor
// ao qual ela está vinculada E visível para quem está olhando (escopo de setor do usuário).
export async function getApplicableCustomFields(
  ctx: AuthContext,
  entityType: EntityType,
  entityId: string,
  entitySectors: string[]
): Promise<CustomFieldWithValue[]> {
  const visibleSectors = isFullAccess(ctx.role)
    ? entitySectors
    : entitySectors.filter((s) => ctx.sectors.includes(s));

  if (visibleSectors.length === 0) return [];

  const prisma = getPrisma();
  const fields = await prisma.customField.findMany({
    where: { tenantId: ctx.tenantId, entityType, sectorCode: { in: visibleSectors } },
    orderBy: [{ sectorCode: "asc" }, { order: "asc" }],
  });

  if (fields.length === 0) return [];

  const values = await prisma.customValue.findMany({
    where: { tenantId: ctx.tenantId, entityId, customFieldId: { in: fields.map((f) => f.id) } },
  });
  const valueByFieldId: Record<string, string | null> = {};
  values.forEach((v) => (valueByFieldId[v.customFieldId] = v.value));

  return fields.map((f) => ({
    id: f.id,
    key: f.key,
    label: f.label,
    fieldType: f.fieldType,
    options: Array.isArray(f.options) ? (f.options as string[]) : [],
    required: f.required,
    sectorCode: f.sectorCode,
    value: valueByFieldId[f.id] ?? null,
  }));
}

// Salva os valores submetidos (form fields nomeados `custom_<fieldId>`) para os
// campos que de fato se aplicam à entidade — ignora qualquer id fora dessa lista
// (evita que alguém grave valor num campo de um setor que a entidade não pertence).
export async function saveCustomFieldValues(
  tenantId: string,
  entityId: string,
  applicableFields: CustomFieldWithValue[],
  form: FormData
): Promise<void> {
  if (applicableFields.length === 0) return;

  const prisma = getPrisma();
  await prisma.$transaction(
    applicableFields.map((f) => {
      const raw = (form.get(`custom_${f.id}`) as string) ?? "";
      const value = raw.trim() || null;
      return prisma.customValue.upsert({
        where: { customFieldId_entityId: { customFieldId: f.id, entityId } },
        create: { tenantId, customFieldId: f.id, entityId, value },
        update: { value },
      });
    })
  );
}
