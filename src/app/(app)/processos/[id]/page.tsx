import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Selo, tomDaVariante } from "@/components/ui/Selo";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { formatInstantDate } from "@/lib/format";
import { feriadosDoTenant } from "@/lib/societario/fila";
import {
  etapasLiberadas,
  situacaoDoProcesso,
  prazoDoProcesso,
  totalDeVoltas,
} from "@/lib/societario/processo";
import { SITUACAO_LABEL, SITUACAO_VARIANTE } from "@/components/societario/ProcessosFila";
import { SituacaoDoProcesso } from "@/components/societario/SituacaoDoProcesso";
import { RoteiroDoProcesso, type EtapaNaTela } from "@/components/societario/RoteiroDoProcesso";
import { TaxasDoProcesso } from "@/components/societario/TaxasDoProcesso";
import { taxasDoProcesso } from "@/lib/societario/licencas-data";
import {
  concluirEtapa,
  dispensarEtapa,
  protocolar,
  deferirProtocolo,
  registrarExigencia,
  resolverExigencia,
  mudarSituacaoDoProcesso,
  alternarItemDoChecklist,
} from "../actions";
import { EditarDadosDoProcesso } from "@/components/societario/EditarDadosDoProcesso";
import { getSectorUsers } from "@/lib/sectorUsers";
import { PRIORIDADE_LABEL, PRIORIDADE_VARIANTE } from "@/lib/societario/prioridade";
import { prazoCombinado } from "@/lib/societario/dados-do-processo";
import { campoDaData } from "@/lib/societario/datas";
import { Card } from "@/components/ui/Card";
import { ConversaDaPendencia } from "@/components/pendencias/ConversaDaPendencia";
import { ResponderPendencia } from "@/components/pendencias/ResponderPendencia";
import { DocumentosDoProcesso } from "@/components/societario/DocumentosDoProcesso";
import { conversaDoProcesso } from "@/lib/societario/conversa";
import { enviarMensagemNoProcesso, adicionarDocumentosAoProcesso } from "../conversa-actions";
import { aplicarAviso, descartarAviso } from "../avisos-actions";
import { AvisosDaJunta } from "@/components/societario/AvisosDaJunta";
import { avisosPendentes } from "@/lib/societario/avisos";
import { HorasDoProcesso } from "@/components/societario/HorasDoProcesso";
import { ObservacoesDoProcesso } from "@/components/societario/ObservacoesDoProcesso";
import { apagarHorasDoProcesso, iniciarCronometroDoProcesso, lancarHorasNoProcesso, pararCronometroDoProcesso } from "../horas-actions";

// `SECTOR` é o setor de origem, usado só como padrão: acesso e equipe seguem o
// setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = "societario";
const MODULE = "societario_processos";

export const dynamic = "force-dynamic";

