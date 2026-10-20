import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { Tag as TagIcon } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite, podeExcluir, canManageSector } from "@/lib/auth/context";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { AcoesDoItem } from "@/components/admin/AcoesDoItem";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { PainelDeCadastro } from "@/components/admin/PainelDeCadastro";
import { TagForm } from "@/components/admin/TagForm";
import { atualizarTag, criarTag, excluirTag } from "./actions";

export default async function TagsPage({ searchParams }: { searchParams: Promise<{ novo?: string; editar?: string }> }) {
  const ctx = await getAuthContext();
  const canManageAny = isFullWrite(ctx.role) || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);
  if (!canManageAny) notFound();
  // Criar e editar no painel ao lado (escolha 2B, 20/10/2026) — ver `PainelDeCadastro`.
  const { novo, editar } = await searchParams;

  const prisma = getPrisma();
  const { labels: sectorLabels, options: allSectorOptions } = await getSectorMaps(ctx.tenantId);
  const sectorOptions = isFullWrite(ctx.role)
    ? allSectorOptions
    : allSectorOptions.filter((s) => ctx.sectors.includes(s.value));

  const where = isFullWrite(ctx.role)
    ? { tenantId: ctx.tenantId }
    : { tenantId: ctx.tenantId, sectorCode: { in: ctx.sectors } };

  const tags = await prisma.tag.findMany({
    where,
    orderBy: [{ sectorCode: "asc" }, { name: "asc" }],
  });

  const emEdicao = editar ? tags.find((t) => t.id === editar && canManageSector(ctx, t.sectorCode)) : undefined;

  const grouped = tags.reduce<Record<string, typeof tags>>((acc, t) => {
    (acc[t.sectorCode] ??= []).push(t);
    return acc;
  }, {});

  return (
    <PageContainer>
      <PageHeader
        title="Tags"
        subtitle={<>{tags.length} tag{tags.length !== 1 ? "s" : ""} cadastrada{tags.length !== 1 ? "s" : ""} — reutilizáveis em todos os kanbans do mesmo setor</>}
        action={<><Button
          href="/admin/tags?novo=1"
          variant="primary" className="font-medium"
        >
          + Nova tag
        </Button></>}
      />
      {Object.keys(grouped).length === 0 ? (
        <Card>
          {/* Sem repetir o "+ Nova tag": ele mora no cabeçalho, e o texto diz onde (P19, 15/10/2026). */}
          <EmptyState
            icon={<TagIcon />}
            title="Nenhuma tag cadastrada"
            description="Use “+ Nova tag”, no alto da tela, para cadastrar tags reutilizáveis que marcam itens de kanban do mesmo setor."
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([sectorCode, list]) => (
            <div key={sectorCode}>
              <h2 className="text-section font-semibold text-fg mb-2">
                {sectorLabel(sectorLabels, sectorCode)}
              </h2>
              <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] divide-y divide-border">
                {list.map((t) => (
                  <div key={t.id} className={`flex items-center justify-between gap-3 px-4 py-2.5 ${t.id === emEdicao?.id ? "bg-surface-hover" : ""}`}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: t.color }} />
                      <p className="text-fs-3 text-fg">{t.name}</p>
                    </div>
                    {/* Editar é botão e Excluir vai no "⋯" (polimento de 30/09). */}
                    <AcoesDoItem
                      editar={`/admin/tags?editar=${t.id}`}
                      excluir={podeExcluir(ctx) ? {
                        action: excluirTag.bind(null, t.id),
                        titulo: `Excluir a tag "${t.name}"?`,
                        descricao: "Ela sai de todos os itens de kanban e cadastros em que estiver marcada.",
                      } : undefined}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {novo === "1" && (
        <PainelDeCadastro titulo="Nova tag" voltarPara="/admin/tags">
          <TagForm action={criarTag} cancelHref="/admin/tags" sectorOptions={sectorOptions} />
        </PainelDeCadastro>
      )}
      {emEdicao && (
        <PainelDeCadastro titulo="Editar tag" voltarPara="/admin/tags">
          <TagForm
            key={emEdicao.id}
            action={atualizarTag}
            cancelHref="/admin/tags"
            sectorOptions={[]}
            defaultValues={{ id: emEdicao.id, sectorCode: emEdicao.sectorCode, name: emEdicao.name, color: emEdicao.color }}
          />
        </PainelDeCadastro>
      )}
    </PageContainer>
  );
}
