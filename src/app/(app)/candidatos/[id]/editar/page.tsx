import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { CandidatoForm } from "@/components/candidatos/CandidatoForm";
import { atualizarCandidato } from "../../actions";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";

function toDateInput(d: Date | null): string | undefined {
  return d ? d.toISOString().slice(0, 10) : undefined;
}

export default async function EditarCandidatoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const person = await prisma.person.findFirst({
    where: { id, tenantId: ctx.tenantId, type: "CANDIDATO" },
  });

  if (!person) notFound();

  return (
    <PageContainer>
      <Breadcrumb
        items={[{ label: "Candidatos", href: "/candidatos" }, { label: person.name, href: `/candidatos/${id}`, truncate: true }, { label: "Editar" }]}
      />
      <PageHeader title="Editar Candidato" />

      <Card className="p-6">
        <CandidatoForm
          action={atualizarCandidato}
          cancelHref={`/candidatos/${id}`}
          defaultValues={{
            id,
            name:      person.name,
            cpf:       person.cpf ?? undefined,
            email:     person.email ?? undefined,
            phone:     person.phone ?? undefined,
            birthDate: toDateInput(person.birthDate),
            rg:        person.rg ?? undefined,
            education: person.education ?? undefined,

            zipCode:           person.zipCode ?? undefined,
            addressStreet:     person.addressStreet ?? undefined,
            addressNumber:     person.addressNumber ?? undefined,
            addressComplement: person.addressComplement ?? undefined,
            neighborhood:      person.neighborhood ?? undefined,
            city:              person.city ?? undefined,
            stateCode:         person.stateCode ?? undefined,
          }}
        />
      </Card>
    </PageContainer>
  );
}
