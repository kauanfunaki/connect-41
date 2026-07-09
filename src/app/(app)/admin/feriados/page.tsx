import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { DeleteFieldButton } from "@/components/admin/DeleteFieldButton";
import { AddFeriadoForm } from "@/components/admin/AddFeriadoForm";
import { ImportFeriadosButton } from "@/components/admin/ImportFeriadosButton";
import { PageContainer } from "@/components/shared/PageContainer";
import { criarFeriado, excluirFeriado, importarFeriadosNacionais } from "./actions";

export default async function FeriadosPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const feriados = await prisma.holiday.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { date: "asc" },
  });

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Feriados</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          {feriados.length} feriado{feriados.length !== 1 ? "s" : ""} cadastrado{feriados.length !== 1 ? "s" : ""}
        </p>
      </div>

      <ImportFeriadosButton action={importarFeriadosNacionais} />
      <p className="text-[11px] text-fg-muted mb-5">
        Importa só feriados nacionais (via BrasilAPI). Feriados estaduais e municipais continuam
        sendo cadastrados manualmente abaixo.
      </p>

      <AddFeriadoForm action={criarFeriado} />

      {feriados.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg py-16 text-center text-[13px] text-fg-muted">
          Nenhum feriado cadastrado ainda.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {feriados.map((f) => (
            <div key={f.id} className="flex items-center justify-between px-4 py-2.5">
              <p className="text-[13px] text-fg">{f.name}</p>
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-fg-muted">{f.date.toLocaleDateString("pt-BR")}</span>
                <DeleteFieldButton action={excluirFeriado.bind(null, f.id)} nome={f.name} />
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
