import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { DeleteButton } from "@/components/pessoas/DeleteButton";
import { DeleteFieldButton } from "@/components/admin/DeleteFieldButton";
import { excluirTreinamento } from "../actions";
import { criarTurma, excluirTurma } from "./actions";
import { AddTurmaForm } from "@/components/treinamentos/AddTurmaForm";
import { PageContainer } from "@/components/shared/PageContainer";

export default async function TreinamentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  const canManage = canWrite(ctx.role);

  const prisma = getPrisma();
  const training = await prisma.training.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      classes: {
        orderBy: { date: "desc" },
        include: { _count: { select: { participants: true } } },
      },
    },
  });
  if (!training) notFound();

  const deleteAction = excluirTreinamento.bind(null, id);
  const criarTurmaAction = criarTurma.bind(null, id);

  return (
    <PageContainer variant="narrow">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/treinamentos" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Treinamentos</Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg truncate">{training.name}</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">{training.name}</h1>
          {training.workloadHours && <p className="text-[13px] text-fg-muted mt-0.5">{training.workloadHours.toString()}h de carga horária</p>}
        </div>
        {canManage && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href={`/treinamentos/${id}/editar`}
              className="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors inline-flex items-center"
            >
              Editar
            </Link>
            <DeleteButton action={deleteAction} nome={training.name} />
          </div>
        )}
      </div>

      {training.description && (
        <div className="bg-surface border border-border rounded-lg p-5 mb-4">
          <p className="text-[13px] text-fg whitespace-pre-wrap">{training.description}</p>
        </div>
      )}

      <div className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-[14px] font-semibold text-fg mb-3">
          Turmas {training.classes.length > 0 && `(${training.classes.length})`}
        </h2>

        {training.classes.length === 0 ? (
          <p className="text-[13px] text-fg-muted mb-3">Nenhuma turma criada ainda.</p>
        ) : (
          <div className="divide-y divide-border mb-3">
            {training.classes.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2.5">
                <Link href={`/treinamentos/${id}/turmas/${c.id}`} className="text-[13px] text-brand hover:underline">
                  {c.date.toLocaleDateString("pt-BR")}
                  {c.shift && ` — ${c.shift}`}
                </Link>
                <div className="flex items-center gap-3">
                  <span className="text-[12px] text-fg-muted">
                    {c._count.participants} participante{c._count.participants !== 1 ? "s" : ""}
                    {c.instructor && ` · ${c.instructor}`}
                  </span>
                  {canManage && (
                    <DeleteFieldButton action={excluirTurma.bind(null, id, c.id)} nome={`turma de ${c.date.toLocaleDateString("pt-BR")}`} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {canManage && <AddTurmaForm action={criarTurmaAction} />}
      </div>
    </PageContainer>
  );
}
