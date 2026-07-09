import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getAllBranches } from "@/lib/branches";
import { PageContainer } from "@/components/shared/PageContainer";

export default async function FiliaisPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const branches = await getAllBranches(ctx.tenantId);

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Filiais</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {branches.length} filial{branches.length !== 1 ? "is" : ""} cadastrada{branches.length !== 1 ? "s" : ""} —
            organizacional apenas, não isola dados entre elas.
          </p>
        </div>
        <Link
          href="/admin/filiais/novo"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
        >
          + Nova Filial
        </Link>
      </div>

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        {branches.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-fg-muted">Nenhuma filial cadastrada ainda.</div>
        ) : (
          <div className="divide-y divide-border">
            {branches.map((b) => (
              <div key={b.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <p className="text-[13px] font-medium text-fg truncate">{b.name}</p>
                  {!b.active && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-2 text-fg-muted border border-border flex-shrink-0">
                      Inativa
                    </span>
                  )}
                </div>
                <Link
                  href={`/admin/filiais/${b.id}/editar`}
                  className="text-[12px] text-fg-muted hover:text-fg transition-colors flex-shrink-0"
                >
                  Editar
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
