import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderKanban, FolderClosed, ListTodo } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/shared/PageContainer";
import { NewSpaceButton } from "@/components/kanban/NewSpaceButton";
import { DeleteEntityMenu } from "@/components/kanban/DeleteEntityMenu";
import { criarEspaco, excluirEspaco } from "@/app/(app)/kanban/spaces-actions";
import { getAuthContext, canViewSector, canManageSector } from "@/lib/auth/context";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { getPrisma } from "@/lib/prisma";
import { boardPath } from "@/lib/kanbanPaths";

/** Quantas listas o cartão do espaço mostra pelo nome antes do "+N". */
const LISTAS_NO_CARTAO = 4;

/**
 * Os espaços do setor — e só eles.
 *
 * Até 30/09 esta tela abria com os cartões de todas as telas do setor e os
 * espaços só no fim. O Kauan pediu que "Espaços" fosse exclusivo da separação
 * espaço → pasta → lista → tarefa: as telas o menu já mostra (e agora vivem em
 * `/setor/[code]/telas`). Cada cartão mostra as listas do espaço, para achar a
 * lista sem abrir espaço por espaço.
 */
export default async function EspacosDoSetorPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ctx = await getAuthContext();
  if (!canViewSector(ctx, code)) notFound();

  const prisma = getPrisma();
  const [{ labels, colors }, spaces] = await Promise.all([
    getSectorMaps(ctx.tenantId),
    prisma.space.findMany({
      where: { tenantId: ctx.tenantId, sectorCode: code },
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        color: true,
        _count: { select: { folders: true, pipelines: { where: { active: true } } } },
        pipelines: {
          where: { active: true },
          orderBy: { createdAt: "asc" },
          take: LISTAS_NO_CARTAO,
          select: { id: true, name: true, color: true },
        },
      },
    }),
  ]);

  const setor = sectorLabel(labels, code);
  const corDoSetor = colors[code] ?? "#586577";
  const podeCriar = canManageSector(ctx, code);

  return (
    <PageContainer>
      <PageHeader
        title="Espaços"
        subtitle={
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full flex-shrink-0" style={{ background: corDoSetor }} aria-hidden />
            {setor} · as listas e quadros de tarefas do setor, organizados em espaços e pastas
          </span>
        }
        action={podeCriar ? <NewSpaceButton action={criarEspaco.bind(null, code)} /> : undefined}
      />

      {spaces.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FolderKanban />}
            title="Nenhum espaço criado ainda"
            description={
              podeCriar
                ? "Um espaço agrupa pastas e listas de tarefas do setor. Crie o primeiro no botão acima."
                : "Um espaço agrupa pastas e listas de tarefas do setor. Quem coordena o setor é quem cria."
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 items-stretch">
          {spaces.map((s, i) => {
            const restantes = s._count.pipelines - s.pipelines.length;
            return (
              // O menu "…" é irmão do <Link>, não filho: <button> dentro de <a>
              // é inválido e o clique navegaria junto.
              <div key={s.id} style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }} className="reveal-in relative">
                {/* Cartão-link no desenho único (07/10/2026): o mesmo hover e o
                    mesmo tamanho de título dos cartões do Kanban e das pastas. */}
                <div className="h-full flex flex-col bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] transition-[border-color,box-shadow,transform] duration-150 hover:border-brand/40 hover:shadow-[var(--c41-shadow-md)] hover:-translate-y-0.5 overflow-hidden">
                  <span className="h-[3px] flex-shrink-0" style={{ background: s.color }} aria-hidden />
                  <Link href={`/setor/${code}/espacos/${s.id}`} className="group block px-4 pt-3.5 pb-3">
                    <p className="text-[length:var(--fs-card-title)] font-semibold text-fg group-hover:text-brand transition-colors pr-8 truncate">
                      {s.name}
                    </p>
                    <p className="mt-1 flex items-center gap-3 text-[length:var(--fs-2)] text-fg-muted">
                      <span className="inline-flex items-center gap-1">
                        <FolderClosed size={13} /> {s._count.folders} {s._count.folders === 1 ? "pasta" : "pastas"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <ListTodo size={13} /> {s._count.pipelines} {s._count.pipelines === 1 ? "lista" : "listas"}
                      </span>
                    </p>
                  </Link>
                  {s.pipelines.length > 0 && (
                    <ul className="mt-auto border-t border-border px-2 py-1.5">
                      {s.pipelines.map((p) => (
                        <li key={p.id}>
                          <Link
                            href={boardPath(p)}
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[length:var(--fs-ui)] text-fg-secondary hover:bg-surface-hover hover:text-fg transition-colors"
                          >
                            <span className="size-1.5 rounded-full flex-shrink-0" style={{ background: p.color ?? s.color }} aria-hidden />
                            <span className="truncate">{p.name}</span>
                          </Link>
                        </li>
                      ))}
                      {restantes > 0 && (
                        <li>
                          <Link
                            href={`/setor/${code}/espacos/${s.id}`}
                            className="block rounded-md px-2 py-1.5 text-[length:var(--fs-2)] text-fg-muted hover:text-brand transition-colors"
                          >
                            + {restantes} {restantes === 1 ? "outra lista" : "outras listas"}
                          </Link>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
                {podeCriar && (
                  <div className="absolute top-3 right-2.5">
                    <DeleteEntityMenu kind="espaço" name={s.name} action={excluirEspaco.bind(null, s.id)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
