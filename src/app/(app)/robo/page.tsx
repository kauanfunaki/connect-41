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
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { formatInstantDateTime, formatarNumero } from "@/lib/format";
import { ROTULO_DO_STATUS, TIPOS_DE_TAREFA, ehTipoDeTarefa, maquinaSemSinal, motivoParaPessoa, tiposDaArea, type StatusDaTarefa } from "@/lib/robo/tarefas";
import { Aviso } from "@/components/ui/Aviso";
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

const TH = "py-2 pr-3 font-medium";
const TD = "py-2.5 pr-3 align-top";

/**
 * O robô do Societário (30/10/2026): a máquina do TI, a fila e o que parou
 * para alguém olhar. A máquina é uma automação do Ops Center; o sinal de vida
 * é o dela lá. Ver `src/lib/robo/`.
 */
export default async function RoboDoSocietarioPage() {
  const ctx = await getAuthContext();
  const setores = ctx.tenantId ? ((await setoresDoModulo(ctx.tenantId, MODULE)) ?? "societario") : "societario";
  if (!ctx.tenantId || !canActOnSector(ctx, setores)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const prisma = getPrisma();
  // Só as do Societário: a geração do SPED (06/11/2026) usa a mesma fila e
  // aparece no Gerar SPED.
  const tarefas = await prisma.robotTask.findMany({
    where: { tenantId: ctx.tenantId, kind: { in: tiposDaArea("societario") } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, kind: true, status: true, companyId: true, machineSlug: true, attempts: true, reason: true, fileId: true, createdAt: true, finishedAt: true },
  });
  const [empresas, maquinas] = await Promise.all([
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, id: { in: [...new Set(tarefas.map((t) => t.companyId).filter((id): id is string => !!id))] } },
      select: { id: true, name: true, displayName: true },
    }),
    prisma.opsWatcher.findMany({
      where: { tenantId: ctx.tenantId, slug: { in: [...new Set(tarefas.map((t) => t.machineSlug).filter((s): s is string => !!s))] } },
      select: { slug: true, name: true, lastHeartbeatAt: true, isActive: true },
    }),
  ]);
  const nomeDaEmpresa = new Map(empresas.map((e) => [e.id, nomeExibicao(e)]));
  // Parada no captcha esperando alguém (06/11/2026): a linha leva à tela espelhada,
  // para quem não viu o aviso no sino.
  const emExecucao = tarefas.filter((t) => t.status === "EM_EXECUCAO").map((t) => t.id);
  const pedindoAjuda = new Set(
    emExecucao.length
      ? (
          await prisma.robotAssist.findMany({
            where: { tenantId: ctx.tenantId, taskId: { in: emExecucao }, endedAt: null, deadlineAt: { gt: new Date() } },
            select: { taskId: true },
          })
        ).map((s) => s.taskId)
      : [],
  );
  const naFila = tarefas.filter((t) => t.status === "PENDENTE" || t.status === "EM_EXECUCAO").length;
  const paradas = tarefas.filter((t) => t.status === "PRECISA_DE_GENTE").length;
  // A máquina parada (04/11/2026): o robô roda no PC de alguém, e com ele desligado
  // nada é lido sem que ninguém saiba. Só as ativas no Ops Center contam.
  const agora = new Date();
  const semSinal = maquinas.filter((m) => m.isActive && maquinaSemSinal(m.lastHeartbeatAt, agora));

  return (
    <PageContainer>
      <PageHeader
        title="Robô do Societário"
        subtitle="O que a máquina do TI faz nos sites dos órgãos: a fila, o que já foi e o que parou para alguém olhar. Hoje ele imprime o alvará de Curitiba (pedido no ⋯ da licença), lê a situação da inscrição estadual no PR e acompanha os protocolos do SIMA."
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
            description="Peça a impressão do alvará pelo ⋯ de uma licença de alvará. A máquina do TI busca a tarefa na próxima volta."
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
    </PageContainer>
  );
}
