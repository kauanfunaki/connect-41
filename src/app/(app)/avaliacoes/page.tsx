import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { AddCicloForm } from "@/components/avaliacoes/AddCicloForm";
import { criarCiclo } from "./actions";

export default async function AvaliacoesPage() {
  const ctx = await getAuthContext();
  const canManage = canWrite(ctx.role);

  const prisma = getPrisma();
  const ciclos = await prisma.evaluationCycle.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { startDate: "desc" },
    include: { _count: { select: { evaluations: true } } },
  });

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Avaliações de Desempenho</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          {ciclos.length} ciclo{ciclos.length !== 1 ? "s" : ""} de avaliação
        </p>
      </div>

      {canManage && <AddCicloForm action={criarCiclo} />}

      {ciclos.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg py-16 text-center text-[13px] text-fg-muted">
          Nenhum ciclo de avaliação criado ainda.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {ciclos.map((c) => (
            <Link
              key={c.id}
              href={`/avaliacoes/${c.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-surface-2 transition-colors"
            >
              <div>
                <p className="text-[13px] text-fg font-medium">{c.name}</p>
                <p className="text-[12px] text-fg-muted">
                  {c.startDate.toLocaleDateString("pt-BR")}
                  {c.endDate && ` — ${c.endDate.toLocaleDateString("pt-BR")}`}
                  {!c.active && " · Encerrado"}
                </p>
              </div>
              <span className="text-[12px] text-fg-muted">{c._count.evaluations} avaliação{c._count.evaluations !== 1 ? "ões" : ""}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
