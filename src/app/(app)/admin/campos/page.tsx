import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getSectorMaps } from "@/lib/sectors";
import { DeleteFieldButton } from "@/components/admin/DeleteFieldButton";
import { excluirCampo } from "./actions";

const FIELD_TYPE_LABEL: Record<string, string> = {
  TEXT: "Texto curto",
  TEXTAREA: "Texto longo",
  NUMBER: "Número",
  DATE: "Data",
  SELECT: "Seleção",
  BOOLEAN: "Sim / Não",
};

export default async function CamposPage() {
  const ctx = await getAuthContext();
  const canManageAny = isFullWrite(ctx.role) || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);
  if (!canManageAny) notFound();

  const prisma = getPrisma();
  const { labels: sectorLabels } = await getSectorMaps(ctx.tenantId);

  const where = isFullWrite(ctx.role)
    ? { tenantId: ctx.tenantId }
    : { tenantId: ctx.tenantId, sectorCode: { in: ctx.sectors } };

  const fields = await prisma.customField.findMany({
    where,
    orderBy: [{ sectorCode: "asc" }, { entityType: "asc" }, { order: "asc" }],
  });

  const grouped = fields.reduce<Record<string, typeof fields>>((acc, f) => {
    const key = `${f.sectorCode}::${f.entityType}`;
    (acc[key] ??= []).push(f);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Campos Customizados</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {fields.length} campo{fields.length !== 1 ? "s" : ""} configurado{fields.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/admin/campos/novo"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
        >
          + Novo Campo
        </Link>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="bg-surface border border-border rounded-lg py-16 text-center text-[13px] text-fg-muted">
          Nenhum campo customizado cadastrado ainda.
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([key, list]) => {
            const [sectorCode, entityType] = key.split("::");
            return (
              <div key={key}>
                <h2 className="text-[15px] font-medium text-fg mb-2">
                  {sectorLabels[sectorCode] ?? sectorCode} ·{" "}
                  {entityType === "COMPANY" ? "Empresas" : "Pessoas"}
                </h2>
                <div className="bg-surface border border-border rounded-lg divide-y divide-border">
                  {list.map((f) => (
                    <div key={f.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-[13px] text-fg">
                          {f.label} {f.required && <span className="text-danger">*</span>}
                        </p>
                        <p className="text-[11px] text-fg-muted">
                          {FIELD_TYPE_LABEL[f.fieldType] ?? f.fieldType} · <span className="font-mono">{f.key}</span>
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/campos/${f.id}/editar`}
                          className="text-[12px] text-fg-muted hover:text-fg transition-colors"
                        >
                          Editar
                        </Link>
                        <DeleteFieldButton action={excluirCampo.bind(null, f.id)} nome={f.label} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
