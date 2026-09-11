import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Badge } from "@/components/ui/Badge";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled } from "@/lib/modules";
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
import { SITUACAO_LABEL } from "@/components/societario/ProcessosFila";
import { RoteiroDoProcesso, type EtapaNaTela } from "@/components/societario/RoteiroDoProcesso";
import {
  concluirEtapa,
  dispensarEtapa,
  protocolar,
  deferirProtocolo,
  registrarExigencia,
  resolverExigencia,
  alternarItemDoChecklist,
} from "../actions";

const SECTOR = "societario";
const MODULE = "societario_processos";

export const dynamic = "force-dynamic";

export default async function ProcessoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !canActOnSector(ctx, SECTOR)) notFound();
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
      notes: true,
      company: { select: { id: true, name: true, displayName: true } },
      owner: { select: { name: true } },
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
  const situacao = situacaoDoProcesso(processo.protocols, processo.concludedAt !== null);
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

  return (
    <PageContainer>
      <BackButton className="mb-3" />

      <div className="mb-5 flex flex-col gap-2">
        <PageHeader title={`${processo.type.name} — ${empresaNome}`} />
        <div className="flex items-center gap-3 flex-wrap text-[12px] text-fg-muted">
          <Badge
            variant={
              situacao === "EM_EXIGENCIA"
                ? "warning"
                : situacao === "AGUARDANDO_ORGAO"
                  ? "info"
                  : "success"
            }
          >
            {SITUACAO_LABEL[situacao]}
          </Badge>

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

          <span>Aberto em {formatInstantDate(processo.startedAt)}</span>
          <span>{processo.owner?.name ?? "sem responsável"}</span>
          <Link href={`/empresas/${processo.company.id}`} className="text-brand hover:underline">
            Ver empresa
          </Link>
        </div>
      </div>

      <RoteiroDoProcesso
        etapas={etapas}
        podeEditar={processo.concludedAt === null}
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

      <p className="mt-6 text-[11px] text-fg-muted">
        Roteiro versão {processo.template.version} — congelado na abertura, para o processo não
        mudar embaixo de quem está tocando ele.
      </p>
    </PageContainer>
  );
}
