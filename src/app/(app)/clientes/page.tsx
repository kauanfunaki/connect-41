import { Pagination } from "@/components/shared/Pagination";
import { Building2, Plus } from "lucide-react";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
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
import { alternarAtivoCliente, inativarClientesEmMassa } from "./actions";

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
          subtitle="Cada cliente agrupa uma ou mais empresas."
          action={
            <>{canCreate && <Button href="/clientes/novo" variant="primary"><Plus size={14} /> Novo cliente</Button>}</>
          }
        />

        {/* Revisão de 05/10: botão não é link — o "Mostrar todos" era texto azul. */}
        {ocultos > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-fs-2 text-fg-muted mb-4">
            <p>
              {ocultos} cliente{ocultos !== 1 ? "s" : ""} inativo{ocultos !== 1 ? "s" : ""} fora desta lista.
            </p>
            <Button href={buildUrl({ inativos: "1", page: "1" })} variant="ghost" size="xs">
              Mostrar todos
            </Button>
          </div>
        )}

        {/* Contagem, busca e filtro na barra do casco (07/10/2026), como as
            filas irmãs de 05/10: eram a busca e o filtro soltos acima da
            tabela, a contagem no subtítulo e o vazio num cartão à parte. O
            painel do Filtros continua o mesmo (modelo aprovado), na barra. */}
        <CascoDaTabela
          contagem={contarItens(total, "cliente", "clientes")}
          busca={<DebouncedSearchInput placeholder="Buscar por nome…" className="w-72 max-w-full" />}
        >
        {clientes.length === 0 ? (
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
                <Button href="/clientes/novo"><Plus size={14} /> Novo cliente</Button>
              ) : undefined
            }
          />
        ) : (
          <ClientesTable
            inativarEmMassa={inativarClientesEmMassa}
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
        </CascoDaTabela>

        <Pagination page={pageNum} totalPages={totalPages} buildHref={(n) => buildUrl({ page: String(n) })} total={total} rotulo="clientes" />
      </div>
    </PageContainer>
  );
}
