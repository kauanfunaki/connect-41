import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { getSectorMaps } from "@/lib/sectors";
import { VagaForm } from "@/components/vagas/VagaForm";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { criarVaga } from "../actions";

export default async function NovaVagaPage() {
  const ctx = await getAuthContext();
  // Vaga e teste são do setor que contrata (o escopo já filtra); aqui só o
  // módulo ligado, que antes não era checado e deixava a tela abrir desligada.
  if (!(await isModuleEnabled(ctx.tenantId, "recrutamento_vagas"))) notFound();
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
    <PageContainer>
      <Breadcrumb items={[{ label: "Vagas", href: "/vagas" }, { label: "Nova" }]} />
      <PageHeader title="Nova vaga" />

      <Card className="p-6">
        <VagaForm
          action={criarVaga}
          cancelHref="/vagas"
          companies={companies}
          cargos={cargos}
          users={users}
          sectorOptions={allowedSectors}
        />
      </Card>
    </PageContainer>
  );
}
