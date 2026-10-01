import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { AssuntoForm } from "@/components/admin/AssuntoForm";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getActiveSectors } from "@/lib/sectors";
import { atualizarAssunto } from "../../actions";

export default async function EditarAssuntoPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) notFound();
  const { id } = await params;
  const [assunto, ativos] = await Promise.all([
    getPrisma().serviceRequestSubject.findFirst({ where: { id, tenantId: ctx.tenantId } }),
    getActiveSectors(ctx.tenantId),
  ]);
  if (!assunto) notFound();

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Assuntos das solicitações", href: "/admin/assuntos" }, { label: assunto.label }]} />
      <PageHeader title="Editar assunto" />
      <div className="max-w-[720px]">
        <Card className="p-6">
          <AssuntoForm
            action={atualizarAssunto}
            cancelHref="/admin/assuntos"
            setores={ativos.map((s) => ({ value: s.code, label: s.label }))}
            valores={{
              id: assunto.id,
              label: assunto.label,
              description: assunto.description,
              sectorCode: assunto.sectorCode,
              responseDays: assunto.responseDays,
            }}
          />
        </Card>
      </div>
    </PageContainer>
  );
}
