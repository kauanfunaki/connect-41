import { notFound } from "next/navigation";
import Link from "next/link";
import { Bot, CircleAlert, ListTodo } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { CancelarTarefaDoRobo } from "@/components/societario/CancelarTarefaDoRobo";
import { AtualizacaoDaTelaDoRobo } from "@/components/robo/AtualizacaoDaTelaDoRobo";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { formatInstantDateTime, formatarNumero } from "@/lib/format";
import { ROTULO_DO_STATUS, TIPOS_DE_TAREFA, ehTipoDeTarefa, maquinaSemSinal, motivoParaPessoa, tiposDaArea, type StatusDaTarefa } from "@/lib/robo/tarefas";
import { Aviso } from "@/components/ui/Aviso";
import { Pagination } from "@/components/shared/Pagination";
import { paginaDaUrl, totalDePaginas } from "@/lib/financeiro/paginaDeContas";
import type { TomDoSelo } from "@/components/ui/Selo";

// Módulo próprio desde 03/11/2026, para a tela estar no menu do Societário.
const MODULE = "societario_robo";

export const dynamic = "force-dynamic";

const TOM: Record<StatusDaTarefa, TomDoSelo> = {
  PENDENTE: "neutro",
  EM_EXECUCAO: "marca",
  CONCLUIDA: "sucesso",
  PRECISA_DE_GENTE: "atencao",
  CANCELADA: "neutro",
};

/**
 * Tarefas por página (27/11/2026, melhoria-571): a tela mostrava só as 100
 * mais recentes; agora pagina no banco, e os totais contam a fila inteira.
 */
const POR_PAGINA = 50;
/** Quantas tarefas recentes dizem de que máquina mostrar o sinal — o recorte de antes da paginação. */
const TAREFAS_DO_SINAL = 100;

const TH = "py-2 pr-3 font-medium";
const TD = "py-2.5 pr-3 align-top";

/**
 * O robô do Societário (30/10/2026): a máquina do TI, a fila e o que parou
 * para alguém olhar. A máquina é uma automação do Ops Center; o sinal de vida
 * é o dela lá. Ver `src/lib/robo/`.
 */
