import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PessoaForm } from "@/components/pessoas/PessoaForm";
import { atualizarPessoa } from "../../actions";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { getPersonSectors, getApplicableCustomFields } from "@/lib/customFields";

export default async function EditarPessoaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const [person, companies] = await Promise.all([
    prisma.person.findFirst({ where: { id, ...(await scopedPersonWhere(ctx)) } }),
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!person) notFound();

  const personSectors = await getPersonSectors(ctx.tenantId, id);
  const customFields = await getApplicableCustomFields(ctx, "PERSON", id, personSectors);

  return (
    <div className="p-6 max-w-6xl mx-auto">
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

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Editar Pessoa</h1>

      <div className="bg-surface border border-border rounded-lg p-6">
        <PessoaForm
          action={atualizarPessoa}
          cancelHref={`/pessoas/${id}`}
          companies={companies}
          customFields={customFields}
          defaultValues={{
            id,
            name:             person.name,
            cpf:              person.cpf             ?? undefined,
            email:            person.email           ?? undefined,
            phone:            person.phone           ?? undefined,
            birthDate:        person.birthDate
                                ? person.birthDate.toISOString().slice(0, 10)
                                : undefined,
            type:             person.type,
            currentCompanyId: person.currentCompanyId ?? undefined,
          }}
        />
      </div>
    </div>
  );
}
