import { notFound } from "next/navigation";
import { List } from "lucide-react";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { contarItens } from "@/components/shared/CascoDaTabela";
import { CampoDeBusca } from "@/components/ui/CampoDeBusca";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Button } from "@/components/ui/Button";
import { getAuthContext, canViewSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { getPrisma } from "@/lib/prisma";
import { getSectorUsers } from "@/lib/sectorUsers";
import { listarFila, feriadosDoTenant, filtrarPelaBusca } from "@/lib/societario/fila";
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
  // A busca da lista (/processos), aqui também: aparada e com teto.
  const busca = (params.q ?? "").trim().slice(0, 100);

  const agora = new Date();
  const [abertos, concluidos] = await Promise.all([
    listarFila(ctx.tenantId, filtro, feriados, agora),
    listarConcluidosRecentes(ctx.tenantId, filtro, feriados, agora, DIAS_DE_CONCLUIDOS_RECENTES),
  ]);
  const noQuadro = filtrarPelaBusca([...abertos, ...concluidos], busca);
  const colunas = colunasDoKanban(noQuadro);

  return (
    <PageContainer>
      {/* Trilha no lugar do "← Voltar" (P04, 15/10/2026): o quadro sai de Processos. */}
      <Breadcrumb items={[{ label: "Processos", href: "/processos" }, { label: "Kanban de processos" }]} />
      <PageHeader
        title="Kanban de processos"
        subtitle="A coluna é a situação que os protocolos dizem — muda quando o desfecho é registrado no processo, não arrastando o cartão."
        action={
          <Button href="/processos" variant="secondary">
            <List size={14} /> Ver como lista
          </Button>
        }
      />

      {/* A barra das listas (15/10/2026, decisão D7): a contagem à esquerda,
          a busca e o "Filtros" à direita, como no casco das tabelas e no
          kanban dos Quadros — o "Filtros" ficava sozinho numa fileira acima
          do quadro. Sem o casco em volta: o quadro não é tabela, e as colunas
          já são cartões. As classes são as da barra do `CascoDaTabela`. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 min-h-[52px] px-4 py-2.5 mb-4 bg-surface border border-border rounded-lg shadow-xs">
        <p className="text-ui min-w-0">
          <span className="font-semibold text-fg">{contarItens(noQuadro.length, "processo", "processos")}</span>
        </p>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2 min-w-0">
          {/* GET, como na lista: os filtros escolhidos vão junto nos campos
              escondidos — sem eles, buscar os apagaria. */}
          <form method="get" action="/processos/kanban" className="max-w-full">
            {filtro.responsavelId && <input type="hidden" name="responsavel" value={filtro.responsavelId} />}
            {filtro.prioridade && <input type="hidden" name="prioridade" value={filtro.prioridade} />}
            {filtro.tipoId && <input type="hidden" name="tipo" value={filtro.tipoId} />}
            <CampoDeBusca
              compact
              name="q"
              defaultValue={busca}
              placeholder="Buscar por empresa, tipo, título ou responsável…"
              aria-label="Buscar processo"
              className="w-80 max-w-full"
            />
          </form>
          {/* Responsável, prioridade e tipo no botão "Filtros" — era um
              formulário com três selects e "Filtrar" (conferência de 30/09). */}
          <FiltrosDaTela
            naBarra
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
        </div>
      </div>

      <KanbanDeProcessos colunas={colunas} agora={agora} />
    </PageContainer>
  );
}
