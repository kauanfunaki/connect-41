import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { PessoaBreadcrumb } from "@/components/pessoas/PessoaBreadcrumb";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { getAuthContext } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { TrainingParticipantStatus } from "@/generated/prisma/enums";
import { formatCalendarDate } from "@/lib/format";

const TRAINING_STATUS_LABEL: Record<TrainingParticipantStatus, string> = {
  PLANEJADO: "Planejado",
  CONVOCADO: "Convocado",
  REALIZADO: "Realizado",
  AUSENTE:   "Ausente",
  REPROVADO: "Reprovado",
  CONCLUIDO: "Concluído",
  VENCIDO:   "Vencido",
};

export default async function TreinamentosPessoaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const person = await prisma.person.findFirst({
    where: { id, type: "COLABORADOR", ...(await scopedPersonWhere(ctx)) },
    select: { id: true, name: true, isInternal: true },
  });
  if (!person) notFound();

  const trainingParticipations = await prisma.trainingParticipant.findMany({
    where: { tenantId: ctx.tenantId, personId: id },
    orderBy: { createdAt: "desc" },
    include: { class: { select: { id: true, date: true, training: { select: { id: true, name: true } } } } },
  });

  return (
    <PageContainer>
      <PessoaBreadcrumb
        isInternal={person.isInternal}
        personId={id}
        personName={person.name}
        atual="Treinamentos"
      />
      <BackButton className="mb-3" />
      <PageHeader title="Treinamentos" />

      <div className="bg-surface border border-border rounded-lg p-5">
        {trainingParticipations.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Nenhum treinamento registrado ainda.</p>
        ) : (
          <div className="divide-y divide-border">
            {trainingParticipations.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5">
                <Link
                  href={`/treinamentos/${p.class.training.id}/turmas/${p.class.id}`}
                  className="text-[13px] text-brand hover:underline"
                >
                  {p.class.training.name} — {formatCalendarDate(p.class.date)}
                </Link>
                <span className="text-[12px] text-fg-muted">{TRAINING_STATUS_LABEL[p.status]}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
