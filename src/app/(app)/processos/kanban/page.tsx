import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { getPrisma } from "@/lib/prisma";
import { getSectorUsers } from "@/lib/sectorUsers";
import { listarFila, feriadosDoTenant } from "@/lib/societario/fila";
import { PRIORIDADES, PRIORIDADE_LABEL, ehPrioridade } from "@/lib/societario/prioridade";
import { colunasDoKanban, DIAS_DE_CONCLUIDOS_RECENTES } from "@/lib/societario/prazos";
import { listarConcluidosRecentes } from "@/lib/societario/painel-data";
import { KanbanDeProcessos } from "@/components/societario/KanbanDeProcessos";

// Sub-rota de Processos, e não módulo próprio: é outra leitura da mesma fila.
// Não confundir com `/kanban`, que é o pipeline genérico de handoff.
const MODULE = "societario_processos";
// `SECTOR` é o setor de origem, usado só como padrão: acesso e equipe seguem o
// setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = getModuleDef(MODULE)!.sectorCode;

export const dynamic = "force-dynamic";

export default async function KanbanDeProcessosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canViewSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const params = await searchParams;
  const prisma = getPrisma();
  const [responsaveis, tipos, feriados] = await Promise.all([
    getSectorUsers(ctx.tenantId, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR),
    prisma.processType.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    feriadosDoTenant(ctx.tenantId),
  ]);

  // Mesmo cuidado de /processos: parâmetro desconhecido é ignorado, não vira
  // um quadro vazio sem explicação.
  const filtro = {
    responsavelId:
      params.responsavel === "nenhum" || responsaveis.some((r) => r.id === params.responsavel)
        ? params.responsavel
        : undefined,
    prioridade: ehPrioridade(params.prioridade) ? params.prioridade : undefined,
    tipoId: tipos.some((t) => t.id === params.tipo) ? params.tipo : undefined,
  };
  const filtroAtivo = Boolean(filtro.responsavelId || filtro.prioridade || filtro.tipoId);

  const agora = new Date();
  const [abertos, concluidos] = await Promise.all([
    listarFila(ctx.tenantId, filtro, feriados, agora),
    listarConcluidosRecentes(ctx.tenantId, filtro, feriados, agora, DIAS_DE_CONCLUIDOS_RECENTES),
  ]);
  const colunas = colunasDoKanban([...abertos, ...concluidos]);

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <PageHeader
        title="Kanban de processos"
        subtitle="A coluna é a situação que os protocolos dizem — muda quando o desfecho é registrado no processo, não arrastando o cartão."
        action={
          <Link href="/processos" className="text-[13px] text-brand hover:underline">
            Ver como lista
          </Link>
        }
      />

      <form method="get" action="/processos/kanban" className="flex flex-wrap items-end gap-2 mb-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-responsavel" className="text-[11px] text-fg-muted">
            Responsável
          </label>
          <Select id="filtro-responsavel" name="responsavel" defaultValue={filtro.responsavelId ?? ""} compact>
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
          <Select id="filtro-prioridade" name="prioridade" defaultValue={filtro.prioridade ?? ""} compact>
            <option value="">Todas</option>
            {PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {PRIORIDADE_LABEL[p]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="filtro-tipo" className="text-[11px] text-fg-muted">
            Tipo
          </label>
          <Select id="filtro-tipo" name="tipo" defaultValue={filtro.tipoId ?? ""} compact>
            <option value="">Todos</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" size="sm" variant="secondary">
          Filtrar
        </Button>
        {filtroAtivo && (
          <Link href="/processos/kanban" className="h-8 inline-flex items-center text-[12px] text-brand hover:underline">
            Limpar filtros
          </Link>
        )}
      </form>

      <KanbanDeProcessos colunas={colunas} agora={agora} />
    </PageContainer>
  );
}
