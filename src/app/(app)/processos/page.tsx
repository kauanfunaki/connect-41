import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { listarFila, contarPorSituacao, feriadosDoTenant } from "@/lib/societario/fila";
import type { SituacaoDoProcesso } from "@/lib/societario/processo";
import { PRIORIDADES, PRIORIDADE_LABEL, ehPrioridade } from "@/lib/societario/prioridade";
import { ProcessosFila, SITUACAO_LABEL } from "@/components/societario/ProcessosFila";
import { NovoProcessoForm } from "@/components/societario/NovoProcessoForm";
import { AssistenteDoSocietario } from "@/components/societario/AssistenteDoSocietario";
import { getPrisma } from "@/lib/prisma";
import { getSectorUsers } from "@/lib/sectorUsers";
import { nomeExibicao } from "@/lib/companyName";
import { abrirProcesso } from "./actions";

// `SECTOR` é o setor de origem, usado só como padrão: acesso e equipe seguem o
// setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = "societario";
const MODULE = "societario_processos";

export const dynamic = "force-dynamic";

// A ordem do recorte é a da fila: o que depende de gente primeiro.
const RECORTES: { chave: string; situacao?: SituacaoDoProcesso }[] = [
  { chave: "todos" },
  { chave: "exigencia", situacao: "EM_EXIGENCIA" },
  { chave: "orgao", situacao: "AGUARDANDO_ORGAO" },
  { chave: "andamento", situacao: "EM_ANDAMENTO" },
];

export default async function ProcessosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  // Gate de módulo além do gate de setor: o módulo é vendido por plano, e quem
  // é do societário num tenant que não contratou não deve ver a tela.
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const params = await searchParams;
  const recorte = RECORTES.find((r) => r.chave === params.situacao) ?? RECORTES[0];

  const feriados = await feriadosDoTenant(ctx.tenantId);
  const agora = new Date();
  const prisma = getPrisma();

  const [empresas, tipos, responsaveis] = await Promise.all([
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROSPECT"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, displayName: true },
    }),
    prisma.processType.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, expectedDaysMin: true, expectedDaysMax: true, variableFlow: true },
    }),
    getSectorUsers(ctx.tenantId, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR),
  ]);

  // Os filtros da URL só valem quando são valores conhecidos: o parâmetro é
  // texto do usuário, e um id desconhecido viraria uma fila vazia sem motivo.
  const responsavelFiltro =
    params.responsavel === "nenhum" || responsaveis.some((r) => r.id === params.responsavel)
      ? params.responsavel
      : undefined;
  const prioridadeFiltro = ehPrioridade(params.prioridade) ? params.prioridade : undefined;
  const filtroAtivo = Boolean(responsavelFiltro || prioridadeFiltro);

  // A fila inteira do filtro vem sempre: os contadores do recorte precisam do
  // total, e uma segunda consulta só para contar discordaria da primeira no
  // instante em que alguém gravasse algo entre as duas.
  const todas = await listarFila(
    ctx.tenantId,
    { responsavelId: responsavelFiltro, prioridade: prioridadeFiltro },
    feriados,
    agora
  );
  const contagem = contarPorSituacao(todas);
  const linhas = recorte.situacao ? todas.filter((l) => l.situacao === recorte.situacao) : todas;

  const filtrosNaUrl = new URLSearchParams();
  if (responsavelFiltro) filtrosNaUrl.set("responsavel", responsavelFiltro);
  if (prioridadeFiltro) filtrosNaUrl.set("prioridade", prioridadeFiltro);
  const hrefDoRecorte = (chave: string) => {
    const q = new URLSearchParams(filtrosNaUrl);
    if (chave !== "todos") q.set("situacao", chave);
    const s = q.toString();
    return s ? `/processos?${s}` : "/processos";
  };

  return (
    <PageContainer>
      <BackButton className="mb-3" />

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <PageHeader title="Processos" />
          <p className="text-[13px] text-fg-muted mt-1">
            Constituição, alteração contratual, baixa e alvarás — com protocolo, exigência e prazo.
          </p>
        </div>
        <div className="flex items-center gap-3">
        <Link
          href={filtrosNaUrl.size > 0 ? `/processos/kanban?${filtrosNaUrl}` : "/processos/kanban"}
          className="text-[13px] text-brand hover:underline whitespace-nowrap"
        >
          Ver no kanban
        </Link>
        <NovoProcessoForm
          empresas={empresas.map((e) => ({ value: e.id, label: nomeExibicao(e) }))}
          tipos={tipos.map((t) => ({
            id: t.id,
            name: t.name,
            // O prazo entra no rótulo porque é o que diferencia Constituição de
            // Alteração na hora de escolher — as duas têm o mesmo roteiro.
            prazo: t.variableFlow
              ? "fluxo variável"
              : t.expectedDaysMin === t.expectedDaysMax
                ? `${t.expectedDaysMax} dias úteis`
                : `${t.expectedDaysMin}–${t.expectedDaysMax} dias úteis`,
          }))}
          responsaveis={responsaveis}
          responsavelPadrao={responsaveis.some((r) => r.id === ctx.userId) ? (ctx.userId ?? "") : ""}
          abrirAction={abrirProcesso}
        />
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {RECORTES.map((r) => {
          const ativo = r.chave === recorte.chave;
          const total = r.situacao ? contagem[r.situacao] : todas.length;
          const rotulo = r.situacao ? SITUACAO_LABEL[r.situacao] : "Todos";
          return (
            <Link
              key={r.chave}
              href={hrefDoRecorte(r.chave)}
              aria-current={ativo ? "page" : undefined}
              className={
                ativo
                  ? "h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-brand/40 bg-brand/8 text-brand text-[12px] font-medium"
                  : "h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border text-fg-secondary text-[12px] hover:bg-surface-hover transition-colors"
              }
            >
              {rotulo}
              <span className="tabular-nums text-fg-muted">{total}</span>
            </Link>
          );
        })}
      </div>

      {/* Filtro por GET: a URL guarda o recorte, e quem manda o link para um
          colega manda a mesma fila que está vendo. */}
      <form method="get" action="/processos" className="flex flex-wrap items-end gap-2 mb-4">
        {recorte.chave !== "todos" && <input type="hidden" name="situacao" value={recorte.chave} />}
        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-responsavel" className="text-[11px] text-fg-muted">
            Responsável
          </label>
          <Select id="filtro-responsavel" name="responsavel" defaultValue={responsavelFiltro ?? ""} compact>
            <option value="">Todos</option>
            <option value="nenhum">Sem responsável</option>
            {responsaveis.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-prioridade" className="text-[11px] text-fg-muted">
            Prioridade
          </label>
          <Select id="filtro-prioridade" name="prioridade" defaultValue={prioridadeFiltro ?? ""} compact>
            <option value="">Todas</option>
            {PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {PRIORIDADE_LABEL[p]}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" size="sm" variant="secondary">
          Filtrar
        </Button>
        {filtroAtivo && (
          <Link
            href={recorte.chave === "todos" ? "/processos" : `/processos?situacao=${recorte.chave}`}
            className="h-8 inline-flex items-center text-[12px] text-brand hover:underline"
          >
            Limpar filtros
          </Link>
        )}
      </form>

      <ProcessosFila
        linhas={linhas}
        filtrado={linhas.length === 0 && (todas.length > 0 || filtroAtivo)}
        agora={agora}
      />

      <div className="mt-6">
        <AssistenteDoSocietario />
      </div>
    </PageContainer>
  );
}
