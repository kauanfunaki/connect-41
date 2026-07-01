import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { HandoffForm } from "@/components/handoffs/HandoffForm";
import { criarHandoff } from "../actions";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { scopedCompanyWhere, scopedPersonWhere } from "@/lib/auth/scope";
import { SECTOR_OPTIONS } from "@/lib/sectors";
import type { EntityType } from "@/generated/prisma/enums";

export default async function NovoHandoffPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; entityId?: string }>;
}) {
  const { entityType: entityTypeRaw, entityId } = await searchParams;
  const ctx = await getAuthContext();

  const entityType = entityTypeRaw === "PERSON" ? "PERSON" : "COMPANY";
  if (!entityId) notFound();

  const prisma = getPrisma();
  const scope = entityType === "COMPANY" ? await scopedCompanyWhere(ctx) : await scopedPersonWhere(ctx);
  const entity =
    entityType === "COMPANY"
      ? await prisma.company.findFirst({ where: { id: entityId, ...scope }, select: { id: true, name: true } })
      : await prisma.person.findFirst({ where: { id: entityId, ...scope }, select: { id: true, name: true } });

  if (!entity) notFound();

  const fromSectorOptions = isFullWrite(ctx.role)
    ? SECTOR_OPTIONS
    : SECTOR_OPTIONS.filter((s) => ctx.sectors.includes(s.value));

  if (fromSectorOptions.length === 0) notFound();

  const backHref = entityType === "COMPANY" ? `/empresas/${entityId}` : `/pessoas/${entityId}`;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href={backHref} className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          {entity.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Solicitar Handoff</span>
      </div>

      <h1 className="text-[20px] font-semibold text-fg tracking-[-0.01em] mb-6">
        Solicitar Handoff
      </h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <HandoffForm
          action={criarHandoff}
          entityType={entityType as EntityType}
          entityId={entity.id}
          entityName={entity.name}
          fromSectorOptions={fromSectorOptions}
          cancelHref={backHref}
        />
      </div>
    </div>
  );
}
