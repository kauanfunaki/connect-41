import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getSectorMaps } from "@/lib/sectors";
import { VagaForm } from "@/components/vagas/VagaForm";
import { criarVaga } from "../actions";

export default async function NovaVagaPage() {
  const ctx = await getAuthContext();
  const canCreateAny = isFullWrite(ctx.role) || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);
  if (!canCreateAny) notFound();

  const prisma = getPrisma();
  const { options: sectorOptions } = await getSectorMaps(ctx.tenantId);
  const allowedSectors = isFullWrite(ctx.role) ? sectorOptions : sectorOptions.filter((s) => ctx.sectors.includes(s.value));

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
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/vagas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Vagas</Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Nova</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Nova Vaga</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <VagaForm
          action={criarVaga}
          cancelHref="/vagas"
          companies={companies}
          cargos={cargos}
          users={users}
          sectorOptions={allowedSectors}
        />
      </div>
    </div>
  );
}
