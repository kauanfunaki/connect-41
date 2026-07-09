import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { AddDesligamentoForm } from "@/components/pessoas/AddDesligamentoForm";
import { DesligamentoRow } from "@/components/pessoas/DesligamentoRow";
import { criarDesligamento, atualizarDesligamento, excluirDesligamento } from "./actions";

export default async function DesligamentoPage({
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

  const terminations = await prisma.termination.findMany({
    where: { tenantId: ctx.tenantId, personId: id },
    orderBy: { requestedAt: "desc" },
  });

  const criarDesligamentoAction = criarDesligamento.bind(null, id);

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
        <span className="text-[13px] text-fg">Desligamento</span>
      </div>

      <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em] mb-6">Desligamento</h1>

      <div className="bg-surface border border-border rounded-lg p-5">
        {terminations.length === 0 ? (
          <p className="text-[13px] text-fg-muted mb-3">Nenhum desligamento registrado.</p>
        ) : (
          <div>
            {terminations.map((t) => (
              <DesligamentoRow
                key={t.id}
                desligamento={{
                  id: t.id,
                  type: t.type,
                  status: t.status,
                  reason: t.reason,
                  requestedAtLabel: t.requestedAt.toLocaleDateString("pt-BR"),
                  finalizedAtLabel: t.finalizedAt?.toLocaleDateString("pt-BR") ?? null,
                }}
                updateAction={atualizarDesligamento.bind(null, id, t.id)}
                removeAction={excluirDesligamento.bind(null, id, t.id)}
                canManage={canEdit}
              />
            ))}
          </div>
        )}

        {canEdit && terminations.every((t) => t.status === "CANCELADO") && (
          <AddDesligamentoForm action={criarDesligamentoAction} />
        )}
      </div>
    </PageContainer>
  );
}
