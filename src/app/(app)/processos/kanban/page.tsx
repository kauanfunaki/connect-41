import { notFound } from "next/navigation";
import { List } from "lucide-react";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Button } from "@/components/ui/Button";
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
          <Button href="/processos" variant="secondary">
            <List size={14} /> Ver como lista
          </Button>
        }
      />

      {/* Responsável, prioridade e tipo no botão "Filtros" — era um
          formulário com três selects e "Filtrar" (conferência de 30/09). */}
      <FiltrosDaTela
        className="mb-4"
        campos={[
          {
            chave: "responsavel",
            rotulo: "Responsável",
            vazioLabel: "Todos",
            opcoes: [{ value: "nenhum", label: "Sem responsável" }, ...responsaveis.map((r) => ({ value: r.id, label: r.name }))],
          },
          { chave: "prioridade", rotulo: "Prioridade", vazioLabel: "Todas", opcoes: PRIORIDADES.map((p) => ({ value: p, label: PRIORIDADE_LABEL[p] })) },
          { chave: "tipo", rotulo: "Tipo", vazioLabel: "Todos", opcoes: tipos.map((t) => ({ value: t.id, label: t.name })) },
        ]}
      />

      <KanbanDeProcessos colunas={colunas} agora={agora} />
    </PageContainer>
  );
}
