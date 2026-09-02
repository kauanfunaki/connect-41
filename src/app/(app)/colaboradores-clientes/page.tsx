import Link from "next/link";
import { Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { PessoasTable } from "@/components/pessoas/PessoasTable";
import { PessoasFilterButton } from "@/components/pessoas/PessoasFilterButton";
import { getPrisma } from "@/lib/prisma";
import { PersonType } from "@/generated/prisma/enums";
import { getAuthContext, canWrite } from "@/lib/auth/context";
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
  const ctx = await getAuthContext();
  const canCreate = canWrite(ctx.role);

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
          <>{canCreate && (
            <Button href="/pessoas/nova?tipo=cliente" variant="primary" className="font-medium">+ Novo Colaborador</Button>
          )}</>
        }
      />

      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 max-w-xs">
          <DebouncedSearchInput placeholder="Buscar por nome…" />
        </div>
        <PessoasFilterButton
          search={search}
          companyId={companyId}
          companies={companies.map((c) => ({ id: c.id, name: nomeExibicao(c) }))}
          situacao={situacaoSelecionada(situacaoFiltro)}
          mostrarEmpresa
        />
      </div>

      {ocultos > 0 && (
        <p className="text-[12px] text-fg-muted mb-4">
          {ocultos} colaborador{ocultos !== 1 ? "es" : ""} inativo{ocultos !== 1 ? "s" : ""} fora desta lista.{" "}
          <Link href={buildUrl({ situacao: SITUACAO_TODOS, page: "1" })} className="text-brand hover:underline font-medium">
            Mostrar todos
          </Link>
        </p>
      )}

      {people.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users />}
            title={search || companyId ? "Nenhum colaborador encontrado" : "Nenhum colaborador cadastrado ainda"}
            description={
              search || companyId
                ? "Tente ajustar a busca ou os filtros."
                : "São as pessoas que trabalham nas empresas clientes, não a equipe da 41."
            }
            action={
              !search && !companyId && canCreate ? (
                <Link href="/pessoas/nova?tipo=cliente"><Button>+ Novo Colaborador</Button></Link>
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
            companyName: p.currentCompany ? nomeExibicao(p.currentCompany) : null,
            companyId: p.currentCompany?.id ?? null,
            createdAtLabel: formatInstantDate(p.createdAt),
            linkedUserName: p.linkedUser?.name ?? null,
          }))}
          showLinkedUser={false}
          canCreate={canCreate}
          definirAtivoPessoasEmMassa={definirAtivoPessoasEmMassa}
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
    </PageContainer>
  );
}
