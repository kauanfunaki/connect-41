import Link from "next/link";
import { notFound } from "next/navigation";
import { Tag as TagIcon } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { DeleteFieldButton } from "@/components/admin/DeleteFieldButton";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { excluirTag } from "./actions";

export default async function TagsPage() {
  const ctx = await getAuthContext();
  const canManageAny = isFullWrite(ctx.role) || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);
  if (!canManageAny) notFound();

  const prisma = getPrisma();
  const { labels: sectorLabels } = await getSectorMaps(ctx.tenantId);

  const where = isFullWrite(ctx.role)
    ? { tenantId: ctx.tenantId }
    : { tenantId: ctx.tenantId, sectorCode: { in: ctx.sectors } };

  const tags = await prisma.tag.findMany({
    where,
    orderBy: [{ sectorCode: "asc" }, { name: "asc" }],
  });

  const grouped = tags.reduce<Record<string, typeof tags>>((acc, t) => {
    (acc[t.sectorCode] ??= []).push(t);
    return acc;
  }, {});

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Tags</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {tags.length} tag{tags.length !== 1 ? "s" : ""} cadastrada{tags.length !== 1 ? "s" : ""} — reutilizáveis em todos os kanbans do mesmo setor
          </p>
        </div>
        <Link
          href="/admin/tags/novo"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
        >
          + Nova Tag
        </Link>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="bg-surface border border-border rounded-lg">
          <EmptyState
            icon={<TagIcon />}
            title="Nenhuma tag cadastrada"
            description="Cadastre tags reutilizáveis para marcar itens de kanban do mesmo setor."
            action={
              <Link
                href="/admin/tags/novo"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
              >
                + Nova Tag
              </Link>
            }
          />
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([sectorCode, list]) => (
            <div key={sectorCode}>
              <h2 className="text-[15px] font-medium text-fg mb-2">
                {sectorLabel(sectorLabels, sectorCode)}
              </h2>
              <div className="bg-surface border border-border rounded-lg divide-y divide-border">
                {list.map((t) => (
                  <div key={t.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: t.color }} />
                      <p className="text-[13px] text-fg">{t.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/tags/${t.id}/editar`}
                        className="text-[12px] text-fg-muted hover:text-fg transition-colors"
                      >
                        Editar
                      </Link>
                      <DeleteFieldButton action={excluirTag.bind(null, t.id)} nome={t.name} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
