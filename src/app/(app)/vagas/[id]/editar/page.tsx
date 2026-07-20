import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { scopedVagaWhere } from "@/lib/auth/scope";
import { getSectorMaps } from "@/lib/sectors";
import { VagaForm } from "@/components/vagas/VagaForm";
import { atualizarVaga } from "../../actions";
import { PageContainer } from "@/components/shared/PageContainer";

export default async function EditarVagaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const vaga = await prisma.vaga.findFirst({ where: { id, ...scopedVagaWhere(ctx) } });
  if (!vaga) notFound();
  if (!canManageSector(ctx, vaga.sectorCode)) notFound();

  const { options: sectorOptions } = await getSectorMaps(ctx.tenantId);

  const [companies, cargos, users] = await Promise.all([
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.cargo.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, companyId: true },
    }),
    prisma.user.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <PageContainer variant="narrow">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/vagas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Vagas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/vagas/${id}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]">{vaga.title}</Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Editar</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Editar Vaga</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <VagaForm
          action={atualizarVaga}
          cancelHref={`/vagas/${id}`}
          companies={companies}
          cargos={cargos}
          users={users}
          sectorOptions={sectorOptions}
          defaultValues={{
            id: vaga.id,
            title: vaga.title,
            companyId: vaga.companyId,
            sectorCode: vaga.sectorCode,
            cargoId: vaga.cargoId ?? undefined,
            quantity: vaga.quantity,
            responsibleUserId: vaga.responsibleUserId ?? undefined,
            priority: vaga.priority,
            notes: vaga.notes ?? undefined,
            isPublic: vaga.isPublic,
            publicDescription: vaga.publicDescription ?? undefined,
          }}
        />
      </div>
    </PageContainer>
  );
}