export default async function ProcessoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const { id } = await params;
  const prisma = getPrisma();

  // O tenant entra no `where`, não numa conferência depois de buscar: buscar
  // primeiro e conferir depois já teria trazido o dado para a memória.
  const processo = await prisma.process.findFirst({
    where: { id, tenantId: ctx.tenantId },
    select: {
      id: true,
      startedAt: true,
      concludedAt: true,
      status: true,
      statusReason: true,
      statusChangedAt: true,
      notes: true,
      title: true,
      priority: true,
      dueAt: true,
      ownerUserId: true,
      activeTimerUserId: true,
      activeTimerStartedAt: true,
      company: { select: { id: true, name: true, displayName: true } },
      owner: { select: { id: true, name: true } },
      type: {
        select: { name: true, expectedDaysMin: true, expectedDaysMax: true, variableFlow: true },
      },
      template: {
        select: {
          version: true,
          steps: {
            select: {
              id: true,
              position: true,
              label: true,
              description: true,
              parallelGroup: true,
              optional: true,
              expectedActor: true,
              organ: { select: { name: true } },
            },
            orderBy: { position: "asc" },
          },
        },
      },
      steps: {
        select: {
          id: true,
          templateStepId: true,
          status: true,
          items: {
            select: {
              id: true,
              done: true,
              templateItem: { select: { label: true, required: true, position: true } },
            },
          },
        },
      },
      protocols: {
        select: {
          id: true,
          stepId: true,
          organId: true,
          attempt: true,
          number: true,
          submittedAt: true,
          outcome: true,
          lastCheckedAt: true,
          checkError: true,
          resolvedByActor: true,
          organ: { select: { name: true } },
          requirements: {
            select: { id: true, description: true, raisedAt: true, dueAt: true, resolvedAt: true },
            orderBy: { raisedAt: "asc" },
          },
        },
        orderBy: [{ attempt: "asc" }],
      },
    },
  });
  if (!processo) notFound();

  const feriados = await feriadosDoTenant(ctx.tenantId);
  const situacao = situacaoDoProcesso(processo.protocols, processo.concludedAt !== null, processo.status);
  const encerradoSemConclusao = processo.status === "CANCELADO" || processo.status === "INDEFERIDO";
  const prazo = prazoDoProcesso(processo.type, processo, new Date(), feriados);
  const voltas = totalDeVoltas(processo.protocols);

  const liberadas = new Set(
    etapasLiberadas(
      processo.template.steps.map((s) => ({
        templateStepId: s.id,
        position: s.position,
        parallelGroup: s.parallelGroup,
        optional: s.optional,
      })),
      processo.steps.map((s) => ({ templateStepId: s.templateStepId, status: s.status }))
    )
  );

  const instanciaPorTemplate = new Map(processo.steps.map((s) => [s.templateStepId, s]));

  const etapas: EtapaNaTela[] = processo.template.steps.map((passo) => {
    const instancia = instanciaPorTemplate.get(passo.id);
    return {
      id: instancia?.id ?? "",
      posicao: passo.position,
      rotulo: passo.label,
      descricao: passo.description,
      grupoParalelo: passo.parallelGroup,
      opcional: passo.optional,
      orgaoNome: passo.organ?.name ?? null,
      executorEsperado: passo.expectedActor,
      status: instancia?.status ?? "PENDENTE",
      liberada: liberadas.has(passo.id),
      itens: (instancia?.items ?? [])
        .slice()
        .sort((a, b) => a.templateItem.position - b.templateItem.position)
        .map((i) => ({
          id: i.id,
          rotulo: i.templateItem.label,
          obrigatorio: i.templateItem.required,
          feito: i.done,
        })),
      protocolos: processo.protocols
        .filter((p) => p.stepId === instancia?.id)
        .map((p) => ({
          id: p.id,
          orgaoNome: p.organ.name,
          tentativa: p.attempt,
          numero: p.number,
          enviadoEm: p.submittedAt,
          desfecho: p.outcome,
          verificadoEm: p.lastCheckedAt,
          erroDaVerificacao: p.checkError,
          porRobo: p.resolvedByActor === "ROBO",
          exigencias: p.requirements.map((r) => ({
            id: r.id,
            descricao: r.description,
            abertaEm: r.raisedAt,
            prazoAte: r.dueAt,
            resolvidaEm: r.resolvedAt,
          })),
        })),
    };
  });

  const empresaNome = nomeExibicao(processo.company);

  const [horas, donoDoCronometro] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { tenantId: ctx.tenantId, processId: processo.id },
      orderBy: [{ loggedOn: "desc" }, { createdAt: "desc" }],
      take: 50,
      select: { id: true, minutes: true, note: true, loggedOn: true, userId: true, user: { select: { name: true } } },
    }),
    processo.activeTimerUserId
      ? prisma.user.findUnique({ where: { id: processo.activeTimerUserId }, select: { name: true } }).then((u) => u?.name ?? null)
      : Promise.resolve(null),
  ]);

  const [{ taxas, custo }, conversa, avisos] = await Promise.all([
    taxasDoProcesso(ctx.tenantId, processo.id),
    conversaDoProcesso({ tenantId: ctx.tenantId, companyIds: null }, processo.id),
    avisosPendentes(ctx.tenantId, processo.id),
  ]);

  // O responsável atual entra na lista mesmo que tenha saído do setor — senão o
  // formulário de editar mostraria "sem responsável" e salvaria isso sem querer.
  const equipe = await getSectorUsers(ctx.tenantId, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR);
  const responsaveis =
    processo.owner && !equipe.some((u) => u.id === processo.owner!.id) ? [...equipe, processo.owner] : equipe;
  const combinado = processo.dueAt ? prazoCombinado(processo.dueAt, new Date()) : null;

  return (
    <PageContainer>
      <BackButton className="mb-3" />

      {/* Título do processo como subtítulo do cabeçalho e "Editar dados" no
          `action`: o PageHeader dentro de uma coluna própria deixava o título
          do processo 28px abaixo do nome (a margem do cabeçalho) e o botão
          alinhado ao traço do setor, não ao título. */}
      <PageHeader
        title={`${processo.type.name} — ${empresaNome}`}
        subtitle={processo.title ?? undefined}
        action={
          <EditarDadosDoProcesso
            processoId={processo.id}
            responsaveis={responsaveis}
            valores={{
              titulo: processo.title ?? "",
              responsavelId: processo.ownerUserId ?? "",
              prioridade: processo.priority,
              prazoCombinado: campoDaData(processo.dueAt),
            }}
          />
        }
        meta={
          <>
          {/* Situação e prioridade em Selo: é a situação da ficha (regra de
              02/10 no Selo; auditoria de 07/10/2026). */}
          {encerradoSemConclusao ? (
            <Selo tom="neutro">{processo.status === "CANCELADO" ? "Cancelado" : "Indeferido"}</Selo>
          ) : (
            <Selo tom={tomDaVariante(SITUACAO_VARIANTE[situacao])}>{SITUACAO_LABEL[situacao]}</Selo>
          )}

          {prazo.situacao === "sem_previsao" ? (
            <span>
              <span className="tabular-nums">{prazo.dias}</span> dias úteis · fluxo variável, sem
              previsão
            </span>
          ) : (
            <span className={prazo.situacao === "estourado" ? "text-danger font-medium" : undefined}>
              <span className="tabular-nums">{prazo.dias}</span> de{" "}
              <span className="tabular-nums">
                {prazo.previstoMin !== null && prazo.previstoMin !== prazo.previstoMax
                  ? `${prazo.previstoMin}–${prazo.previstoMax}`
                  : prazo.previstoMax}
              </span>{" "}
              dias úteis
              {prazo.situacao === "estourado" && " · estourado"}
            </span>
          )}

          {/* A volta é o número que explica o prazo. Sem exigência, some. */}
          {voltas > 0 && (
            <span className="text-danger">
              {voltas} {voltas === 1 ? "volta de exigência" : "voltas de exigência"}
            </span>
          )}

          {processo.priority !== "NORMAL" && (
            <Selo tom={tomDaVariante(PRIORIDADE_VARIANTE[processo.priority])}>
              Prioridade {PRIORIDADE_LABEL[processo.priority].toLowerCase()}
            </Selo>
          )}

          {combinado && processo.dueAt && (
            <span
              className={
                combinado.situacao === "vencido" || combinado.situacao === "hoje"
                  ? "text-danger font-medium"
                  : combinado.situacao === "proximo"
                    ? "text-warning"
                    : undefined
              }
            >
              {combinado.texto} · {formatInstantDate(processo.dueAt)}
            </span>
          )}

          <span>Aberto em {formatInstantDate(processo.startedAt)}</span>
          {/* Com rótulo (07/10/2026): o nome solto entre a data e os botões não
              dizia que era o responsável. */}
          <span>{processo.owner ? `Responsável: ${processo.owner.name}` : "Sem responsável"}</span>
          {/* Revisão de 05/10: botão não é link — os dois atalhos eram texto azul. */}
          <Button href={`/processos/empresas/${processo.company.id}`} variant="secondary" size="xs">
            Visão societária
          </Button>
          <Button href={`/empresas/${processo.company.id}`} variant="secondary" size="xs">
            Abrir empresa
          </Button>
          </>
        }
      />

      {/* Motivo e ações de situação são do processo inteiro: na largura toda,
          acima das colunas. Concluído e sem motivo, a faixa fica vazia e some
          (`empty:hidden`), sem deixar a margem. */}
      <div className="mb-6 flex flex-col gap-3 empty:hidden">
        {processo.statusReason && (
          <p className="text-[length:var(--fs-ui)] text-fg rounded-md border border-border bg-surface-2 px-3 py-2 break-words">
            <span className="font-medium">Motivo:</span> {processo.statusReason}
            {processo.statusChangedAt && (
              <span className="text-fg-muted"> · desde {formatInstantDate(processo.statusChangedAt)}</span>
            )}
          </p>
        )}
        <SituacaoDoProcesso processoId={processo.id} status={processo.status} mudar={mudarSituacaoDoProcesso} />
      </div>

      {/* Duas colunas no computador (escolha do Kauan na página de decisões,
          08/10/2026 — 10A): o roteiro à esquerda, e à direita o que se consulta
          ao lado dele — taxas, horas, conversa e documentos. Era uma pilha só,
          e Taxas, Horas e Conversa ficavam muito abaixo da dobra.

          - Do `xl` para cima, e não do `lg`: com o menu de 240px, no `lg` o
            conteúdo tem uns 736px e o roteiro ficaria com uns 300.
          - A conversa vai para a direita junto com os documentos: é apoio do
            roteiro, e assim as duas colunas, uma depois da outra, dão a mesma
            ordem de hoje no celular — sem `order` de CSS, que deixaria a ordem
            do leitor de tela diferente da que se vê.
          - As observações ficam no alto da coluna do roteiro, onde já estavam:
            são a história do processo (o cartão do Trello), fechadas numa linha.

          Toda seção é um cartão com o título dentro (07/10/2026), com o mesmo
          respiro entre elas. */}
      <div className="flex flex-col gap-5 xl:grid xl:grid-cols-[minmax(0,1fr)_25rem] xl:items-start 2xl:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="flex min-w-0 flex-col gap-5">
          {/* As observações já vinham na consulta e não apareciam em lugar
              nenhum. É onde a importação do Trello (06/10) põe descrição,
              checklists e comentários do cartão — fechado, porque é longo, e
              só aqui: o portal não lê `notes`. */}
          {processo.notes && <ObservacoesDoProcesso texto={processo.notes} />}

          {avisos.length > 0 && (
            <Card as="section" aria-labelledby="avisos-da-junta" className="p-4 flex flex-col gap-4">
              <div className="flex flex-col gap-0.5">
                <h2 id="avisos-da-junta" className="text-section font-semibold text-fg">
                  Avisos da Junta por e-mail
                </h2>
                <p className="text-[length:var(--fs-2)] text-fg-muted">
                  O sistema leu o e-mail e sugere o desfecho. Confira o texto do órgão antes de aplicar.
                </p>
              </div>
              <AvisosDaJunta avisos={avisos} acoes={{ aplicar: aplicarAviso, descartar: descartarAviso }} embutido />
            </Card>
          )}

          <Card as="section" aria-labelledby="roteiro-do-processo" className="p-4 flex flex-col gap-3">
            <h2 id="roteiro-do-processo" className="text-section font-semibold text-fg">
              Roteiro
            </h2>
            <RoteiroDoProcesso
              etapas={etapas}
              podeEditar={processo.concludedAt === null && !encerradoSemConclusao}
              acoes={{
                concluir: concluirEtapa,
                dispensar: dispensarEtapa,
                protocolar,
                deferir: deferirProtocolo,
                exigir: registrarExigencia,
                resolverExigencia,
                alternarItem: alternarItemDoChecklist,
              }}
            />
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <TaxasDoProcesso taxas={taxas} custo={custo} />

          <HorasDoProcesso
            processId={processo.id}
            lancamentos={horas.map((h) => ({
              id: h.id,
              quem: h.user.name,
              minutos: h.minutes,
              dia: formatInstantDate(h.loggedOn),
              nota: h.note,
              meu: h.userId === ctx.userId,
            }))}
            cronometro={
              processo.activeTimerUserId && processo.activeTimerStartedAt
                ? {
                    quem: donoDoCronometro ?? "Alguém",
                    desdeIso: processo.activeTimerStartedAt.toISOString(),
                    meu: processo.activeTimerUserId === ctx.userId,
                  }
                : null
            }
            podeAgir={processo.concludedAt === null}
            acoes={{
              iniciar: iniciarCronometroDoProcesso,
              parar: pararCronometroDoProcesso,
              lancar: lancarHorasNoProcesso,
              apagar: apagarHorasDoProcesso,
            }}
          />

          {/* Um embaixo do outro na coluna da direita — eram lado a lado
              (3:2) numa faixa da largura toda. */}
          {conversa && (
            <>
              <Card as="section" aria-labelledby="conversa-do-processo" className="p-4 flex flex-col gap-4">
                <div className="flex flex-col gap-0.5">
                  <h2 id="conversa-do-processo" className="text-section font-semibold text-fg">
                    Conversa com o cliente
                  </h2>
                  <p className="text-[length:var(--fs-2)] text-fg-muted">
                    O cliente vê tudo o que for escrito aqui no portal, e é avisado por e-mail. Para anotação
                    interna, use as observações do processo.
                  </p>
                </div>
                {conversa.limitada && (
                  <p className="text-[length:var(--fs-2)] text-fg-muted">Mostrando só as mensagens mais recentes.</p>
                )}
                {conversa.mensagens.length > 0 && (
                  <ConversaDaPendencia
                    mensagens={conversa.mensagens}
                    baseDoDownload="/api/processos/documentos"
                    ladoDeQuemVe="EQUIPE"
                  />
                )}
                <ResponderPendencia
                  alvo={processo.id}
                  campo="processId"
                  acao={enviarMensagemNoProcesso}
                  rotulo="Enviar ao cliente"
                  dica="Anexe PDF, PNG, JPG ou XML de até 10 MB."
                />
              </Card>

              <Card as="section" aria-labelledby="documentos-do-processo" className="p-4 flex flex-col gap-4">
                <h2 id="documentos-do-processo" className="text-section font-semibold text-fg">
                  Documentos <span className="text-fg-muted font-normal tabular-nums">({conversa.documentos.length})</span>
                </h2>
                <DocumentosDoProcesso
                  processId={processo.id}
                  documentos={conversa.documentos}
                  baseDoDownload="/api/processos/documentos"
                  acao={adicionarDocumentosAoProcesso}
                  ladoDeQuemVe="EQUIPE"
                  dica="O cliente vê e é avisado."
                />
              </Card>
            </>
          )}
        </div>
      </div>

      <p className="mt-6 text-[length:var(--fs-micro)] text-fg-muted">
        Roteiro versão {processo.template.version} — congelado na abertura, para o processo não
        mudar embaixo de quem está tocando ele.
      </p>
    </PageContainer>
  );
}
