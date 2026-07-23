import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { getAuthContext, canWrite } from "@/lib/auth/context";
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
  const ctx = await getAuthContext();
  const canEdit = canWrite(ctx.role);

  const prisma = getPrisma();
  const person = await prisma.person.findFirst({
    where: { id, type: "COLABORADOR", ...(await scopedPersonWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!person) notFound();

  const exames = await prisma.exameAdmissional.findMany({
    where: { tenantId: ctx.tenantId, personId: id },
    orderBy: { createdAt: "desc" },
  });

  const criarExameAction = criarExame.bind(null, id);

  return (
    <PageContainer>
      <div className="flex items-center gap-2 mb-6">
        <Link href="/pessoas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Cadastros</Link>
        <span className="text-fg-muted">/</span>
        <Link href="/pessoas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Pessoas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/pessoas/${id}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]">
          {person.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Exames Admissionais</span>
      </div>
      <BackButton className="mb-3" />

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Exames Admissionais</h1>

      <div className="bg-surface border border-border rounded-lg p-5">
        {exames.length === 0 ? (
          <p className="text-[13px] text-fg-muted mb-3">Nenhum exame registrado ainda.</p>
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
      </div>
    </PageContainer>
  );
}
