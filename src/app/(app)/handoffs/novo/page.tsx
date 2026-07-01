import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { HandoffForm } from "@/components/handoffs/HandoffForm";
import { criarHandoff } from "../actions";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { scopedCompanyWhere, scopedPersonWhere } from "@/lib/auth/scope";
import { getSectorMaps } from "@/lib/sectors";
import type { EntityType } from "@/generated/prisma/enums";

export default async function NovoHandoffPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; entityId?: string }>;
}) {
  const { entityType: entityTypeRaw, entityId } = await searchParams;
  const ctx = await getAuthContext();

  const { options: allSectorOptions } = await getSectorMaps(ctx.tenantId);
  const fromSectorOptions = isFullWrite(ctx.role)
    ? allSectorOptions
    : allSectorOptions.filter((s) => ctx.sectors.includes(s.value));

  if (fromSectorOptions.length === 0) notFound();

  const prisma = getPrisma();

  // Modo 1: entidade pré-selecionada (veio do botão "Solicitar Handoff" na ficha)
  if (entityId) {
    const entityType = entityTypeRaw === "PERSON" ? "PERSON" : "COMPANY";
    const scope = entityType === "COMPANY" ? await scopedCompanyWhere(ctx) : await scopedPersonWhere(ctx);
    const entity =
      entityType === "COMPANY"
        ? await prisma.company.findFirst({ where: { id: entityId, ...scope }, select: { id: true, name: true } })
        : await prisma.person.findFirst({ where: { id: entityId, ...scope }, select: { id: true, name: true } });

    if (!entity) notFound();

    const backHref = entityType === "COMPANY" ? `/empresas/${entityId}` : `/pessoas/${entityId}`;

    return (
      <FormShell backHref={backHref} backLabel={entity.name}>
        <HandoffForm
          action={criarHandoff}
          fromSectorOptions={fromSectorOptions}
          toSectorOptions={allSectorOptions}
          cancelHref={backHref}
          fixedEntity={{ entityType: entityType as EntityType, entityId: entity.id, entityName: entity.name }}
        />
      </FormShell>
    );
  }

  // Modo 2: acesso direto por /handoffs — escolhe a entidade no próprio formulário
  const [companies, people] = await Promise.all([
    prisma.company.findMany({
      where: await scopedCompanyWhere(ctx),
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.person.findMany({
      where: await scopedPersonWhere(ctx),
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <FormShell backHref="/handoffs" backLabel="Handoffs">
      <HandoffForm
        action={criarHandoff}
        fromSectorOptions={fromSectorOptions}
        toSectorOptions={allSectorOptions}
        cancelHref="/handoffs"
        companies={companies}
        people={people}
      />
    </FormShell>
  );
}

function FormShell({
  backHref,
  backLabel,
  children,
}: {
  backHref: string;
  backLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href={backHref} className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          {backLabel}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Solicitar Handoff</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">
        Solicitar Handoff
      </h1>

      <div className="bg-surface border border-border rounded-lg p-6">{children}</div>
    </div>
  );
}
