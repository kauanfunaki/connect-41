import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { DeleteButton } from "@/components/pessoas/DeleteButton";
import { excluirCiclo, encerrarCiclo } from "../actions";
import { SelecionarColaboradorForm } from "@/components/avaliacoes/SelecionarColaboradorForm";

export default async function CicloPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  const canManage = canWrite(ctx.role);

  const prisma = getPrisma();
  const ciclo = await prisma.evaluationCycle.findFirst({
    where: { id, tenantId: ctx.tenantId },
    include: {
      evaluations: {
        orderBy: { evaluationDate: "desc" },
        include: { person: { select: { id: true, name: true } } },
      },
    },
  });
  if (!ciclo) notFound();

  const evaluatedIds = new Set(ciclo.evaluations.map((e) => e.personId));
  const colaboradores = await prisma.person.findMany({
    where: { tenantId: ctx.tenantId, type: "COLABORADOR", active: true, id: { notIn: [...evaluatedIds] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const deleteAction = excluirCiclo.bind(null, id);
  const encerrarAction = encerrarCiclo.bind(null, id);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/avaliacoes" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Avaliações</Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg truncate">{ciclo.name}</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">{ciclo.name}</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {ciclo.startDate.toLocaleDateString("pt-BR")}
            {ciclo.endDate && ` — ${ciclo.endDate.toLocaleDateString("pt-BR")}`}
            {!ciclo.active && " · Encerrado"}
          </p>
        </div>
        {canManage && (
          <div className="flex items-center gap-2 flex-shrink-0">
            {ciclo.active && (
              <form action={encerrarAction}>
                <button
                  type="submit"
                  className="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors"
                >
                  Encerrar Ciclo
                </button>
              </form>
            )}
            <DeleteButton action={deleteAction} nome={ciclo.name} />
          </div>
        )}
      </div>

      <div className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-[14px] font-semibold text-fg mb-3">
          Avaliações {ciclo.evaluations.length > 0 && `(${ciclo.evaluations.length})`}
        </h2>

        {ciclo.evaluations.length === 0 ? (
          <p className="text-[13px] text-fg-muted mb-3">Nenhuma avaliação registrada ainda.</p>
        ) : (
          <div className="divide-y divide-border mb-3">
            {ciclo.evaluations.map((e) => (
              <Link
                key={e.id}
                href={`/avaliacoes/${id}/avaliar/${e.person.id}`}
                className="flex items-center justify-between py-2.5 hover:bg-surface-2 transition-colors px-2 -mx-2 rounded-md"
              >
                <p className="text-[13px] text-fg">{e.person.name}</p>
                <span className="text-[12px] text-fg-muted">
                  {e.averageScore != null ? `Média: ${e.averageScore.toString()}` : "Sem nota"}
                </span>
              </Link>
            ))}
          </div>
        )}

        {canManage && ciclo.active && (
          <SelecionarColaboradorForm cycleId={id} colaboradores={colaboradores} />
        )}
      </div>
    </div>
  );
}
