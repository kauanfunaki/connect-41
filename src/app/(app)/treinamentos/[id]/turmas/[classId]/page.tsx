import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { adicionarParticipante, atualizarParticipante, removerParticipante } from "./actions";
import { AddParticipanteForm } from "@/components/treinamentos/AddParticipanteForm";
import { ParticipanteRow } from "@/components/treinamentos/ParticipanteRow";

export default async function TurmaPage({
  params,
}: {
  params: Promise<{ id: string; classId: string }>;
}) {
  const { id: trainingId, classId } = await params;
  const ctx = await getAuthContext();
  const canManage = canWrite(ctx.role);

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
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/treinamentos" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Treinamentos</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/treinamentos/${trainingId}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]">
          {trainingClass.training.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">{trainingClass.date.toLocaleDateString("pt-BR")}</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-1">
        {trainingClass.training.name} — {trainingClass.date.toLocaleDateString("pt-BR")}
      </h1>
      <p className="text-[13px] text-fg-muted mb-6">
        {[trainingClass.shift, trainingClass.instructor].filter(Boolean).join(" · ") || "Sem turno/instrutor definidos"}
      </p>

      <div className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-[14px] font-semibold text-fg mb-3">
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
      </div>
    </div>
  );
}
