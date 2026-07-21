import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { HandoffForm } from "@/components/transferencias/HandoffForm";
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

  // Solicitar handoff é capacidade de SECTOR_ADMIN (e ADMIN/SUPER_ADMIN) — SECTOR_USER
  // e READONLY não podem, mesmo acessando a URL direto (o botão já fica escondido
  // pra eles, mas a página em si também precisa bloquear).
  const canCreate = isFullWrite(ctx.role) || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);
  if (!canCreate) notFound();

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
        ? await prisma.company.findFirst({ where: { id: entityId, ...scope }, select: { id: true, name: true, cnpj: true } })
        : await prisma.person.findFirst({ where: { id: entityId, ...scope }, select: { id: true, name: true } });

    if (!entity) notFound();

    const backHref = entityType === "COMPANY" ? `/empresas/${entityId}` : `/pessoas/${entityId}`;
    const entityCnpj: string | null = "cnpj" in entity ? (entity.cnpj as string | null) : null;

    return (
      <FormShell backHref={backHref} backLabel={entity.name}>
        <HandoffForm
          action={criarHandoff}
          fromSectorOptions={fromSectorOptions}
          toSectorOptions={allSectorOptions}
          cancelHref={backHref}
          fixedEntity={{ entityType: entityType as EntityType, entityId: entity.id, entityName: entity.name, entityCnpj }}
        />
      </FormShell>
    );
  }

  // Modo 2: acesso direto por /transferencias — escolhe a entidade no próprio formulário
  const [companies, people] = await Promise.all([
    prisma.company.findMany({
      where: await scopedCompanyWhere(ctx),
      orderBy: { name: "asc" },
      select: { id: true, name: true, cnpj: true },
    }),
    prisma.person.findMany({
      where: await scopedPersonWhere(ctx),
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <FormShell backHref="/transferencias" backLabel="Transferências">
      <HandoffForm
        action={criarHandoff}
        fromSectorOptions={fromSectorOptions}
        toSectorOptions={allSectorOptions}
        cancelHref="/transferencias"
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
    <PageContainer variant="narrow">
      <div className="flex items-center gap-2 mb-6">
        <Link href={backHref} className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          {backLabel}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Solicitar Transferência</span>
      </div>

      <h1 className="text-[length:var(--fs-display)] font-display font-semibold text-fg tracking-[-0.01em] mb-6">
        Solicitar Transferência
      </h1>

      <Card className="p-6">{children}</Card>
    </PageContainer>
  );
}
