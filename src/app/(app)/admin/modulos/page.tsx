import { notFound } from "next/navigation";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getTenantModuleStates } from "@/lib/modules";
import { getSectorMaps } from "@/lib/sectors";
import { ToggleModuleButton } from "@/components/admin/ToggleModuleButton";
import { alternarModulo } from "./actions";

export default async function ModulosPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const [modules, { labels: sectorLabels }] = await Promise.all([
    getTenantModuleStates(ctx.tenantId),
    getSectorMaps(ctx.tenantId),
  ]);

  const grouped = modules.reduce<Record<string, typeof modules>>((acc, m) => {
    (acc[m.sectorCode] ??= []).push(m);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Módulos</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          Blocos de funcionalidade que podem ser ligados ou desligados por cliente.
        </p>
      </div>

      {modules.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg py-16 text-center text-[13px] text-fg-muted">
          Nenhum módulo no catálogo ainda. Os módulos de setor (Recrutamento, RH/DP…) aparecem aqui
          quando forem construídos.
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([sectorCode, list]) => (
            <div key={sectorCode}>
              <h2 className="text-[15px] font-medium text-fg mb-2">
                {sectorLabels[sectorCode] ?? sectorCode}
              </h2>
              <div className="bg-surface border border-border rounded-lg divide-y divide-border">
                {list.map((m) => (
                  <div key={m.code} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-[13px] text-fg">{m.label}</p>
                      <p className="text-[11px] text-fg-muted">{m.description}</p>
                    </div>
                    <ToggleModuleButton
                      action={alternarModulo.bind(null, m.code, !m.enabled)}
                      enabled={m.enabled}
                      nome={m.label}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
