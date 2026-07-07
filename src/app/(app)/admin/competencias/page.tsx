import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { DeleteFieldButton } from "@/components/admin/DeleteFieldButton";
import { AddCompetenciaForm } from "@/components/admin/AddCompetenciaForm";
import { criarCompetencia, excluirCompetencia } from "./actions";

export default async function CompetenciasPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const competencias = await prisma.competency.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Competências</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          {competencias.length} competência{competencias.length !== 1 ? "s" : ""} cadastrada{competencias.length !== 1 ? "s" : ""} — usadas nas avaliações de desempenho
        </p>
      </div>

      <AddCompetenciaForm action={criarCompetencia} />

      {competencias.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg py-16 text-center text-[13px] text-fg-muted">
          Nenhuma competência cadastrada ainda.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {competencias.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-2.5">
              <div>
                <p className="text-[13px] text-fg">{c.name}</p>
                {c.description && <p className="text-[12px] text-fg-muted">{c.description}</p>}
              </div>
              <DeleteFieldButton action={excluirCompetencia.bind(null, c.id)} nome={c.name} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
