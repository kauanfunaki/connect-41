import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { canManageSector } from "@/lib/auth/context";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { adicionarParticipante, atualizarParticipante, removerParticipante } from "./actions";
import { AddParticipanteForm } from "@/components/treinamentos/AddParticipanteForm";
import { ParticipanteRow } from "@/components/treinamentos/ParticipanteRow";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { formatCalendarDate } from "@/lib/format";

export default async function TurmaPage({
  params,
}: {
  params: Promise<{ id: string; classId: string }>;
}) {
  const { id: trainingId, classId } = await params;
  const { ctx, setor } = await abrirTelaDoModulo("dp_treinamentos");
  const canManage = canManageSector(ctx, setor);

  const prisma = getPrisma();
  const trainingClass = await prisma.trainingClass.findFirst({
    where: { id: classId, tenantId: ctx.tenantId, trainingId },
    include: {
      training: { select: { name: true } },
      participants: { orderBy: { createdAt: "asc" }, include: { person: { select: { id: true, name: true } } } },
    },
  });
  if (!trainingClass) notFound();

  const linkedPersonIds = new Set(trainingClass.participants.map((p) => p.personId));
  const candidatos = await prisma.person.findMany({
    where: { tenantId: ctx.tenantId, type: "COLABORADOR", active: true, id: { notIn: [...linkedPersonIds] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const addParticipanteAction = adicionarParticipante.bind(null, trainingId, classId);

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Treinamentos", href: "/treinamentos" },
          { label: trainingClass.training.name, href: `/treinamentos/${trainingId}`, truncate: true },
          { label: formatCalendarDate(trainingClass.date) },
        ]}
      />
      <PageHeader
        title={<>{trainingClass.training.name} — {formatCalendarDate(trainingClass.date)}</>}
        subtitle={[trainingClass.shift, trainingClass.instructor].filter(Boolean).join(" · ") || "Sem turno/instrutor definidos"}
      />

      <Card className="p-5">
        <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg mb-3">
          Participantes {trainingClass.participants.length > 0 && `(${trainingClass.participants.length})`}
        </h2>

        {trainingClass.participants.length === 0 ? (
          <p className="text-[13px] text-fg-muted mb-3">Nenhum participante ainda.</p>
        ) : (
          <div className="mb-3">
            {trainingClass.participants.map((p) => (
              <ParticipanteRow
                key={p.id}
                participante={{ id: p.id, personId: p.person.id, personName: p.person.name, status: p.status }}
                updateAction={atualizarParticipante.bind(null, trainingId, classId, p.id)}
                removeAction={removerParticipante.bind(null, trainingId, classId, p.id)}
                canManage={canManage}
              />
            ))}
          </div>
        )}

        {canManage && <AddParticipanteForm action={addParticipanteAction} candidatos={candidatos} />}
      </Card>
    </PageContainer>
  );
}
