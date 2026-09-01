import Link from "next/link";
import { Building2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { CadastrosTabsBar } from "@/components/shared/CadastrosTabsBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { formatCnpj } from "@/lib/format";
import { ClientesTable } from "@/components/clientes/ClientesTable";
import { alternarAtivoCliente } from "./actions";

const PER_PAGE = 20;

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string; inativos?: string }>;
}) {
  const { search, page, inativos } = await searchParams;
  const ctx = await getAuthContext();
  const canCreate = canWrite(ctx.role);
  const mostrarInativos = inativos === "1";

  const prisma = getPrisma();
  const pageNum = Math.max(1, parseInt(page ?? "1"));

  const where = {
    tenantId: ctx.tenantId,
    ...(search ? { name: { contains: search } } : {}),
    // Mesmo padrão de Empresas e Pessoas: inativo fica fora por padrão, com
    // aviso de quantos ficaram de fora.
    ...(mostrarInativos ? {} : { active: true }),
  };

  const [clientes, total, ocultos] = await Promise.all([
    prisma.clientGroup.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (pageNum - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { _count: { select: { companies: true } } },
    }),
    prisma.clientGroup.count({ where }),
    mostrarInativos
      ? Promise.resolve(0)
      : prisma.clientGroup.count({
          where: {
            tenantId: ctx.tenantId,
            ...(search ? { name: { contains: search } } : {}),
            active: false,
          },
        }),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);

  function buildUrl(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { search, page, inativos, ...params };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `/clientes?${q.toString()}`;
  }

  return (
    <PageContainer>
      <CadastrosTabsBar active="clientes" />

      <div id="cadastros-content">
        <PageHeader
          title="Clientes"
          subtitle={
            <>
              {total} cliente{total !== 1 ? "s" : ""} — cada um agrupa uma ou mais empresas
            </>
          }
          action={
            <>{canCreate && <Button href="/clientes/novo" variant="primary" className="font-medium">+ Novo Cliente</Button>}</>
          }
        />

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 max-w-xs">
            <DebouncedSearchInput placeholder="Buscar por nome…" />
          </div>
        </div>

        {ocultos > 0 && (
          <p className="text-[12px] text-fg-muted mb-4">
            {ocultos} cliente{ocultos !== 1 ? "s" : ""} inativo{ocultos !== 1 ? "s" : ""} fora desta lista.{" "}
            <Link href={buildUrl({ inativos: "1", page: "1" })} className="text-brand hover:underline font-medium">
              Mostrar todos
            </Link>
          </p>
        )}

        {clientes.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Building2 />}
              title={search ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado ainda"}
              description={
                search
                  ? "Tente ajustar a busca."
                  : "O cliente é o nível acima da empresa: um cliente pode ter vários CNPJs."
              }
              action={
                !search && canCreate ? (
                  <Link href="/clientes/novo"><Button>+ Novo Cliente</Button></Link>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <ClientesTable
            clientes={clientes.map((c) => ({
              id: c.id,
              name: c.name,
              cnpjRootLabel: c.cnpjRoot ? formatCnpj(c.cnpjRoot) : null,
              active: c.active,
              companiesCount: c._count.companies,
            }))}
            canCreate={canCreate}
            alternarAtivo={alternarAtivoCliente}
          />
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <span className="text-[12px] text-fg-muted">Página {pageNum} de {totalPages}</span>
            <div className="flex gap-1">
              {pageNum > 1 && (
                <Link href={buildUrl({ page: String(pageNum - 1) })} className="h-8 px-3 rounded-md text-[12px] text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors flex items-center">
                  ← Anterior
                </Link>
              )}
              {pageNum < totalPages && (
                <Link href={buildUrl({ page: String(pageNum + 1) })} className="h-8 px-3 rounded-md text-[12px] text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors flex items-center">
                  Próxima →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
