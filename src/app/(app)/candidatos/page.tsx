import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { UserSearch } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { canManageSector } from "@/lib/auth/context";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { CandidatosTable } from "@/components/candidatos/CandidatosTable";
import { PageContainer } from "@/components/shared/PageContainer";
import { Pagination } from "@/components/shared/Pagination";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { formatInstantDate } from "@/lib/format";
import { lerLista } from "@/lib/filtrosDaListaDeEmpresas";
import { EmptyState } from "@/components/ui/EmptyState";
import { inativarCandidatosEmMassa } from "./actions";
import { FiltrosDasColunasNaUrl } from "@/components/shared/FiltroDeColunas";

const PER_PAGE = 20;

// Inativados em massa continuavam poluindo a lista (a coluna Status existia,
// o filtro não) — por isso o default é "ativos", com saída explícita.
const STATUS_FILTERS = [
  { value: "ativos", label: "Ativos" },
  { value: "inativos", label: "Inativos" },
  { value: "todos", label: "Todos" },
] as const;

export default async function CandidatosPage({
  searchParams,
}: {
  /** `tag` é o funil da coluna Tags — parâmetro repetido, um por tag escolhida. */
  searchParams: Promise<{ search?: string; page?: string; tag?: string | string[]; status?: string }>;
}) {
  const { search, page, tag, status } = await searchParams;
  const tagsEscolhidas = lerLista(tag);
  const { ctx, setor } = await abrirTelaDoModulo("recrutamento_candidatos");
  const canCreate = canManageSector(ctx, setor);

  const prisma = getPrisma();
  const pageNum = Math.max(1, parseInt(page ?? "1"));

  const statusFilter = STATUS_FILTERS.some((s) => s.value === status) ? status! : "ativos";
  const activeWhere =
    statusFilter === "todos" ? {} : { active: statusFilter === "ativos" };

  // Busca agora cobre e-mail e CPF além do nome — o banco de talentos era
  // pesquisável só por nome, mas o recrutador chega pelo contato com frequência.
  const searchTerm = search?.trim();
  const searchWhere = searchTerm
    ? {
        OR: [
          { name: { contains: searchTerm } },
          { email: { contains: searchTerm } },
          { cpf: { contains: searchTerm.replace(/\D/g, "") || searchTerm } },
        ],
      }
    : {};

  const base = {
    tenantId: ctx.tenantId,
    type: "CANDIDATO" as const,
    ...activeWhere,
    ...searchWhere,
  };

  // Funil da coluna Tags (polimento de 30/09) — era o select "Tag" do botão de
  // filtros, uma tag por vez. A lista é paginada, então filtra aqui, na base
  // inteira (`FiltroDaColunaNaUrl`): marcar duas tags traz quem tem qualquer
  // uma delas, e "(vazio)" traz quem não tem nenhuma. Vai num `AND` porque a
  // busca também usa `OR`.
  const idsDeTag = tagsEscolhidas.filter(Boolean);
  const alternativasDeTag = [
    ...(idsDeTag.length > 0 ? [{ tags: { some: { tagId: { in: idsDeTag } } } }] : []),
    ...(tagsEscolhidas.includes("") ? [{ tags: { none: {} } }] : []),
  ];
  const ondeTag = alternativasDeTag.length > 0 ? { OR: alternativasDeTag } : {};
  const where = { AND: [base, ondeTag] };

  const [candidatos, total, gruposDeTag, semTag] = await Promise.all([
    prisma.person.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        _count: { select: { candidaturas: true } },
        tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
      },
    }),
    prisma.person.count({ where }),
    // As opções do funil e as contagens: sobre a base sem o próprio filtro de
    // tag, como no Excel. Uma pessoa com duas tags conta nas duas.
    prisma.personTag.groupBy({ by: ["tagId"], where: { person: base }, _count: { _all: true } }),
    prisma.person.count({ where: { AND: [base, { tags: { none: {} } }] } }),
  ]);
  const nomesDasTags = await prisma.tag.findMany({
    where: { tenantId: ctx.tenantId, id: { in: gruposDeTag.map((g) => g.tagId) } },
    select: { id: true, name: true },
  });
  const nomeDaTag = new Map(nomesDasTags.map((t) => [t.id, t.name]));
  const opcoesDeTag = [
    ...gruposDeTag
      .filter((g) => nomeDaTag.has(g.tagId))
      .map((g) => ({ valor: g.tagId, rotulo: nomeDaTag.get(g.tagId)!, n: g._count._all }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR", { sensitivity: "base" })),
    ...(semTag > 0 ? [{ valor: "", rotulo: "(sem tag)", n: semTag }] : []),
  ];

  const totalPages = Math.ceil(total / PER_PAGE);

  // Carrega o funil (parâmetro repetido) junto: sem ele, virar a página
  // apagava o filtro de tag.
  function buildUrl(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { search, page, status, ...params };
    for (const [k, v] of Object.entries(merged)) {
      if (v) q.set(k, v);
    }
    for (const t of tagsEscolhidas) q.append("tag", t);
    return `/candidatos?${q.toString()}`;
  }

  return (
    <PageContainer>
      <PageHeader
        title="Candidatos"
        subtitle={<>{total} candidato{total !== 1 ? "s" : ""} no banco de talentos</>}
        action={<>{canCreate && (
          <Button
            href="/candidatos/nova"
            variant="primary" className="font-medium"
          >
            + Novo Candidato
          </Button>
        )}</>}
      />
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="w-full max-w-xs">
          <DebouncedSearchInput placeholder="Buscar por nome, e-mail ou CPF…" />
        </div>

        {/* Situação no botão "Filtros" (o padrão é "Ativos", sem parâmetro);
            a tag é o funil da coluna — eram os dois no painel antigo. */}
        <FiltrosDaTela
          campos={[
            {
              chave: "status",
              rotulo: "Situação",
              vazioLabel: "Ativos",
              opcoes: STATUS_FILTERS.filter((s) => s.value !== "ativos").map((s) => ({ value: s.value, label: s.label })),
            },
          ]}
        />
      </div>

      <FiltrosDasColunasNaUrl colunas={[{ chave: "tag", rotulo: "Tags" }]} />

      {candidatos.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UserSearch />}
            title={
              searchTerm || tagsEscolhidas.length > 0 || statusFilter !== "ativos"
                ? "Nenhum candidato encontrado com esses filtros."
                : "Nenhum candidato cadastrado ainda."
            }
          />
        </Card>
      ) : (
        <CandidatosTable
          candidatos={candidatos.map((c) => ({
            id: c.id,
            name: c.name,
            active: c.active,
            cpf: c.cpf,
            email: c.email,
            candidaturasCount: c._count.candidaturas,
            createdAtLabel: formatInstantDate(c.createdAt),
            tags: c.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
          }))}
          canCreate={canCreate}
          inativarCandidatosEmMassa={inativarCandidatosEmMassa}
          opcoesDeTag={opcoesDeTag}
        />
      )}

      <Pagination
        page={pageNum}
        totalPages={totalPages}
        buildHref={(p) => buildUrl({ page: String(p) })}
        total={total}
        rotulo="candidatos"
      />
    </PageContainer>
  );
}
