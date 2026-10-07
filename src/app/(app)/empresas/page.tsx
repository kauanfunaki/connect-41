import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { Building2, Plus } from "lucide-react";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
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
import { idsDaPagina } from "@/lib/companyHierarchy";
import {
  resolveCompanyStatusFilter,
  companyStatusWhere,
  estaOcultandoInativas,
  valorSelecionado,
  STATUS_OCULTOS_POR_PADRAO,
  STATUS_TODOS,
} from "@/lib/companyStatusFilter";
import { atualizarStatusEmMassa, excluirEmpresasEmMassa } from "./actions";
import { Pagination } from "@/components/shared/Pagination";
import { opcoesDeRegime, ondeDoRegime, opcoesDeLocal, ondeDoLocal } from "@/lib/filtrosDaListaDeEmpresas";
import { lerLista } from "@/lib/filtroNaUrl";
import { FiltrosDasColunasNaUrl } from "@/components/shared/FiltroDeColunas";

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
  searchParams: Promise<{
    search?: string;
    status?: string;
    page?: string;
    cliente?: string;
    /** Funil das colunas — parâmetro repetido, um por valor escolhido. */
    regime?: string | string[];
    local?: string | string[];
  }>;
}) {
  const { search, status, page, cliente, regime, local } = await searchParams;
  const regimes = lerLista(regime);
  const locais = lerLista(local);
  const ctx = await getAuthContext();
  const canCreate = canWrite(ctx.role);
  const isSuperAdmin = ctx.role === "SUPER_ADMIN";

  const prisma = getPrisma();
  const pageNum = Math.max(1, parseInt(page ?? "1"));
  // Sem `?status=`, a listagem esconde inativas e canceladas — ver src/lib/companyStatusFilter.ts.
  const statusFiltro = resolveCompanyStatusFilter(status);
  const ocultandoInativas = estaOcultandoInativas(statusFiltro);
  const statusFilter = valorSelecionado(statusFiltro);

  const whereBase = {
    ...(await scopedCompanyWhere(ctx)),
    ...(search ? { OR: [{ name: { contains: search } }, { externalId: { contains: search } }] } : {}),
    ...companyStatusWhere(statusFiltro),
    // Vem do link "N empresas" em /clientes.
    ...(cliente ? { clientGroupId: cliente } : {}),
  };

  // Funil de Regime e Localização (polimento de 30/09). A lista é paginada,
  // então filtra aqui, na base inteira — ver `FiltroDaColunaNaUrl`. Primeiro
  // os regimes brutos que existem (o funil escolhe o resumo, e o `where`
  // precisa dos textos que resumem nele); depois as opções de cada coluna em
  // cascata: o funil de regime conta só o que passa pelo de local, e vice-versa.
  const brutos = await prisma.company.groupBy({ by: ["taxRegime"], where: whereBase });
  const ondeRegime = ondeDoRegime(regimes, brutos.map((b) => b.taxRegime));
  const ondeLocal = ondeDoLocal(locais);
  const [gruposDeRegime, gruposDeLocal] = await Promise.all([
    prisma.company.groupBy({ by: ["taxRegime"], where: { AND: [whereBase, ondeLocal] }, _count: { _all: true } }),
    prisma.company.groupBy({ by: ["city", "stateCode"], where: { AND: [whereBase, ondeRegime] }, _count: { _all: true } }),
  ]);
  const filtrosDeColuna = {
    regime: opcoesDeRegime(gruposDeRegime.map((g) => ({ taxRegime: g.taxRegime, n: g._count._all }))),
    local: opcoesDeLocal(gruposDeLocal.map((g) => ({ city: g.city, stateCode: g.stateCode, n: g._count._all }))),
  };
  const where = { AND: [whereBase, ondeRegime, ondeLocal] };
  const temFiltroDeColuna = regimes.length > 0 || locais.length > 0;

  // Quantas estão escondidas agora — a tela avisa em vez de deixar o usuário achar
  // que a base encolheu.
  const ocultas = ocultandoInativas
    ? await prisma.company.count({
        where: {
          ...(await scopedCompanyWhere(ctx)),
          ...(search ? { OR: [{ name: { contains: search } }, { externalId: { contains: search } }] } : {}),
          status: { in: STATUS_OCULTOS_POR_PADRAO },
          AND: [ondeRegime, ondeLocal],
        },
      })
    : 0;

  // Nome do cliente filtrado: sem ele o chip diria só "filtro ativo", e o
  // usuário não saberia por qual cliente está filtrando nem por que a busca
  // não acha uma empresa que ele sabe que existe.
  const clienteFiltrado = cliente
    ? await prisma.clientGroup.findFirst({ where: { id: cliente, tenantId: ctx.tenantId }, select: { name: true } })
    : null;

  // Alfabética em dois níveis: o bloco pelo nome do cliente, e as empresas
  // dentro dele pela razão social — que é o que a tela mostra, já que
  // `displayName` só existe em filial e repete o nome com o sufixo. Ordenar
  // pelo grupo primeiro é o que mantém as empresas de um mesmo cliente
  // adjacentes; sem isso o agrupamento da tela viraria confete.
  const ordem = [{ clientGroup: { name: "asc" as const } }, { name: "asc" as const }];

  // Duas consultas de propósito. A paginação conta MATRIZES, não linhas: com
  // `take: PER_PAGE` direto, uma matriz de 21 filiais era cortada no meio e as
  // remanescentes caíam soltas na página seguinte, sem matriz à vista. Esta
  // primeira consulta é rasa (dois campos) e serve só para decidir quem entra.
  const [esqueleto, total] = await Promise.all([
    prisma.company.findMany({ where, orderBy: ordem, select: { id: true, parentCompanyId: true } }),
    prisma.company.count({ where }),
  ]);

  const { ids, totalPaginas: totalPages } = idsDaPagina(esqueleto, pageNum, PER_PAGE);

  const companies = await prisma.company.findMany({
    where: { id: { in: ids } },
    orderBy: ordem,
    include: { clientGroup: { select: { id: true, name: true } } },
  });

  // Carrega o funil das colunas (parâmetro repetido) junto com o resto: sem
  // ele, virar a página ou "Mostrar todas" apagava o filtro de regime e local.
  function buildUrl(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { search, status, page, cliente, ...params };
    for (const [k, v] of Object.entries(merged)) {
      if (v) q.set(k, v);
    }
    for (const r of regimes) q.append("regime", r);
    for (const l of locais) q.append("local", l);
    return `/empresas?${q.toString()}`;
  }

  return (
    <PageContainer>
      <CadastrosTabsBar active="empresas" />

      <div id="cadastros-content">
      {/* Header */}
      <PageHeader
        title="Empresas"
        subtitle="As empresas atendidas, agrupadas por cliente."
        action={<>{canCreate && (
          <Button
            href="/empresas/nova"
            variant="primary"
          >
            <Plus size={14} /> Nova empresa
          </Button>
        )}</>}
      />

      {/* Filtro por cliente vem de um link de /clientes. Sem uma saída visível,
          o usuário buscava outra empresa, não achava, e concluía que ela não
          existe — o filtro continuava ativo na URL, invisível. */}
      {cliente && (
        <div className="flex items-center gap-2 mb-4">
          <span className="inline-flex items-center gap-2 h-7 pl-3 pr-2 rounded-full bg-brand/10 text-brand text-[length:var(--fs-2)] font-medium">
            Cliente: {clienteFiltrado?.name ?? "desconhecido"}
            <Link
              href={buildUrl({ cliente: undefined, page: "1" })}
              aria-label="Remover filtro de cliente"
              className="grid place-items-center w-4 h-4 rounded-full hover:bg-brand/20 transition-colors"
            >
              ×
            </Link>
          </span>
          <span className="text-[length:var(--fs-2)] text-fg-muted">
            A busca e os filtros só enxergam as empresas deste cliente.
          </span>
        </div>
      )}

      {/* Esconder sem avisar faria a base parecer menor do que é. */}
      {/* Revisão de 05/10: botão não é link — o "Mostrar todas" era texto azul. */}
      {ocultas > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[length:var(--fs-2)] text-fg-muted mb-4">
          <p>
            {ocultas} empresa{ocultas !== 1 ? "s" : ""} inativa{ocultas !== 1 ? "s" : ""} ou cancelada
            {ocultas !== 1 ? "s" : ""} fora desta lista.
          </p>
          <Button href={buildUrl({ status: STATUS_TODOS, page: "1" })} variant="ghost" size="xs">
            Mostrar todas
          </Button>
        </div>
      )}

      {/* Contagem, busca e filtro na barra do casco (07/10/2026), como as
          filas irmãs de 05/10: eram a busca e o filtro soltos acima da
          tabela, a contagem no subtítulo e o vazio num cartão à parte. O
          painel do Filtros continua o mesmo (modelo aprovado), na barra. */}
      <CascoDaTabela
        contagem={contarItens(total, "empresa", "empresas")}
        busca={<DebouncedSearchInput placeholder="Buscar por nome ou ID…" className="w-72 max-w-full" />}
        filtros={<EmpresasFilterButton search={search} page={page} statusFilter={statusFilter} tabs={FILTER_TABS} />}
      >
      {/* Fica acima da tabela e do estado vazio: é por aqui que se desfaz o
          funil quando ele esvazia a lista. */}
      <FiltrosDasColunasNaUrl
        colunas={[
          { chave: "regime", rotulo: "Regime" },
          { chave: "local", rotulo: "Localização" },
        ]}
      />

      {companies.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title={search || statusFilter || temFiltroDeColuna ? "Nenhuma empresa encontrada" : "Nenhuma empresa cadastrada ainda"}
          description={
            search || statusFilter || temFiltroDeColuna
              ? "Tente ajustar a busca ou os filtros."
              : "Comece cadastrando a primeira empresa do tenant."
          }
          action={
            !search && !statusFilter && !temFiltroDeColuna && canCreate ? (
              <Button href="/empresas/nova"><Plus size={14} /> Nova empresa</Button>
            ) : undefined
          }
        />
      ) : (
        <EmpresasTable
          companies={companies.map((c) => ({
            id: c.id,
            name: c.name,
            displayName: c.displayName,
            externalId: c.externalId,
            kind: c.kind,
            cnpj: c.cnpj,
            cpf: c.cpf,
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
          filtrosDeColuna={filtrosDeColuna}
        />
      )}
      </CascoDaTabela>

      <Pagination page={pageNum} totalPages={totalPages} buildHref={(n) => buildUrl({ page: String(n) })} />
      </div>
    </PageContainer>
  );
}
