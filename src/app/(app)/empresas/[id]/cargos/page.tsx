import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { DeleteFieldButton } from "@/components/admin/DeleteFieldButton";
import { excluirCargo } from "./actions";

export default async function CargosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: companyId } = await params;
  const ctx = await getAuthContext();
  const canManage = canWrite(ctx.role);

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true },
  });
  if (!company) notFound();

  const cargos = await prisma.cargo.findMany({
    where: { tenantId: ctx.tenantId, companyId },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/empresas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Empresas
        </Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/empresas/${companyId}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]">
          {company.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Cargos</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Cargos</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {cargos.length} cargo{cargos.length !== 1 ? "s" : ""} cadastrado{cargos.length !== 1 ? "s" : ""} nesta empresa
          </p>
        </div>
        {canManage && (
          <Link
            href={`/empresas/${companyId}/cargos/novo`}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
          >
            + Novo Cargo
          </Link>
        )}
      </div>

      {cargos.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg py-16 text-center text-[13px] text-fg-muted">
          Nenhum cargo cadastrado ainda.
        </div>
      ) : (
        <div className="bg-surface border border-border rounded-lg divide-y divide-border">
          {cargos.map((c) => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className="text-[13px] text-fg font-medium">{c.name}</p>
                {c.area && <p className="text-[12px] text-fg-muted">{c.area}</p>}
              </div>
              {canManage && (
                <div className="flex items-center gap-3">
                  <Link
                    href={`/empresas/${companyId}/cargos/${c.id}/editar`}
                    className="text-[12px] text-fg-muted hover:text-fg transition-colors"
                  >
                    Editar
                  </Link>
                  <DeleteFieldButton action={excluirCargo.bind(null, c.id, companyId)} nome={c.name} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
