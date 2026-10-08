import { Pagination } from "@/components/shared/Pagination";
import { Plus, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { PessoasTable } from "@/components/pessoas/PessoasTable";
import { PessoasFilterButton } from "@/components/pessoas/PessoasFilterButton";
import { getPrisma } from "@/lib/prisma";
import { PersonType } from "@/generated/prisma/enums";
import { canManageSector } from "@/lib/auth/context";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { formatInstantDate } from "@/lib/format";
import { nomeExibicao } from "@/lib/companyName";
import {
  resolvePersonActiveFilter,
  personActiveWhere,
  estaOcultandoInativos,
  situacaoSelecionada,
  SITUACAO_TODOS,
} from "@/lib/personActiveFilter";
import { definirAtivoPessoasEmMassa } from "../pessoas/actions";

const PER_PAGE = 20;

/**
 * Colaboradores das empresas clientes.
 *
 * Saiu de `/pessoas` em 2026-09-02 por decisão do Kauan: Cadastros é módulo
 * geral, usado por todos os setores, e misturar o pessoal das empresas
 * clientes com o cadastro da própria 41 não se sustentava ali.
 *
 * **Nada mudou no modelo.** Continuam sendo `Person` com `isInternal = false`,
 * com os mesmos vínculos de admissão, férias, rescisão, afastamento e escala —
 * o DP segue lendo daqui. O que mudou foi onde a lista aparece. Registrado
 * porque a rota vive sob o setor `recrutamento` e a rotina dessas pessoas é de
 * DP: quem procurar o cadastro pelo módulo de DP não vai achar a listagem, só
 * os fluxos (`/admissoes`, `/desligamentos`, `/ferias`).
 */
export default async function ColaboradoresClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; companyId?: string; page?: string; situacao?: string }>;
}) {
  const { search, companyId, page, situacao } = await searchParams;
  const { ctx, setor } = await abrirTelaDoModulo("recrutamento_colaboradores_clientes");
  const canCreate = canManageSector(ctx, setor);

  const prisma = getPrisma();
  const pageNum = Math.max(1, parseInt(page ?? "1"));
  const situacaoFiltro = resolvePersonActiveFilter(situacao);
  const ocultandoInativos = estaOcultandoInativos(situacaoFiltro);

  const baseWhere = {
    ...(await scopedPersonWhere(ctx)),
    type: PersonType.COLABORADOR,
    isInternal: false,
    ...(search ? { name: { contains: search } } : {}),
    ...(companyId ? { currentCompanyId: companyId } : {}),
  };

  const where = { ...baseWhere, ...personActiveWhere(situacaoFiltro) };

  const ocultos = ocultandoInativos
    ? await prisma.person.count({ where: { ...baseWhere, active: false } })
    : 0;

  const [people, total, companies] = await Promise.all([
    prisma.person.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (pageNum - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        currentCompany: { select: { id: true, name: true, displayName: true } },
        linkedUser: { select: { id: true, name: true } },
      },
    }),
    prisma.person.count({ where }),
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, displayName: true },
    }),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);

  function buildUrl(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { search, companyId, page, situacao, ...params };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `/colaboradores-clientes?${q.toString()}`;
  }

  return (
    <PageContainer>
      <PageHeader
        title="Colaboradores de clientes"
        subtitle={
          <>
            {total} colaborador{total !== 1 ? "es" : ""} das empresas clientes — é este cadastro
            que alimenta admissão, férias e rescisão no DP.
          </>
        }
        action={
          canCreate ? (
            <Button href="/pessoas/nova?tipo=cliente" variant="primary">
              <Plus size={14} />
              Novo Colaborador
            </Button>
          ) : undefined
        }
      />

      {/* No casco das listas do Recrutamento (DRG-13, 07/10/2026): contagem na
          barra, busca e Filtros à direita — eram soltos acima da tabela — e o
          aviso dos inativos com o "Mostrar todos" nas ações da barra.
          Revisão de 05/10: botão não é link — o "Mostrar todos" era texto azul. */}
      <CascoDaTabela
        contagem={contarItens(total, "colaborador", "colaboradores")}
        busca={<DebouncedSearchInput placeholder="Buscar por nome…" className="w-64 max-w-full" />}
        filtros={
          <PessoasFilterButton
            search={search}
            companyId={companyId}
            companies={companies.map((c) => ({ id: c.id, name: nomeExibicao(c) }))}
            situacao={situacaoSelecionada(situacaoFiltro)}
            mostrarEmpresa
          />
        }
        acoes={
          ocultos > 0 ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-fs-2 text-fg-muted">
              <span>
                {ocultos} colaborador{ocultos !== 1 ? "es" : ""} inativo{ocultos !== 1 ? "s" : ""} fora desta lista.
              </span>
              <Button href={buildUrl({ situacao: SITUACAO_TODOS, page: "1" })} variant="ghost" size="xs">
                Mostrar todos
              </Button>
            </span>
          ) : undefined
        }
      >
        {people.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title={search || companyId ? "Nenhum colaborador encontrado" : "Nenhum colaborador cadastrado ainda"}
            description={
              search || companyId
                ? "Tente ajustar a busca ou os filtros."
                : "São as pessoas que trabalham nas empresas clientes, não a equipe do escritório."
            }
            action={
              // Era um <Button> dentro de um <Link> — botão dentro de link.
              !search && !companyId && canCreate ? (
                <Button href="/pessoas/nova?tipo=cliente">
                  <Plus size={14} />
                  Novo Colaborador
                </Button>
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
              companyName: p.currentCompany ? nomeExibicao(p.currentCompany) : null,
              companyId: p.currentCompany?.id ?? null,
              createdAtLabel: formatInstantDate(p.createdAt),
              linkedUserName: p.linkedUser?.name ?? null,
            }))}
            showLinkedUser={false}
            canCreate={canCreate}
            definirAtivoPessoasEmMassa={definirAtivoPessoasEmMassa}
            noCasco
          />
        )}
      </CascoDaTabela>

      <Pagination page={pageNum} totalPages={totalPages} buildHref={(n) => buildUrl({ page: String(n) })} total={total} rotulo="colaboradores" />
    </PageContainer>
  );
}
