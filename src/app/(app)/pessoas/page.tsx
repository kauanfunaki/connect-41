import { Pagination } from "@/components/shared/Pagination";
import { PageHeader } from "@/components/ui/PageHeader";
import { Plus, Users } from "lucide-react";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
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
        subtitle="Os funcionários internos do escritório."
        action={<>{canCreate && (
          <Button
            href="/pessoas/nova?internal=1"
            variant="primary"
          >
            <Plus size={14} /> Nova pessoa
          </Button>
        )}</>}
      />

      {/* Revisão de 05/10: botão não é link — o "Mostrar todas" era texto azul. */}
      {ocultos > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-fs-2 text-fg-muted mb-4">
          <p>
            {ocultos} pessoa{ocultos !== 1 ? "s" : ""} inativa{ocultos !== 1 ? "s" : ""} fora desta lista.
          </p>
          <Button href={buildUrl({ situacao: SITUACAO_TODOS, page: "1" })} variant="ghost" size="xs">
            Mostrar todas
          </Button>
        </div>
      )}

      {/* Contagem, busca e filtro na barra do casco (07/10/2026), como as
          filas irmãs de 05/10: eram a busca e o filtro soltos acima da
          tabela, a contagem no subtítulo e o vazio num cartão à parte. O
          painel do Filtros continua o mesmo (modelo aprovado), na barra. */}
      <CascoDaTabela
        contagem={contarItens(total, "pessoa", "pessoas")}
        busca={<DebouncedSearchInput placeholder="Buscar por nome…" className="w-72 max-w-full" />}
        filtros={
          // Sem filtro de empresa: interno da 41 não tem empresa cliente.
          <PessoasFilterButton search={search} situacao={situacaoSelecionada(situacaoFiltro)} mostrarEmpresa={false} />
        }
      >
      {people.length === 0 ? (
        <EmptyState
          icon={<Users />}
          title={search ? "Nenhuma pessoa encontrada" : "Nenhuma pessoa cadastrada ainda"}
          description={
            search
              ? "Tente ajustar a busca."
              : "São os funcionários do próprio escritório. O pessoal das empresas clientes fica em Colaboradores de clientes."
          }
          action={
            !search && canCreate ? (
              <Button href="/pessoas/nova?internal=1"><Plus size={14} /> Nova pessoa</Button>
            ) : undefined
          }
        />
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
      </CascoDaTabela>

      <Pagination page={pageNum} totalPages={totalPages} buildHref={(n) => buildUrl({ page: String(n) })} total={total} rotulo="pessoas" />
      </div>
    </PageContainer>
  );
}
