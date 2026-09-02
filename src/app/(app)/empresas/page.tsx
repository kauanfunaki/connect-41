import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Building2 } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { CadastrosTabsBar } from "@/components/shared/CadastrosTabsBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { EmpresasFilterButton } from "@/components/empresas/EmpresasFilterButton";
import { getPrisma } from "@/lib/prisma";
import { CompanyStatus } from "@/generated/prisma/enums";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { EmpresasTable } from "@/components/empresas/EmpresasTable";
import {
  resolveCompanyStatusFilter,
  companyStatusWhere,
  estaOcultandoInativas,
  valorSelecionado,
  STATUS_OCULTOS_POR_PADRAO,
  STATUS_TODOS,
} from "@/lib/companyStatusFilter";
import { atualizarStatusEmMassa, excluirEmpresasEmMassa } from "./actions";

const STATUS_LABEL: Record<CompanyStatus, string> = {
  PROSPECT: "Prospecto",
  ACTIVE:   "Ativo",
  INACTIVE: "Inativo",
  CHURNED:  "Cancelado",
};

const STATUS_COLOR: Record<CompanyStatus, string> = {
  PROSPECT: "var(--c41-warning)",
  ACTIVE:   "var(--c41-success)",
  INACTIVE: "var(--c41-fg-muted)",
  CHURNED:  "var(--c41-danger)",
};

// PROSPECT entrou na lista: sem ele, empresa em prospecção só era alcançável pelo
// "todos os status", e agora que o padrão esconde as inativas ficaria ainda mais escondida.
const FILTER_TABS: { value: CompanyStatus; label: string }[] = [
  { value: "ACTIVE",   label: "Ativo" },
  { value: "PROSPECT", label: "Prospecto" },
  { value: "INACTIVE", label: "Inativo" },
  { value: "CHURNED",  label: "Cancelado" },
];

const PER_PAGE = 20;

