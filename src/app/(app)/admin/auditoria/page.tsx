import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { ScrollText } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { FiltroDaColunaNaUrl, FiltrosDasColunasNaUrl } from "@/components/shared/FiltroDeColunas";
import { lerLista } from "@/lib/filtroNaUrl";
import { Pagination } from "@/components/shared/Pagination";
import { Badge } from "@/components/ui/Badge";
import { CampoPeriodo } from "@/components/ui/CampoPeriodo";
import { formatInstantDateTime } from "@/lib/format";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";

const ACTION_LABEL: Record<string, string> = {
  "company.create": "criou a empresa",
  "company.update": "editou a empresa",
  "company.delete": "excluiu a empresa",
  "person.create": "criou a pessoa",
  "person.update": "editou a pessoa",
  "person.delete": "excluiu a pessoa",
  "handoff.create": "solicitou transferência",
  "handoff.accept": "aceitou transferência",
  "handoff.reject": "rejeitou transferência",
  "handoff.assign": "atribuiu responsável de transferência",
  "sector.create": "criou o setor",
  "sector.update": "editou o setor",
  "tag.create": "criou a tag",
  "tag.update": "editou a tag",
  "tag.delete": "excluiu a tag",
  "customfield.create": "criou o campo customizado",
  "customfield.update": "editou o campo customizado",
  "customfield.delete": "excluiu o campo customizado",
  "branch.create": "criou a filial",
  "branch.update": "editou a filial",
  "competency.create": "criou a competência",
  "competency.update": "editou a competência",
  "competency.delete": "excluiu a competência",
  "holiday.create": "cadastrou o feriado",
  "holiday.delete": "excluiu o feriado",
  "holiday.import": "importou feriados nacionais",
  "module.enable": "ativou o módulo",
  "module.disable": "desativou o módulo",
  "user.create": "criou o usuário",
  "user.update": "editou o usuário",
  "user.activate": "ativou o usuário",
  "user.deactivate": "desativou o usuário",
  "tenant.update": "editou os dados do tenant",
  "tenant.ai.update": "configurou a integração de IA",
  "tenant.ai.remove": "removeu a configuração de IA",
  "companyservice.create": "adicionou um setor contratado",
  "companyservice.assign": "atribuiu responsável de setor",
  "meeting.create": "agendou uma reunião",
  "meeting.update": "editou uma reunião",
  "meeting.delete": "removeu uma reunião",
  "integration.connect": "conectou uma integração",
  "integration.disconnect": "desconectou uma integração",
  "lead.situacao": "mudou a situação do lead",
  "lead.responsavel": "trocou o responsável do lead",
  "lead.observacoes": "editou as observações do lead",
  "lead.excluido": "excluiu um lead",
};

const PER_PAGE = 50;

function describeMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const entries = Object.entries(metadata as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (entries.length === 0) return null;
  return entries.map(([k, v]) => `${k}: ${v}`).join(" · ");
}