export default async function RoboDoSocietarioPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const ctx = await getAuthContext();
  const setores = ctx.tenantId ? ((await setoresDoModulo(ctx.tenantId, MODULE)) ?? "societario") : "societario";
  if (!ctx.tenantId || !canActOnSector(ctx, setores)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const params = await searchParams;
  const prisma = getPrisma();
  // Só as do Societário: a geração do SPED (06/11/2026) usa a mesma fila e
  // aparece no Gerar SPED.
  const daArea = { tenantId: ctx.tenantId, kind: { in: tiposDaArea("societario") } };
  const buscarPagina = (p: number) =>
    prisma.robotTask.findMany({
      where: daArea,
      // O id desempata as pedidas no mesmo instante: a página não repete nem pula tarefa.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (p - 1) * POR_PAGINA,
      take: POR_PAGINA,
      select: { id: true, kind: true, status: true, companyId: true, machineSlug: true, attempts: true, reason: true, fileId: true, createdAt: true, finishedAt: true },
    });
  const pedida = paginaDaUrl(params.pagina);
  // Os totais do topo e o ritmo da atualização contam a fila inteira, não a
  // página: eram contados nas 100 tarefas que a tela trazia.
  const [porSituacao, primeira, recentes, emExecucao] = await Promise.all([
    prisma.robotTask.groupBy({ by: ["status"], where: daArea, _count: { _all: true } }),
    buscarPagina(pedida),
    // O sinal da máquina continua o das que pegaram as tarefas mais recentes,
    // como antes da paginação; só o slug, sem trazer a tarefa.
    prisma.robotTask.findMany({ where: daArea, orderBy: { createdAt: "desc" }, take: TAREFAS_DO_SINAL, select: { machineSlug: true } }),
    prisma.robotTask.findMany({ where: { ...daArea, status: "EM_EXECUCAO" }, select: { id: true } }),
  ]);
  const contar = (...status: StatusDaTarefa[]) =>
    porSituacao.filter((s) => (status as string[]).includes(s.status)).reduce((n, s) => n + s._count._all, 0);
  const total = porSituacao.reduce((n, s) => n + s._count._all, 0);
  const ultima = totalDePaginas(total, POR_PAGINA);
  // Página além do fim (link antigo): mostra a última que existe.
  const pagina = Math.min(pedida, ultima);
  const tarefas = pagina === pedida ? primeira : await buscarPagina(pagina);

  const [empresas, maquinas] = await Promise.all([
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, id: { in: [...new Set(tarefas.map((t) => t.companyId).filter((id): id is string => !!id))] } },
      select: { id: true, name: true, displayName: true },
    }),
    prisma.opsWatcher.findMany({
      where: { tenantId: ctx.tenantId, slug: { in: [...new Set(recentes.map((t) => t.machineSlug).filter((s): s is string => !!s))] } },
      select: { slug: true, name: true, lastHeartbeatAt: true, isActive: true },
    }),
  ]);
  const nomeDaEmpresa = new Map(empresas.map((e) => [e.id, nomeExibicao(e)]));
  // Parada no captcha esperando alguém (06/11/2026): a linha leva à tela espelhada,
  // para quem não viu o aviso no sino. Procura em toda tarefa em execução, não
  // só nas da página: o número também acelera a atualização da tela.
  const pedindoAjuda = new Set(
    emExecucao.length
      ? (
          await prisma.robotAssist.findMany({
            where: { tenantId: ctx.tenantId, taskId: { in: emExecucao.map((t) => t.id) }, endedAt: null, deadlineAt: { gt: new Date() } },
            select: { taskId: true },
          })
        ).map((s) => s.taskId)
      : [],
  );
  const naFila = contar("PENDENTE", "EM_EXECUCAO");
  const paradas = contar("PRECISA_DE_GENTE");
  // A máquina parada (04/11/2026): o robô roda no PC de alguém, e com ele desligado
  // nada é lido sem que ninguém saiba. Só as ativas no Ops Center contam.
  const agora = new Date();
  const semSinal = maquinas.filter((m) => m.isActive && maquinaSemSinal(m.lastHeartbeatAt, agora));

  return (
    <PageContainer>
      {/* Ao vivo (09/11/2026): a tela se busca de novo sozinha, e o botão de resolver o captcha aparece sem F5. */}
      <AtualizacaoDaTelaDoRobo naFila={naFila} pedindoAjuda={pedindoAjuda.size} />
      <PageHeader
        title="Hub de robôs"
        action={
          <Button href="/licencas" variant="secondary" size="sm">
            Ir para Licenças
          </Button>
        }
      />

      {semSinal.map((m) => (
        <Aviso key={m.slug} tom="atencao" className="mb-4">
          A máquina do robô ({m.name}) {m.lastHeartbeatAt ? `não responde desde ${formatInstantDateTime(m.lastHeartbeatAt)}` : "nunca respondeu"}. Nada é lido enquanto ela estiver desligada, sem internet ou com a janela do robô fechada: ligue a máquina ou rode a tarefa robo-societario no Agendador de Tarefas.
        </Aviso>
      ))}

      <FaixaDeTotais
        itens={[
          { rotulo: "Na fila", valor: formatarNumero(naFila, 0), icone: <ListTodo /> },
          { rotulo: "Precisa de alguém", valor: formatarNumero(paradas, 0), icone: <CircleAlert />, tom: paradas > 0 ? "text-warning-fg" : undefined },
          {
            rotulo: "Máquina",
            valor: maquinas.length ? (semSinal.length ? "Sem sinal" : "Respondendo") : "—",
            tom: semSinal.length ? "text-warning-fg" : undefined,
            icone: <Bot />,
            detalhe: maquinas.length
              ? maquinas.map((m) => `${m.name}: ${m.lastHeartbeatAt ? `sinal ${formatInstantDateTime(m.lastHeartbeatAt)}` : "sem sinal"}`).join(" · ")
              : "nenhuma pegou tarefa ainda",
          },
        ]}
      />

      {/* Na tabela padrão do app (`.c41-tabela`, auditoria de UX, 30/10/2026):
          era uma tabela própria, alinhada à esquerda e com o cabeçalho à mão. O
          estado vazio mostrava ao usuário o caminho de um arquivo do repositório. */}
      {tarefas.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Bot />}
            title="Nada pedido ao robô ainda"
            description="Peça a impressão do alvará pelo ⋯ de uma licença de alvará."
          />
        </Card>
      ) : (
        <div className="c41-tabela overflow-x-auto bg-surface border border-border rounded-lg shadow-xs">
          <table className="w-full min-w-[820px] text-ui">
            <thead>
              <tr>
                <th className={TH}>Pedida em</th>
                <th className={TH}>Tarefa</th>
                <th className={TH}>Empresa</th>
                <th className={TH}>Situação</th>
                <th className={TH}>Detalhe</th>
                <th className="py-2 font-medium">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tarefas.map((t) => {
                const status = (t.status in ROTULO_DO_STATUS ? t.status : "PENDENTE") as StatusDaTarefa;
                return (
                  <tr key={t.id} className="border-b border-border-soft last:border-0">
                    <td className={`${TD} whitespace-nowrap tabular-nums text-fg-secondary`}>{formatInstantDateTime(t.createdAt)}</td>
                    <td className={TD}>{ehTipoDeTarefa(t.kind) ? TIPOS_DE_TAREFA[t.kind].rotulo : t.kind}</td>
                    <td className={TD}>
                      {t.companyId ? (
                        <Link href={`/empresas/${t.companyId}`} className="font-semibold text-fg hover:text-brand transition-colors">
                          {nomeDaEmpresa.get(t.companyId) ?? "—"}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={TD}>
                      <Selo tom={TOM[status]}>{ROTULO_DO_STATUS[status]}</Selo>
                      {t.attempts > 1 && <span className="block text-micro text-fg-muted mt-1">{t.attempts} tentativas</span>}
                    </td>
                    <td className={`${TD} text-fg-secondary max-w-[44ch]`}>
                      {pedindoAjuda.has(t.id) ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <span>Parou no &quot;Não sou um robô&quot; e espera alguém marcar.</span>
                          <Button href={`/robo/assistir/${t.id}`} size="xs">
                            Resolver o captcha
                          </Button>
                        </span>
                      ) : t.fileId ? (
                        <Button href={`/api/arquivos/${t.fileId}?ver=1`} nativo target="_blank" rel="noopener" variant="secondary" size="xs" title="O PDF fica em Arquivos › Societário">
                          Abrir o PDF
                        </Button>
                      ) : (
                        (motivoParaPessoa(t.reason) ?? (status === "EM_EXECUCAO" && t.machineSlug ? `Com a máquina ${t.machineSlug}.` : "—"))
                      )}
                    </td>
                    <td className="py-2.5 text-right">{status === "PENDENTE" && <CancelarTarefaDoRobo id={t.id} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination
        page={pagina}
        totalPages={ultima}
        buildHref={(p) => (p > 1 ? `/robo?pagina=${p}` : "/robo")}
        total={total}
        rotulo="tarefas"
      />
    </PageContainer>
  );
}
