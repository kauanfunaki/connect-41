import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { CargoForm } from "@/components/empresas/CargoForm";
import { atualizarCargo } from "../../actions";

export default async function EditarCargoPage({
  params,
}: {
  params: Promise<{ id: string; cargoId: string }>;
}) {
  const { id: companyId, cargoId } = await params;
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!company) notFound();

  const cargo = await prisma.cargo.findFirst({ where: { id: cargoId, tenantId: ctx.tenantId, companyId } });
  if (!cargo) notFound();

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/empresas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Empresas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/empresas/${companyId}/cargos`} className="text-[13px] text-fg-muted hover:text-fg transition-colors">Cargos</Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Editar</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Editar Cargo — {company.name}</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <CargoForm
          action={atualizarCargo}
          companyId={companyId}
          cancelHref={`/empresas/${companyId}/cargos`}
          defaultValues={{
            id: cargo.id,
            name: cargo.name,
            area: cargo.area ?? undefined,
            description: cargo.description ?? undefined,
            technicalRequirements: cargo.technicalRequirements ?? undefined,
            behavioralRequirements: cargo.behavioralRequirements ?? undefined,
            salaryRangeMin: cargo.salaryRangeMin?.toString(),
            salaryRangeMid: cargo.salaryRangeMid?.toString(),
            salaryRangeMax: cargo.salaryRangeMax?.toString(),
          }}
        />
      </div>
    </div>
  );
}
