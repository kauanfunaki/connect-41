import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { ArrowRight, Briefcase, CheckCircle2, DoorOpen, Loader, Plus, XCircle } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { VagaStatus } from "@/generated/prisma/enums";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
import { scopedVagaWhere } from "@/lib/auth/scope";
import { getSectorMaps } from "@/lib/sectors";
import { PageContainer } from "@/components/shared/PageContainer";
import { Pagination } from "@/components/shared/Pagination";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { FiltroDaColunaNaUrl, FiltrosDasColunasNaUrl } from "@/components/shared/FiltroDeColunas";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatInstantDate, formatarNumero } from "@/lib/format";
import { lerLista } from "@/lib/filtroNaUrl";
import { VAGA_STATUS_LABEL, VAGA_STATUS_STYLE, VAGA_STATUS_ORDER } from "@/lib/vagaStatus";
import { Selo } from "@/components/ui/Selo";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";

const PER_PAGE = 30;

// O rótulo do cartão vai no plural — o cartão conta vagas, o selo nomeia uma.
const ROTULO_DO_CARTAO: Record<VagaStatus, string> = {
  ABERTA: "Abertas",
  EM_ANDAMENTO: "Em andamento",
  ENCERRADA: "Encerradas",
  CANCELADA: "Canceladas",
};

const ICONE_DO_STATUS: Record<VagaStatus, React.ReactNode> = {
  ABERTA: <DoorOpen />,
  EM_ANDAMENTO: <Loader />,
  ENCERRADA: <CheckCircle2 />,
  CANCELADA: <XCircle />,
};

