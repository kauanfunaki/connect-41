import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { AddEscalaForm } from "@/components/pessoas/AddEscalaForm";
import { EscalaRow } from "@/components/pessoas/EscalaRow";
import { criarEscala, atualizarEscala, excluirEscala } from "./actions";

export default async function EscalaPage({
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
    select: { id: true, name: true, currentCompanyId: true },
  });
  if (!person) notFound();

  const [escala, turnosDisponiveis] = await Promise.all([
    prisma.scheduleEntry.findMany({
      where: { tenantId: ctx.tenantId, personId: id },
      orderBy: { date: "desc" },
      include: { shift: { select: { name: true } } },
    }),
    person.currentCompanyId
      ? prisma.workShift.findMany({
          where: { tenantId: ctx.tenantId, companyId: person.currentCompanyId, active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const criarEscalaAction = criarEscala.bind(null, id);

  return (
    <PageContainer>
      <div className="flex items-center gap-2 mb-6">
        <Link href="/pessoas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Pessoas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/pessoas/${id}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]">
          {person.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Escala de Trabalho</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Escala de Trabalho</h1>

      <div className="bg-surface border border-border rounded-lg p-5">
        {escala.length === 0 ? (
          <p className="text-[13px] text-fg-muted mb-3">Nenhuma escala montada ainda.</p>
        ) : (
          <div>
            {escala.map((e) => (
              <EscalaRow
                key={e.id}
                escala={{
                  id: e.id,
                  dateLabel: e.date.toLocaleDateString("pt-BR"),
                  shiftName: e.shift?.name ?? null,
                  dayOff: e.dayOff,
                  isHoliday: e.isHoliday,
                  status: e.status,
                }}
                updateAction={atualizarEscala.bind(null, id, e.id)}
                removeAction={excluirEscala.bind(null, id, e.id)}
                canManage={canEdit}
              />
            ))}
          </div>
        )}

        {canEdit && <AddEscalaForm action={criarEscalaAction} shifts={turnosDisponiveis} />}
      </div>
    </PageContainer>
  );
}
