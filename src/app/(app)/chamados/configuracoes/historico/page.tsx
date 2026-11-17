import { notFound } from "next/navigation";
import { CheckCircle2, CircleSlash, History, Loader, Scale } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { ImportarHistorico, RevisaoDoCaso } from "@/components/chamados/RevisaoDoHistorico";
import { contexto } from "@/lib/chamados/contexto";
import { podeGerenciar } from "@/lib/chamados/acesso";
import { caminhoDaCategoria, categoriasClassificaveis } from "@/lib/chamados/catalogo";
import { ehSituacaoDoCaso, type RespostaDaEquipe, type SituacaoDoCaso } from "@/lib/chamados/historico";
import { configDoHub } from "@/lib/chamados/hub";
import { getPrisma } from "@/lib/prisma";
import { formatInstantDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const POR_PAGINA = 25;

const ABAS: { chave: SituacaoDoCaso; rotulo: string; icone: React.ReactNode }[] = [
  { chave: "A_REVISAR", rotulo: "A revisar", icone: <Scale size={14} aria-hidden /> },
  { chave: "CONFIRMADO", rotulo: "Confirmados", icone: <CheckCircle2 size={14} aria-hidden /> },
  { chave: "DESCARTADO", rotulo: "Descartados", icone: <CircleSlash size={14} aria-hidden /> },
  { chave: "PROCESSANDO", rotulo: "A IA está lendo", icone: <Loader size={14} aria-hidden /> },
];

const VAZIO: Record<SituacaoDoCaso, string> = {
  A_REVISAR: "Nenhum caso esperando revisão.",
  CONFIRMADO: "Nenhum caso confirmado ainda.",
  DESCARTADO: "Nenhum caso descartado.",
  PROCESSANDO: "A IA não tem caso para ler agora.",
};

/**
 * O histórico de chamados do Hub (17/11/2026): os chamados antigos viram casos
 * para a triagem por IA aprender. A IA lê cada um com as respostas da equipe e
 * sugere a categoria; quando ela bate com a escolhida por quem pediu, o caso
 * vale sozinho; quando não bate, a equipe escolhe aqui.
 */
export default async function HistoricoDosChamadosPage({ searchParams }: { searchParams: Promise<{ aba?: string; pagina?: string }> }) {
  const c = await contexto().catch(() => null);
  if (!c || !podeGerenciar(c.ctx, c.config)) notFound();
  const params = await searchParams;
  const aba: SituacaoDoCaso = ehSituacaoDoCaso(params.aba) ? params.aba : "A_REVISAR";
  const pagina = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);
  const db = getPrisma();
  const tenantId = c.ctx.tenantId;

  const [contagens, casos, linhas, tenant] = await Promise.all([
    db.helpdeskHistoricCase.groupBy({ by: ["status"], where: { tenantId }, _count: { _all: true } }),
    db.helpdeskHistoricCase.findMany({
      where: { tenantId, status: aba },
      orderBy: [{ openedAt: "desc" }, { id: "asc" }],
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA + 1,
    }),
    db.helpdeskCategory.findMany({ where: { tenantId }, select: { id: true, name: true, parentId: true, active: true } }),
    db.tenant.findUnique({ where: { id: tenantId }, select: { slug: true } }),
  ]);
  const contagem = Object.fromEntries(contagens.map((x) => [x.status, x._count._all])) as Partial<Record<SituacaoDoCaso, number>>;
  const total = Object.values(contagem).reduce((s, n) => s + (n ?? 0), 0);
  const temProxima = casos.length > POR_PAGINA;
  const pagos = casos.slice(0, POR_PAGINA);
  const categorias = categoriasClassificaveis(linhas).map((cat) => ({ id: cat.id, caminho: caminhoDaCategoria(linhas, cat.id) }));
  const caminho = (id: string | null) => (id ? (categorias.find((x) => x.id === id)?.caminho ?? null) : null);
  const config = configDoHub(process.env);
  const ligado = Boolean(config && tenant?.slug === config.escritorio);
  const href = (a: SituacaoDoCaso, p = 1) => `/chamados/configuracoes/historico?aba=${a}${p > 1 ? `&pagina=${p}` : ""}`;

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Chamados", href: "/chamados" }, { label: "Configurações", href: "/chamados/configuracoes" }, { label: "Histórico do Hub" }]} />
      <PageHeader
        title="Histórico do Hub"
        subtitle={total > 0 ? `${total} ${total === 1 ? "caso" : "casos"}` : undefined}
        action={ligado ? <ImportarHistorico jaImportou={total > 0} /> : undefined}
      />

      {total === 0 ? (
        <Card>
          <EmptyState
            icon={<History size={22} />}
            title={ligado ? "O histórico ainda não foi trazido" : "Sem ligação com o Hub"}
            description={ligado ? "Os chamados do Hub aparecem aqui depois de “Trazer do Hub”." : "A ligação com o Hub não está configurada neste ambiente."}
          />
        </Card>
      ) : (
        <>
          <AbasDeLink
            aria-label="Situação dos casos"
            ativa={aba}
            abas={ABAS.filter((a) => a.chave !== "PROCESSANDO" || (contagem.PROCESSANDO ?? 0) > 0).map((a) => ({ ...a, href: href(a.chave), contagem: contagem[a.chave] ?? 0 }))}
          />
          {pagos.length === 0 ? (
            <Card>
              <EmptyState icon={<History size={22} />} title={VAZIO[aba]} />
            </Card>
          ) : (
            <ul className="flex flex-col gap-3">
              {pagos.map((caso) => (
                <li key={caso.id}>
                  <RevisaoDoCaso
                    caso={{
                      id: caso.id,
                      titulo: caso.title,
                      resumo: caso.summary,
                      descricao: caso.description,
                      solucao: caso.solution,
                      respostas: (caso.teamReplies as RespostaDaEquipe[]).filter((r) => !r.interno).map((r) => r.texto),
                      setor: caso.requesterSector,
                      abertoEm: formatInstantDate(caso.openedAt, { day: "2-digit", month: "short", year: "numeric" }),
                      situacao: caso.status as SituacaoDoCaso,
                      escolhidaNoHub: caso.originalCategory,
                      original: { id: caso.originalCategoryId, caminho: caminho(caso.originalCategoryId) },
                      sugerida: { id: caso.suggestedCategoryId, caminho: caminho(caso.suggestedCategoryId) },
                      final: caminho(caso.finalCategoryId),
                      revisadoPorAlguem: Boolean(caso.reviewedAt),
                      tags: (caso.tags as string[]) ?? [],
                    }}
                    categorias={categorias}
                  />
                </li>
              ))}
            </ul>
          )}
          {(pagina > 1 || temProxima) && (
            <div className="mt-4 flex items-center justify-between gap-2">
              {pagina > 1 ? <Button href={href(aba, pagina - 1)} variant="secondary">Anteriores</Button> : <span />}
              {temProxima && <Button href={href(aba, pagina + 1)} variant="secondary">Próximos</Button>}
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}
