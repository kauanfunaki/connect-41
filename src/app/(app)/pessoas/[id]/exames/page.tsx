import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { PessoaBreadcrumb } from "@/components/pessoas/PessoaBreadcrumb";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { canManageSector } from "@/lib/auth/context";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { AddExameForm } from "@/components/pessoas/AddExameForm";
import { ExameRow } from "@/components/pessoas/ExameRow";
import { formatCalendarDate } from "@/lib/format";
import { criarExame, atualizarExame, excluirExame } from "./actions";

export default async function ExamesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx, setor } = await abrirTelaDoModulo("dp_colaboradores");
  const canEdit = canManageSector(ctx, setor);

  const prisma = getPrisma();
  const person = await prisma.person.findFirst({
    where: { id, type: "COLABORADOR", ...(await scopedPersonWhere(ctx)) },
    select: { id: true, name: true, isInternal: true },
  });
  if (!person) notFound();

  const exames = await prisma.exameAdmissional.findMany({
    where: { tenantId: ctx.tenantId, personId: id },
    orderBy: { createdAt: "desc" },
  });

  const criarExameAction = criarExame.bind(null, id);

  return (
    <PageContainer>
      <PessoaBreadcrumb
        isInternal={person.isInternal}
        personId={id}
        personName={person.name}
        atual="Exames admissionais"
      />
      <BackButton className="mb-3" />
      <PageHeader title="Exames admissionais" />

      <Card className="p-5">
        {exames.length === 0 ? (
          <p className="text-fs-3 text-fg-muted mb-3">Nenhum exame registrado ainda.</p>
        ) : (
          <div>
            {exames.map((e) => (
              <ExameRow
                key={e.id}
                exame={{
                  id: e.id,
                  status: e.status,
                  clinicName: e.clinicName,
                  scheduledAtLabel: e.scheduledAt ? formatCalendarDate(e.scheduledAt) : null,
                  performedAtLabel: e.performedAt ? formatCalendarDate(e.performedAt) : null,
                  asoDueDateLabel: e.asoDueDate ? formatCalendarDate(e.asoDueDate) : null,
                  notes: e.notes,
                }}
                updateAction={atualizarExame.bind(null, id, e.id)}
                removeAction={excluirExame.bind(null, id, e.id)}
                canManage={canEdit}
              />
            ))}
          </div>
        )}

        {canEdit && <AddExameForm action={criarExameAction} />}
      </Card>
    </PageContainer>
  );
}
