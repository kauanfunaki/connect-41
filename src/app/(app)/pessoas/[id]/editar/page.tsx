import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PersonType } from "@/generated/prisma/enums";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { PessoaForm } from "@/components/pessoas/PessoaForm";
import { atualizarPessoa } from "../../actions";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";
import { getPersonSectors, getApplicableCustomFields } from "@/lib/customFields";

function toDateInput(d: Date | null): string | undefined {
  return d ? d.toISOString().slice(0, 10) : undefined;
}

export default async function EditarPessoaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const [person, companies, cargos, departments, canEditSensitive] = await Promise.all([
    prisma.person.findFirst({ where: { id, type: PersonType.COLABORADOR, ...(await scopedPersonWhere(ctx)) } }),
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
    prisma.department.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, companyId: true },
    }),
    canViewSensitiveField(ctx, "DADOS_BANCARIOS"),
  ]);

  if (!person) notFound();

  const personSectors = await getPersonSectors(ctx.tenantId, id);
  const customFields = await getApplicableCustomFields(ctx, "PERSON", id, personSectors);

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <div className="flex items-center gap-2 mb-6">
        <Link href="/pessoas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Pessoas
        </Link>
        <span className="text-fg-muted">/</span>
        <Link
          href={`/pessoas/${id}`}
          className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]"
        >
          {person.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Editar</span>
      </div>

      <h1 className="text-[length:var(--fs-display)] font-semibold text-fg tracking-[-0.01em] mb-6">Editar Pessoa</h1>

        <PessoaForm
          action={atualizarPessoa}
          cancelHref={`/pessoas/${id}`}
          companies={companies}
          cargos={cargos}
          departments={departments}
          canEditSensitive={canEditSensitive}
          customFields={customFields}
          defaultValues={{
            id,
            name:             person.name,
            cpf:              person.cpf             ?? undefined,
            email:            person.email           ?? undefined,
            phone:            person.phone           ?? undefined,
            birthDate:        toDateInput(person.birthDate),
            currentCompanyId: person.currentCompanyId ?? undefined,

            rg:               person.rg        ?? undefined,
            pis:              person.pis       ?? undefined,
            ctps:             person.ctps      ?? undefined,
            ctpsSerie:        person.ctpsSerie ?? undefined,
            education:        person.education ?? undefined,
            notes:            person.notes ?? undefined,
            admissionDate:    toDateInput(person.admissionDate),
            dismissalDate:    toDateInput(person.dismissalDate),
            employmentStatus: person.employmentStatus,
            cargoId:          person.cargoId      ?? undefined,
            departmentId:     person.departmentId ?? undefined,
            monthlyWorkHours: person.monthlyWorkHours?.toString(),
            weeklyWorkHours:  person.weeklyWorkHours?.toString(),
            workShift:        person.workShift ?? undefined,

            zipCode:           person.zipCode           ?? undefined,
            addressStreet:     person.addressStreet     ?? undefined,
            addressNumber:     person.addressNumber     ?? undefined,
            addressComplement: person.addressComplement ?? undefined,
            neighborhood:      person.neighborhood      ?? undefined,
            city:              person.city              ?? undefined,
            stateCode:         person.stateCode         ?? undefined,

            ...(canEditSensitive
              ? {
                  bankName:        person.bankName        ?? undefined,
                  bankAgency:      person.bankAgency       ?? undefined,
                  bankAccount:     person.bankAccount      ?? undefined,
                  bankAccountType: person.bankAccountType  ?? undefined,
                  currentSalary:   person.currentSalary?.toString(),
                }
              : {}),
          }}
        />
    </PageContainer>
  );
}
