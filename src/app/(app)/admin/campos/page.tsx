import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { ListChecks } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { DeleteFieldButton } from "@/components/admin/DeleteFieldButton";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
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
    <PageContainer>
      <PageHeader
        title="Campos Customizados"
        subtitle={<>{fields.length} campo{fields.length !== 1 ? "s" : ""} configurado{fields.length !== 1 ? "s" : ""}</>}
        action={<><Button
          href="/admin/campos/novo"
          variant="primary" className="font-medium"
        >
          + Novo Campo
        </Button></>}
      />
      {Object.keys(grouped).length === 0 ? (
        <Card>
          <EmptyState
            icon={<ListChecks />}
            title="Nenhum campo customizado cadastrado"
            description="Crie campos extras para Empresas ou Pessoas, específicos de um setor ou de todo o tenant."
            action={
              <Button
                href="/admin/campos/novo"
                variant="primary" className="font-medium"
              >
                + Novo Campo
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([key, list]) => {
            const [sectorCode, entityType] = key.split("::");
            return (
              <div key={key}>
                <h2 className="text-[15px] font-medium text-fg mb-2">
                  {sectorLabel(sectorLabels, sectorCode)} ·{" "}
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
    </PageContainer>
  );
}
