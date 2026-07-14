import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { CandidatoForm } from "@/components/candidatos/CandidatoForm";
import { atualizarCandidato } from "../../actions";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";

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
    <PageContainer variant="narrow">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/candidatos" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Candidatos
        </Link>
        <span className="text-fg-muted">/</span>
        <Link
          href={`/candidatos/${id}`}
          className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]"
        >
          {person.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Editar</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Editar Candidato</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
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
      </div>
    </PageContainer>
  );
}