// Só SUPER_ADMIN acessa — trilha de auditoria é informação sensível cross-setor.
export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{
    /** Funil das colunas Usuário e Ação — parâmetro repetido, um por valor escolhido. */
    userId?: string | string[];
    action?: string | string[];
    entityType?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  const { userId, action, entityType, from, to, page } = await searchParams;
  const usuarios = lerLista(userId);
  const acoes = lerLista(action);
  const ctx = await getAuthContext();
  if (ctx.role !== "SUPER_ADMIN") notFound();

  const prisma = getPrisma();
  const pageNum = Math.max(1, parseInt(page ?? "1"));

  const base = {
    tenantId: ctx.tenantId,
    ...(entityType ? { entityType } : {}),
    ...(from || to
      ? {
          createdAt: {
            ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
            ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  };
  // Funil de Usuário e Ação (02/10). A trilha é paginada, então filtra aqui,
  // na base inteira — ver `FiltroDaColunaNaUrl`. Cada funil conta sem o
  // próprio filtro, em cascata com o outro.
  const ondeUsuario = usuarios.length > 0 ? { userId: { in: usuarios } } : {};
  const ondeAcao = acoes.length > 0 ? { action: { in: acoes } } : {};
  const where = { AND: [base, ondeUsuario, ondeAcao] };

  const [logs, total, users, porUsuario, porAcao, entityTypeRows] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (pageNum - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { user: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({
      where: { tenantId: ctx.tenantId },
      select: { id: true, name: true },
    }),
    prisma.auditLog.groupBy({ by: ["userId"], where: { AND: [base, ondeAcao] }, _count: { _all: true } }),
    prisma.auditLog.groupBy({ by: ["action"], where: { AND: [base, ondeUsuario] }, _count: { _all: true } }),
    prisma.auditLog.findMany({
      where: { tenantId: ctx.tenantId, entityType: { not: null } },
      distinct: ["entityType"],
      select: { entityType: true },
      orderBy: { entityType: "asc" },
    }),
  ]);

  const totalPages = Math.ceil(total / PER_PAGE);
  const hasFilters = !!(usuarios.length > 0 || acoes.length > 0 || entityType || from || to);

  const porNome = (a: { rotulo: string }, b: { rotulo: string }) =>
    a.rotulo.localeCompare(b.rotulo, "pt-BR", { sensitivity: "base" });
  const nomeDoUsuario = new Map(users.map((u) => [u.id, u.name]));
  const opcoesDeUsuario = porUsuario
    .map((g) => ({ valor: g.userId, rotulo: nomeDoUsuario.get(g.userId) ?? g.userId, n: g._count._all }))
    .sort(porNome);
  const opcoesDeAcao = porAcao
    .map((g) => ({ valor: g.action, rotulo: ACTION_LABEL[g.action] ?? g.action, n: g._count._all }))
    .sort(porNome);

  // Carrega o funil (parâmetro repetido) junto: sem ele, virar a página ou
  // limpar o período apagava o filtro de usuário e de ação.
  function buildUrl(params: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const merged = { entityType, from, to, page, ...params };
    for (const [k, v] of Object.entries(merged)) {
      if (v) q.set(k, v);
    }
    for (const u of usuarios) q.append("userId", u);
    for (const a of acoes) q.append("action", a);
    return `/admin/auditoria?${q.toString()}`;
  }

  return (
    <PageContainer>
      <PageHeader
        title="Auditoria"
        subtitle={<>{total} {total === 1 ? "ação registrada" : "ações registradas"} neste workspace — criação, edição e
          exclusão em Empresas, Pessoas, Transferências e Configurações.</>}
      />

      {/* Entidade no botão "Filtros"; usuário e ação viraram o funil das
          colunas (02/10). O período fica ao lado, porque data se digita, não
          se escolhe numa lista (conferência de 30/09). */}
      <CascoDaTabela
        contagem={contarItens(total, "ação", "ações")}
        filtros={
          <FiltrosDaTela
            naBarra
            campos={[
              {
                chave: "entityType",
                rotulo: "Entidade",
                vazioLabel: "Todas as entidades",
                opcoes: entityTypeRows.map((r) => ({ value: r.entityType as string, label: r.entityType as string })),
              },
            ]}
          />
        }
        acoes={
          <form method="GET" action="/admin/auditoria" className="flex flex-wrap items-center gap-2">
            {usuarios.map((u) => (
              <input key={`u-${u}`} type="hidden" name="userId" value={u} />
            ))}
            {acoes.map((a) => (
              <input key={`a-${a}`} type="hidden" name="action" value={a} />
            ))}
            {entityType && <input type="hidden" name="entityType" value={entityType} />}
            <CampoPeriodo compact nomeDe="from" nomeAte="to" defaultDe={from ?? ""} defaultAte={to ?? ""} className="w-72 max-w-full" />
            <Button type="submit" variant="secondary" size="sm">
              Filtrar período
            </Button>
            {(from || to) && (
              <Button href={buildUrl({ from: undefined, to: undefined, page: undefined })} variant="ghost" size="sm">
                Limpar período
              </Button>
            )}
          </form>
        }
      >

        {/* Acima da tabela e do estado vazio: é por aqui que se desfaz o funil
            quando ele esvazia a lista. */}
        <FiltrosDasColunasNaUrl
          colunas={[
            { chave: "userId", rotulo: "Usuário" },
            { chave: "action", rotulo: "Ação" },
          ]}
        />

        {logs.length === 0 ? (
          <EmptyState
            icon={<ScrollText />}
            title={hasFilters ? "Nenhuma ação encontrada com esses filtros." : "Nenhuma ação registrada ainda."}
          />
        ) : (
          // Tabela no casco padrão (era uma lista de linhas soltas). A trilha é
          // paginada, então o funil de usuário e de ação filtra no servidor
          // (`FiltroDaColunaNaUrl`), com as contagens da base inteira.
          <div className="c41-tabela overflow-x-auto bg-surface border border-border rounded-lg">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr className="border-b border-border text-[11px] uppercase tracking-wide text-fg-muted">
                  <th className="px-4 py-3">Quando</th>
                  <th className="px-4 py-3">
                    <FiltroDaColunaNaUrl rotulo="Usuário" chave="userId" opcoes={opcoesDeUsuario} />
                  </th>
                  <th className="px-4 py-3">
                    <FiltroDaColunaNaUrl rotulo="Ação" chave="action" opcoes={opcoesDeAcao} />
                  </th>
                  <th className="px-4 py-3">Entidade</th>
                  <th className="px-4 py-3">Detalhe</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const detail = describeMetadata(log.metadata);
                  return (
                    <tr key={log.id} className="border-b border-border">
                      <td className="px-4 py-3 text-fg-muted whitespace-nowrap">
                        {formatInstantDateTime(log.createdAt, {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 font-medium text-fg">{log.user.name}</td>
                      <td className="px-4 py-3 text-fg-secondary">{ACTION_LABEL[log.action] ?? log.action}</td>
                      <td className="px-4 py-3">
                        {log.entityType ? <Badge variant="info">{log.entityType}</Badge> : <span className="text-fg-muted">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {detail ? (
                          <span className="block max-w-[320px] text-[11px] text-fg-muted font-mono truncate" title={detail}>
                            {detail}
                          </span>
                        ) : (
                          <span className="text-fg-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CascoDaTabela>

      <Pagination
        page={pageNum}
        totalPages={totalPages}
        buildHref={(p) => buildUrl({ page: String(p) })}
        total={total}
        rotulo={total === 1 ? "ação" : "ações"}
      />
    </PageContainer>
  );
}
