import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canManageSector, canWrite } from "@/lib/auth/context";
import { scopedPipelineWhere } from "@/lib/auth/scope";

// Home do módulo dedicado do BPO Financeiro — não é o /kanban genérico: o
// setor "bpo" tem sua própria tela de board (ver [id]/page.tsx), fora da
// lista multi-setor. Se só existe 1 pipeline do setor, pula direto pro board;
// se existem vários, mostra os cards; se nenhum, orienta a criar em /kanban/novo.
export default async function BpoFinanceiroHomePage() {
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const pipelines = await prisma.pipeline.findMany({
    where: { ...scopedPipelineWhere(ctx), sectorCode: "bpo" },
    orderBy: { name: "asc" },
    include: { _count: { select: { items: true } } },
  });

  if (pipelines.length === 1) {
    redirect(`/bpo-financeiro/${pipelines[0].id}`);
  }

  const canCreate = canWrite(ctx.role) && canManageSector(ctx, "bpo");

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">BPO Financeiro</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          Tarefas internas do setor — fechamento por competência, carteira de clientes e pendências.
        </p>
      </div>

      {pipelines.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl">
          <EmptyState
            icon={<ClipboardList />}
            title="Nenhum quadro do BPO cadastrado ainda"
            description="Crie o kanban do setor BPO em /kanban/novo (setor BPO Financeiro) — depois de criado, ele passa a abrir direto por aqui."
            action={canCreate ? <Link href="/kanban/novo"><Button>+ Novo Kanban</Button></Link> : undefined}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {pipelines.map((p, i) => (
            <Link
              key={p.id}
              href={`/bpo-financeiro/${p.id}`}
              style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
              className="reveal-in bg-surface border border-border rounded-lg p-4 hover:border-border-strong hover:-translate-y-0.5 transition-[border-color,transform]"
            >
              <p className="text-[13px] font-medium text-fg mb-1">{p.name}</p>
              <p className="text-[12px] text-fg-muted">
                {p._count.items} {p._count.items === 1 ? "item" : "itens"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
