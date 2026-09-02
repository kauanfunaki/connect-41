import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { Users } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { PersonType } from "@/generated/prisma/enums";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { PessoasTable } from "@/components/pessoas/PessoasTable";
import { PessoasFilterButton } from "@/components/pessoas/PessoasFilterButton";
import { PageContainer } from "@/components/shared/PageContainer";
import { CadastrosTabsBar } from "@/components/shared/CadastrosTabsBar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { formatInstantDate } from "@/lib/format";
import {
  resolvePersonActiveFilter,
  personActiveWhere,
  estaOcultandoInativos,
  situacaoSelecionada,
  SITUACAO_TODOS,
} from "@/lib/personActiveFilter";
import { definirAtivoPessoasEmMassa } from "./actions";

const PER_PAGE = 20;

export default async function PessoasPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string; situacao?: string }>;
}) {
  const { search, page, situacao } = await searchParams;
  const ctx = await getAuthContext();
  const canCreate = canWrite(ctx.role);

  const prisma = getPrisma();
  const pageNum = Math.max(1, parseInt(page ?? "1"));
  // Sem `?situacao=`, a listagem traz só quem está ativo — ver src/lib/personActiveFilter.ts.
  const situacaoFiltro = resolvePersonActiveFilter(situacao);
  const ocultandoInativos = estaOcultandoInativos(situacaoFiltro);

  const baseWhere = {
    ...(await scopedPersonWhere(ctx)),
    type: PersonType.COLABORADOR,
    // Só a equipe da própria 41. O pessoal das empresas clientes saiu daqui em
    // 2026-09-02 para /colaboradores-clientes: Cadastros é módulo geral, usado
    // por todos os setores, e a lista de colaborador de cliente é do DP.
    isInternal: true,
    ...(search ? { name: { contains: search } } : {}),
  };

  const where = { ...baseWhere, ...personActiveWhere(situacaoFiltro) };

  // Quantos ficaram de fora — a tela avisa em vez de deixar parecer que sumiram.
  const ocultos = ocultandoInativos
    ? await prisma.person.count({ where: { ...baseWhere, active: false } })
    : 0;

  const [people, total] = await Promise.all([
    prisma.person.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (pageNum - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { currentCompany: { select: { id: true, name: true } }, linkedUser: { select: { id: true, name: true } } },
    }),
    prisma.person.count({ where }),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);

  function buildUrl(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { search, page, situacao, ...params };
    for (const [k, v] of Object.entries(merged)) {
      if (v) q.set(k, v);
    }
    return `/pessoas?${q.toString()}`;
  }

  return (
    <PageContainer>
      <CadastrosTabsBar active="pessoas" />

      <div id="cadastros-content">
      {/* Header */}
      <PageHeader
        title="Pessoas"
        subtitle={<>{`${total} funcionário${total !== 1 ? "s" : ""} interno${total !== 1 ? "s" : ""} da 41`}</>}
        action={<>{canCreate && (
          <Button
            href="/pessoas/nova?internal=1"
            variant="primary" className="font-medium"
          >
            + Nova Pessoa
          </Button>
        )}</>}
      />

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 max-w-xs">
          <DebouncedSearchInput placeholder="Buscar por nome…" />
        </div>

        {/* Sem filtro de empresa: interno da 41 não tem empresa cliente. */}
        <PessoasFilterButton
          search={search}
          situacao={situacaoSelecionada(situacaoFiltro)}
          mostrarEmpresa={false}
        />
      </div>

      {ocultos > 0 && (
        <p className="text-[12px] text-fg-muted mb-4">
          {ocultos} pessoa{ocultos !== 1 ? "s" : ""} inativa{ocultos !== 1 ? "s" : ""} fora desta lista.{" "}
          <Link href={buildUrl({ situacao: SITUACAO_TODOS, page: "1" })} className="text-brand hover:underline font-medium">
            Mostrar todas
          </Link>
        </p>
      )}

      {/* Table */}
      {people.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users />}
            title={search ? "Nenhuma pessoa encontrada" : "Nenhuma pessoa cadastrada ainda"}
            description={
              search
                ? "Tente ajustar a busca."
                : "São os funcionários da própria 41. O pessoal das empresas clientes fica em Colaboradores de clientes."
            }
            action={
              !search && canCreate ? (
                <Link href="/pessoas/nova?internal=1"><Button>+ Nova Pessoa</Button></Link>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <PessoasTable
          people={people.map((p) => ({
            id: p.id,
            name: p.name,
            active: p.active,
            cpf: p.cpf,
            email: p.email,
            photoUrl: p.photoUrl,
            companyName: p.currentCompany?.name ?? null,
            companyId: p.currentCompany?.id ?? null,
            createdAtLabel: formatInstantDate(p.createdAt),
            linkedUserName: p.linkedUser?.name ?? null,
          }))}
          showLinkedUser
          canCreate={canCreate}
          definirAtivoPessoasEmMassa={definirAtivoPessoasEmMassa}
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