export default async function VagasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sectorCode?: string | string[]; companyId?: string; page?: string }>;
}) {
  const { status, sectorCode, companyId, page } = await searchParams;
  // Funil da coluna Setor (30/09): parâmetro repetido, um por setor escolhido.
  const setores = lerLista(sectorCode);
  const ctx = await getAuthContext();
  // Vaga e teste são do setor que contrata (o escopo já filtra); aqui só o
  // módulo ligado, que antes não era checado e deixava a tela abrir desligada.
  if (!(await isModuleEnabled(ctx.tenantId, "recrutamento_vagas"))) notFound();
  const { labels: sectorLabels } = await getSectorMaps(ctx.tenantId);

  const statusFilter =
    status && Object.values(VagaStatus).includes(status as VagaStatus)
      ? (status as VagaStatus)
      : undefined;

  const pageNum = Math.max(1, parseInt(page ?? "1"));
  const prisma = getPrisma();

  // O setor da URL entra num `AND` com o escopo, e não por cima dele: antes era
  // `{ ...scopedVagaWhere(ctx), sectorCode }`, e o `sectorCode` da URL
  // substituía o `sectorCode: { in: [...] }` do escopo — quem digitasse outro
  // setor no endereço via as vagas dele.
  const base = { ...scopedVagaWhere(ctx), ...(companyId ? { companyId } : {}) };
  const ondeSetor = setores.length > 0 ? { sectorCode: { in: setores } } : {};
  const ondeStatus = statusFilter ? { status: statusFilter } : {};
  const where = { AND: [base, ondeSetor, ondeStatus] };

  const [vagas, total, companies, porStatus, porSetor] = await Promise.all([
    prisma.vaga.findMany({
      where,
      orderBy: { openedAt: "desc" },
      skip: (pageNum - 1) * PER_PAGE,
      take: PER_PAGE,
      include: {
        company: { select: { id: true, name: true } },
        _count: { select: { candidaturas: true } },
      },
    }),
    prisma.vaga.count({ where }),
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // Os cartões contam cada situação sem o filtro de situação (senão, com
    // "Abertas" escolhido, os outros três cartões mostrariam zero); o funil de
    // setor conta sem o próprio filtro, em cascata com o resto.
    prisma.vaga.groupBy({ by: ["status"], where: { AND: [base, ondeSetor] }, _count: { _all: true } }),
    prisma.vaga.groupBy({ by: ["sectorCode"], where: { AND: [base, ondeStatus] }, _count: { _all: true } }),
  ]);
  const totalPages = Math.ceil(total / PER_PAGE);

  const contagem = Object.fromEntries(VAGA_STATUS_ORDER.map((s) => [s, 0])) as Record<VagaStatus, number>;
  for (const g of porStatus) contagem[g.status] = g._count._all;
  const semFiltroDeStatus = VAGA_STATUS_ORDER.reduce((soma, s) => soma + contagem[s], 0);

  const rotuloDoSetor = (code: string) => sectorLabels[code] ?? code;
  const opcoesDeSetor = porSetor
    .map((g) => ({ valor: g.sectorCode, rotulo: rotuloDoSetor(g.sectorCode), n: g._count._all }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR", { sensitivity: "base" }));

  // Carrega o funil (parâmetro repetido) junto: sem ele, virar a página ou
  // clicar num cartão apagava o filtro de setor.
  function buildUrl(overrides: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { status, companyId, page, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    for (const s of setores) q.append("sectorCode", s);
    const s = q.toString();
    return s ? `/vagas?${s}` : "/vagas";
  }

  const canCreateAny = vagas.length === 0
    ? true // ainda não dá pra saber o setor; o form em /vagas/novo faz a checagem real
    : vagas.some((v) => canManageSector(ctx, v.sectorCode));

  const seloDoStatus = (s: VagaStatus) => (
    <Selo cor={VAGA_STATUS_STYLE[s]}>
      {VAGA_STATUS_LABEL[s]}
    </Selo>
  );
  const candidatos = (n: number) => `${n} candidato${n !== 1 ? "s" : ""}`;

  return (
    <PageContainer>
      <PageHeader
        title="Vagas"
        subtitle={<>{total} vaga{total !== 1 ? "s" : ""}</>}
        action={<>{canCreateAny && (
          // Ícone no lugar do "+" escrito, sem `font-medium` por cima do
          // Button — o botão de criar das outras listas (DRG-17, 07/10/2026).
          <Button href="/vagas/novo" variant="primary">
            <Plus size={14} />
            Nova vaga
          </Button>
        )}</>}
      />

      {/* As quatro situações em cartão, com a contagem, e cada uma abre o seu
          recorte — eram pílulas sem número (conferência de 30/09). Clicar no
          cartão do recorte aberto volta para todas. */}
      <FaixaDeTotais
        itens={VAGA_STATUS_ORDER.map((s) => ({
          rotulo: ROTULO_DO_CARTAO[s],
          valor: formatarNumero(contagem[s], 0),
          icone: ICONE_DO_STATUS[s],
          tom: s === "ENCERRADA" || s === "CANCELADA" ? "text-fg-muted" : undefined,
          detalhe: statusFilter === s ? "mostrando agora" : undefined,
          ativo: statusFilter === s,
          href: buildUrl({ status: statusFilter === s ? undefined : s, page: undefined }),
        }))}
      />

      {/* Situação e empresa no botão "Filtros" — eram pílulas e um select que
          navegava sozinho. Setor é o funil da coluna. */}
      <CascoDaTabela
        contagem={contarItens(total, "vaga", "vagas")}
        filtros={
          <FiltrosDaTela
            naBarra
            campos={[
              {
                chave: "status",
                rotulo: "Situação",
                vazioLabel: `Todas (${semFiltroDeStatus})`,
                opcoes: VAGA_STATUS_ORDER.map((s) => ({ value: s, label: `${VAGA_STATUS_LABEL[s]} (${contagem[s]})` })),
              },
              {
                chave: "companyId",
                rotulo: "Empresa",
                vazioLabel: "Todas as empresas",
                opcoes: companies.map((c) => ({ value: c.id, label: c.name })),
              },
            ]}
          />
        }
      >
        <FiltrosDasColunasNaUrl colunas={[{ chave: "sectorCode", rotulo: "Setor" }]} />

        {vagas.length === 0 ? (
          // Sem repetir o botão de criar: ele mora no cabeçalho (5A, 08/10/2026).
          <EmptyState
            icon={<Briefcase />}
            title="Nenhuma vaga encontrada"
            description="Ajuste os filtros ou cadastre a primeira vaga do setor em “Nova vaga”."
          />
        ) : (
          <>
            <CartoesNoCelular>
              {vagas.map((v) => (
                <Link key={v.id} href={`/vagas/${v.id}`} className="block">
                  <Cartao className="hover:border-brand/40 transition-colors">
                    <TopoDoCartao nome={v.title} />
                    <InfoDoCartao>
                      {v.company.name} · {rotuloDoSetor(v.sectorCode)}
                    </InfoDoCartao>
                    <PeDoCartao>
                      {seloDoStatus(v.status)}
                      <span className="text-micro text-fg-muted tabular-nums">{candidatos(v._count.candidaturas)}</span>
                      <span className="ml-auto text-micro text-fg-muted tabular-nums">
                        {v.quantity} vaga{v.quantity !== 1 ? "s" : ""}
                      </span>
                    </PeDoCartao>
                  </Cartao>
                </Link>
              ))}
            </CartoesNoCelular>

            {/* Era uma lista de linhas-link, com setor, candidatos e quantidade
                numa frase só (até 30/09). Virou tabela no padrão do Connect —
                centralizada, com o funil de setor. A lista é paginada, então o
                funil filtra no servidor (`FiltroDaColunaNaUrl`). */}
            <TabelaNoDesktop padrao>
              <table className="w-full table-fixed min-w-[900px]">
                <colgroup>
                  <col />
                  <col className="w-[160px]" />
                  <col className="w-[132px]" />
                  <col className="w-[112px]" />
                  <col className="w-[104px]" />
                  <col className="w-[112px]" />
                  <col className="w-[96px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-border text-micro font-semibold uppercase tracking-wide text-fg-muted">
                    <th className="px-4 py-3">Vaga</th>
                    <th className="px-4 py-3">
                      <FiltroDaColunaNaUrl rotulo="Setor" chave="sectorCode" opcoes={opcoesDeSetor} />
                    </th>
                    <th className="px-4 py-3">Situação</th>
                    <th className="px-4 py-3">Candidatos</th>
                    <th className="px-4 py-3">Quantidade</th>
                    <th className="px-4 py-3">Aberta em</th>
                    <th className="px-4 py-3">
                      <span className="sr-only">Abrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {vagas.map((v) => (
                    <tr key={v.id} className="border-b border-border">
                      <td className="px-4 py-3 min-w-0">
                        <Link
                          href={`/vagas/${v.id}`}
                          className="block font-semibold text-fg hover:text-brand transition-colors truncate"
                          title={v.title}
                        >
                          {v.title}
                        </Link>
                        <span className="block text-micro text-fg-muted truncate" title={v.company.name}>
                          {v.company.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-fg-secondary truncate" title={rotuloDoSetor(v.sectorCode)}>
                        {rotuloDoSetor(v.sectorCode)}
                      </td>
                      <td className="px-4 py-3">{seloDoStatus(v.status)}</td>
                      <td className="px-4 py-3 text-fg-secondary">{v._count.candidaturas}</td>
                      <td className="px-4 py-3 text-fg-secondary">{v.quantity}</td>
                      <td className="px-4 py-3 text-fg-muted whitespace-nowrap">{formatInstantDate(v.openedAt)}</td>
                      <td className="px-4 py-3">
                        <Button href={`/vagas/${v.id}`} variant="secondary" size="xs">
                          Abrir <ArrowRight size={11} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabelaNoDesktop>
          </>
        )}
      </CascoDaTabela>

      <Pagination page={pageNum} totalPages={totalPages} buildHref={(p) => buildUrl({ page: String(p) })} total={total} rotulo="vagas" />
    </PageContainer>
  );
}
