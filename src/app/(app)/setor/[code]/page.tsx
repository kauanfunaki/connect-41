import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { getTenantModuleStates } from "@/lib/modules";
import { getSectorMaps } from "@/lib/sectors";

export default async function SectorHubPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const ctx = await getAuthContext();

  if (!canViewSector(ctx, code)) notFound();

  const [allModules, { labels: sectorLabels }] = await Promise.all([
    getTenantModuleStates(ctx.tenantId),
    getSectorMaps(ctx.tenantId),
  ]);

  const modules = allModules.filter((m) => m.sectorCode === code && m.enabled);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">
          {sectorLabels[code] ?? code}
        </h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          Módulos disponíveis para este setor.
        </p>
      </div>

      {modules.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg py-16 text-center text-[13px] text-fg-muted">
          Nenhum módulo ativo para este setor ainda.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {modules.map((m) => (
            <Link
              key={m.code}
              href={`/setor/${code}/${m.code}`}
              className="bg-surface border border-border rounded-lg p-4 hover:border-border-strong transition-colors"
            >
              <p className="text-[13px] font-medium text-fg mb-1">{m.label}</p>
              <p className="text-[12px] text-fg-muted">{m.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
