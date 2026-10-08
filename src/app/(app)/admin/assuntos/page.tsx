import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getSectorMaps } from "@/lib/sectors";
import { garantirAssuntosPadrao } from "@/lib/solicitacoes/assuntos";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { alternarAssunto } from "./actions";

/**
 * Os assuntos que o cliente escolhe ao abrir uma solicitação no portal (01/10).
 * Nascem com a lista padrão na primeira visita e são editados aqui.
 */
export default async function AssuntosPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) notFound();

  await garantirAssuntosPadrao(ctx.tenantId);
  const [assuntos, { labels }] = await Promise.all([
    getPrisma().serviceRequestSubject.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ active: "desc" }, { order: "asc" }, { label: "asc" }],
      include: { _count: { select: { requests: true } } },
    }),
    getSectorMaps(ctx.tenantId),
  ]);

  return (
    <PageContainer>
      <PageHeader
        title="Assuntos das solicitações"
        subtitle="O que o cliente escolhe ao pedir algo pelo portal. Cada assunto diz o setor que atende e em quantos dias úteis a equipe responde."
        action={
          <Button href="/admin/assuntos/novo">
            <Plus size={14} /> Novo assunto
          </Button>
        }
      />

      <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] divide-y divide-border">
        {assuntos.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 basis-72">
              <p className={`text-[14px] font-semibold ${a.active ? "text-fg" : "text-fg-muted"}`}>
                {a.label} {!a.active && <Selo tom="neutro">Inativo</Selo>}
              </p>
              {a.description && <p className="text-[12.5px] text-fg-muted mt-0.5">{a.description}</p>}
              <p className="text-[12px] text-fg-secondary mt-1">
                {labels[a.sectorCode] ?? a.sectorCode} · responde em até {a.responseDays} {a.responseDays === 1 ? "dia útil" : "dias úteis"} ·{" "}
                {a._count.requests} {a._count.requests === 1 ? "solicitação" : "solicitações"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button href={`/admin/assuntos/${a.id}/editar`} variant="secondary" size="sm">
                Editar
              </Button>
              <ConfirmActionButton
                action={alternarAssunto.bind(null, a.id)}
                label={a.active ? "Desativar" : "Ativar"}
                title={a.active ? `Desativar "${a.label}"?` : `Ativar "${a.label}"?`}
                description={
                  a.active
                    ? "Some da lista do cliente. As solicitações já abertas com ele continuam como estão."
                    : "Volta para a lista que o cliente vê ao abrir uma solicitação."
                }
                confirmLabel={a.active ? "Desativar" : "Ativar"}
                destructive={a.active}
              />
            </div>
          </div>
        ))}
      </div>
    </PageContainer>
  );
}
