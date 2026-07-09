import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { getAuthContext } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { TrainingParticipantStatus } from "@/generated/prisma/enums";

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
    select: { id: true, name: true },
  });
  if (!person) notFound();

  const trainingParticipations = await prisma.trainingParticipant.findMany({
    where: { tenantId: ctx.tenantId, personId: id },
    orderBy: { createdAt: "desc" },
    include: { class: { select: { id: true, date: true, training: { select: { id: true, name: true } } } } },
  });

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <div className="flex items-center gap-2 mb-6">
        <Link href="/pessoas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Pessoas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/pessoas/${id}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]">
          {person.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Treinamentos</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Treinamentos</h1>

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
                  {p.class.training.name} — {p.class.date.toLocaleDateString("pt-BR")}
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
