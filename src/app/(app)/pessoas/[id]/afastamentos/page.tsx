import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";
import { AddAfastamentoForm } from "@/components/pessoas/AddAfastamentoForm";
import { AfastamentoRow } from "@/components/pessoas/AfastamentoRow";
import { criarAfastamento, atualizarAfastamento, excluirAfastamento } from "./actions";

export default async function AfastamentosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  const canEdit = canWrite(ctx.role);
  const canViewMedical = await canViewSensitiveField(ctx, "DADOS_MEDICOS");

  const prisma = getPrisma();
  const person = await prisma.person.findFirst({
    where: { id, type: "COLABORADOR", ...(await scopedPersonWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!person) notFound();

  const absences = await prisma.absence.findMany({
    where: { tenantId: ctx.tenantId, personId: id },
    orderBy: { startDate: "desc" },
  });

  const criarAfastamentoAction = criarAfastamento.bind(null, id);

  return (
    <PageContainer>
      <div className="flex items-center gap-2 mb-6">
        <Link href="/pessoas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Pessoas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/pessoas/${id}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]">
          {person.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Afastamentos</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Afastamentos e Atestados</h1>

      <div className="bg-surface border border-border rounded-lg p-5">
        {absences.length === 0 ? (
          <p className="text-[13px] text-fg-muted mb-3">Nenhum afastamento registrado ainda.</p>
        ) : (
          <div>
            {absences.map((a) => (
              <AfastamentoRow
                key={a.id}
                afastamento={{
                  id: a.id,
                  type: a.type,
                  status: a.status,
                  startDateLabel: a.startDate.toLocaleDateString("pt-BR"),
                  returnDateLabel: a.returnDate?.toLocaleDateString("pt-BR") ?? null,
                  lostDays: a.lostDays,
                  reason: a.reason,
                }}
                updateAction={atualizarAfastamento.bind(null, id, a.id)}
                removeAction={excluirAfastamento.bind(null, id, a.id)}
                canManage={canEdit}
                canViewMedical={canViewMedical}
              />
            ))}
          </div>
        )}

        {canEdit && <AddAfastamentoForm action={criarAfastamentoAction} canEditMedical={canViewMedical} />}
      </div>
    </PageContainer>
  );
}