export default async function EmpresasPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; page?: string; cliente?: string }>;
}) {
  const { search, status, page, cliente } = await searchParams;
  const ctx = await getAuthContext();
  const canCreate = canWrite(ctx.role);
  const isSuperAdmin = ctx.role === "SUPER_ADMIN";

  const prisma = getPrisma();
  const pageNum = Math.max(1, parseInt(page ?? "1"));
  // Sem `?status=`, a listagem esconde inativas e canceladas — ver src/lib/companyStatusFilter.ts.
  const statusFiltro = resolveCompanyStatusFilter(status);
  const ocultandoInativas = estaOcultandoInativas(statusFiltro);
  const statusFilter = valorSelecionado(statusFiltro);

  const where = {
    ...(await scopedCompanyWhere(ctx)),
    ...(search ? { OR: [{ name: { contains: search } }, { externalId: { contains: search } }] } : {}),
    ...companyStatusWhere(statusFiltro),
    // Vem do link "N empresas" em /clientes.
    ...(cliente ? { clientGroupId: cliente } : {}),
  };

  // Quantas estão escondidas agora — a tela avisa em vez de deixar o usuário achar
  // que a base encolheu.
  const ocultas = ocultandoInativas
    ? await prisma.company.count({
        where: {
          ...(await scopedCompanyWhere(ctx)),
          ...(search ? { OR: [{ name: { contains: search } }, { externalId: { contains: search } }] } : {}),
          status: { in: STATUS_OCULTOS_POR_PADRAO },
        },
      })
    : 0;

  // Nome do cliente filtrado: sem ele o chip diria só "filtro ativo", e o
  // usuário não saberia por qual cliente está filtrando nem por que a busca
  // não acha uma empresa que ele sabe que existe.
  const clienteFiltrado = cliente
    ? await prisma.clientGroup.findFirst({ where: { id: cliente, tenantId: ctx.tenantId }, select: { name: true } })
    : null;

  const [companies, total] = await Promise.all([
    prisma.company.findMany({
      where,
      // Alfabética em dois níveis: o bloco pelo nome do cliente, e as empresas
      // dentro dele pela razão social — que é o que a tela mostra, já que
      // `displayName` só existe em filial e repete o nome com o sufixo.
      // Ordenar pelo grupo primeiro é o que mantém as empresas de um mesmo
      // cliente adjacentes; sem isso o agrupamento da tela viraria confete.
      orderBy: [{ clientGroup: { name: "asc" } }, { name: "asc" }],
      include: { clientGroup: { select: { id: true, name: true } } },
      skip: (pageNum - 1) * PER_PAGE,
      take: PER_PAGE,
    }),
    prisma.company.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);

  function buildUrl(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { search, status, page, cliente, ...params };
    for (const [k, v] of Object.entries(merged)) {
      if (v) q.set(k, v);
    }
    return `/empresas?${q.toString()}`;
  }

  return (
    <PageContainer>
      <CadastrosTabsBar active="empresas" />

      <div id="cadastros-content">
      {/* Header */}
      <PageHeader
        title="Empresas"
        subtitle={
          <>
            {total} empresa{total !== 1 ? "s" : ""}
            {cliente ? " neste cliente" : " cadastrada" + (total !== 1 ? "s" : "")}
          </>
        }
        action={<>{canCreate && (
          <Button
            href="/empresas/nova"
            variant="primary" className="font-medium"
          >
            + Nova Empresa
          </Button>
        )}</>}
      />
      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        {/* Search */}
        <div className="flex-1 max-w-xs">
          <DebouncedSearchInput placeholder="Buscar por nome ou ID…" />
        </div>

        <EmpresasFilterButton search={search} page={page} statusFilter={statusFilter} tabs={FILTER_TABS} />
      </div>

      {/* Filtro por cliente vem de um link de /clientes. Sem uma saída visível,
          o usuário buscava outra empresa, não achava, e concluía que ela não
          existe — o filtro continuava ativo na URL, invisível. */}
      {cliente && (
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex items-center gap-2 h-7 pl-3 pr-2 rounded-full bg-brand/10 text-brand text-[12px] font-medium">
            Cliente: {clienteFiltrado?.name ?? "desconhecido"}
            <Link
              href={buildUrl({ cliente: undefined, page: "1" })}
              aria-label="Remover filtro de cliente"
              className="grid place-items-center w-4 h-4 rounded-full hover:bg-brand/20 transition-colors"
            >
              ×
            </Link>
          </span>
          <span className="text-[12px] text-fg-muted">
            A busca e os filtros só enxergam as empresas deste cliente.
          </span>
        </div>
      )}

      {/* Esconder sem avisar faria a base parecer menor do que é. */}
      {ocultas > 0 && (
        <p className="text-[12px] text-fg-muted mb-4">
          {ocultas} empresa{ocultas !== 1 ? "s" : ""} inativa{ocultas !== 1 ? "s" : ""} ou cancelada
          {ocultas !== 1 ? "s" : ""} fora desta lista.{" "}
          <Link href={buildUrl({ status: STATUS_TODOS, page: "1" })} className="text-brand hover:underline font-medium">
            Mostrar todas
          </Link>
        </p>
      )}

      {/* Table */}
      {companies.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Building2 />}
            title={search || statusFilter ? "Nenhuma empresa encontrada" : "Nenhuma empresa cadastrada ainda"}
            description={
              search || statusFilter
                ? "Tente ajustar a busca ou os filtros."
                : "Comece cadastrando a primeira empresa do tenant."
            }
            action={
              !search && !statusFilter && canCreate ? (
                <Link href="/empresas/nova"><Button>+ Nova Empresa</Button></Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <EmpresasTable
          companies={companies.map((c) => ({
            id: c.id,
            name: c.name,
            displayName: c.displayName,
            externalId: c.externalId,
            cnpj: c.cnpj,
            status: c.status,
            email: c.email,
            taxRegime: c.taxRegime,
            logoUrl: c.logoUrl,
            city: c.city,
            stateCode: c.stateCode,
            clientGroupId: c.clientGroup?.id ?? null,
            clientGroupName: c.clientGroup?.name ?? null,
            parentCompanyId: c.parentCompanyId,
          }))}
          canCreate={canCreate}
          isSuperAdmin={isSuperAdmin}
          statusLabel={STATUS_LABEL}
          statusColor={STATUS_COLOR}
          atualizarStatusEmMassa={atualizarStatusEmMassa}
          excluirEmpresasEmMassa={excluirEmpresasEmMassa}
        />
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-[12px] text-fg-muted">
            Página {pageNum} de {totalPages}
          </span>
          <div className="flex gap-1">
            {pageNum > 1 && (
              <Link
                href={buildUrl({ page: String(pageNum - 1) })}
                className="h-8 px-3 rounded-md text-[12px] text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors flex items-center"
              >
                ← Anterior
              </Link>
            )}
            {pageNum < totalPages && (
              <Link
                href={buildUrl({ page: String(pageNum + 1) })}
                className="h-8 px-3 rounded-md text-[12px] text-fg-muted hover:bg-surface-2 hover:text-fg transition-colors flex items-center"
              >
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
