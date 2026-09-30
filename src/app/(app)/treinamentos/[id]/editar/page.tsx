import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { TrainingForm } from "@/components/treinamentos/TrainingForm";
import { atualizarTreinamento } from "../../actions";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";

export default async function EditarTreinamentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const training = await prisma.training.findFirst({ where: { id, tenantId: ctx.tenantId } });
  if (!training) notFound();

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Treinamentos", href: "/treinamentos" },
          { label: training.name, href: `/treinamentos/${id}`, truncate: true },
          { label: "Editar" },
        ]}
      />
      <PageHeader title="Editar Treinamento" />

      <Card className="p-6">
        <TrainingForm
          action={atualizarTreinamento}
          cancelHref={`/treinamentos/${id}`}
          defaultValues={{
            id: training.id,
            name: training.name,
            description: training.description ?? undefined,
            workloadHours: training.workloadHours?.toString(),
            validityMonths: training.validityMonths ?? undefined,
          }}
        />
      </Card>
    </PageContainer>
  );
}
