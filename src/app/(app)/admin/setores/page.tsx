import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getAllSectors } from "@/lib/sectors";

export default async function SetoresPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const sectors = await getAllSectors(ctx.tenantId);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Setores</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {sectors.length} setor{sectors.length !== 1 ? "es" : ""} cadastrado{sectors.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/admin/setores/novo"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
        >
          + Novo Setor
        </Link>
      </div>

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="divide-y divide-border">
          {sectors.map((s) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: s.color }}
                />
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-fg truncate">{s.label}</p>
                  <p className="text-[11px] text-fg-muted font-mono truncate">{s.code}</p>
                </div>
                {!s.active && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-2 text-fg-muted border border-border flex-shrink-0">
                    Inativo
                  </span>
                )}
              </div>
              <Link
                href={`/admin/setores/${s.id}/editar`}
                className="text-[12px] text-fg-muted hover:text-fg transition-colors flex-shrink-0"
              >
                Editar
              </Link>
            </div>
          ))}
        </div>
      </div>

      <p className="text-[11px] text-fg-muted mt-4">
        Setores não podem ser excluídos após criados (o código é referenciado em kanban,
        usuários e handoffs) — desative em vez de remover.
      </p>
    </div>
  );
}
