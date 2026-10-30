import Link from "next/link";
import { createHash } from "crypto";
import { Card } from "@/components/ui/Card";
import { Pencil } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { VAGA_STATUS_LABEL, VAGA_STATUS_STYLE } from "@/lib/vagaStatus";
import { getAuthContext, canManageSector, podeExcluir } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { isModuleEnabled } from "@/lib/modules";
import { scopedVagaWhere } from "@/lib/auth/scope";
import { getSectorMaps } from "@/lib/sectors";
import { DeleteButton } from "@/components/pessoas/DeleteButton";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { AdicionarCandidato } from "@/components/vagas/AdicionarCandidato";
import { PerguntarACeci } from "@/components/vagas/PerguntarACeci";
import { FatosDaVaga } from "@/components/vagas/FatosDaVaga";
import { FaixaDoPortal } from "@/components/vagas/FaixaDoPortal";
import { TriagemDaVaga } from "@/components/vagas/TriagemDaVaga";
import { isAiConfigured } from "@/lib/ai";
import { agentesDoChat } from "@/lib/ia/chat/agentes";
import { IA_DO_SETOR } from "@/lib/ia/chat/regras";
import { requisitosAtuais } from "@/lib/recrutamento/triagemServidor";
import { compararParaTriagem, type Faixa } from "@/lib/recrutamento/triagem";
import { resumoDasRespostas } from "@/lib/recrutamento/respostas";
import { enderecoCurto, fatosDaFicha, linkDoWhatsApp, situacaoNoPortal } from "@/lib/recrutamento/fichaDaVaga";
import { RecruitmentFunnel, type FunnelCard } from "@/components/vagas/RecruitmentFunnel";
import type { Stage } from "@/lib/recruitmentFunnel";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { excluirVaga, encerrarVaga, reabrirVaga } from "../actions";
import { moverEtapaCandidatura, encerrarCandidatura, desfazerContratacao } from "./actions";
import { travaDoDesfazer } from "@/lib/recrutamento/desfazerContratacao";
import { podeAgirNaVaga, ehCoordenadorDoRecrutamento, SETOR_RECRUTAMENTO } from "@/lib/recrutamento/acessoVagas";
import { AcessoDosRecrutadores } from "@/components/vagas/AcessoDosRecrutadores";
import { Selo } from "@/components/ui/Selo";
import { caminhoNoPortal, enderecoPublicoDoPortal } from "@/lib/carreiras/enderecoDeCarreiras";
import { localDaVaga } from "@/lib/carreiras/portal";

export default async function VagaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  // Vaga e teste são do setor que contrata (o escopo já filtra); aqui só o
  // módulo ligado, que antes não era checado e deixava a tela abrir desligada.
  if (!(await isModuleEnabled(ctx.tenantId, "recrutamento_vagas"))) notFound();

  const prisma = getPrisma();
  const vaga = await prisma.vaga.findFirst({
    where: { id, ...scopedVagaWhere(ctx) },
    include: {
      company: { select: { id: true, name: true, tradeName: true, city: true, stateCode: true } },
      cargo: { select: { id: true, name: true } },
      candidaturas: {
        orderBy: { createdAt: "desc" },
        include: {
          person: { select: { id: true, name: true, type: true, employmentStatus: true, admissionDate: true, currentCompanyId: true } },
          _count: { select: { scorecards: true } },
        },
      },
    },
  });
  if (!vaga) notFound();

  const canManage = canManageSector(ctx, vaga.sectorCode);
  const tenantSlug = (
    await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { slug: true } })
  )?.slug;
  // O endereço que o recrutador divulga: da 41, o do 41 Carreiras (14/10/2026);
  // dos outros escritórios, o de sempre, em APP_PUBLIC_URL. Sem APP_PUBLIC_URL
  // (ambiente local), só o caminho — abre igual, e o "Copiar link" completa
  // com o endereço da janela; o WhatsApp não vai sem endereço inteiro.
  const paginaDaVaga = { tipo: "vaga" as const, id: vaga.id };
  const linkPublico = tenantSlug
    ? (enderecoPublicoDoPortal(tenantSlug, paginaDaVaga) ?? caminhoNoPortal(tenantSlug, paginaDaVaga, false))
    : null;
  const agora = new Date();
  const noPortal = situacaoNoPortal(vaga, agora);
  const linkAbsoluto = linkPublico && /^https?:\/\//i.test(linkPublico) ? linkPublico : null;
  const canAct = await podeAgirNaVaga(ctx, vaga);
  // "Perguntar à Ceci" só para quem tem a Ceci do Recrutamento — sem ela, o
  // chat do canto nem aparece e o botão não abriria nada. E só para quem age
  // na vaga, como o Assistente da vaga que ele substitui: a Ceci sugere
  // movimentos no funil.
  const [agentes, podeCadastrar] = await Promise.all([
    canAct ? agentesDoChat(ctx).catch(() => []) : Promise.resolve([]),
    canAct ? podeNoModulo(ctx, "recrutamento_candidatos", "gerir") : Promise.resolve(false),
  ]);
  const temCeci = agentes.some((a) => a.code === IA_DO_SETOR.recrutamento);
  const { labels: sectorLabels } = await getSectorMaps(ctx.tenantId);

  // Quem do Recrutamento vê a vaga — só a coordenação do Recrutamento enxerga
  // e decide (28/09). Coordenadores e admins veem tudo de qualquer jeito, então
  // a lista oferece só os recrutadores.
  const coordenaRecrutamento = ehCoordenadorDoRecrutamento(ctx);
  const [recrutadores, escolhidos] = coordenaRecrutamento
    ? await Promise.all([
        prisma.user.findMany({
          where: {
            tenantId: ctx.tenantId,
            active: true,
            role: "SECTOR_USER",
            sectors: { some: { sectorCode: SETOR_RECRUTAMENTO } },
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        }),
        prisma.vagaRecrutador.findMany({ where: { vagaId: id }, select: { userId: true } }),
      ])
    : [[], []];

  // Triagem (R1): requisitos atuais e a última nota de cada candidatura. Nota
  // de versão anterior dos requisitos aparece, mas marcada como desatualizada.
  const [requisitos, iaConfigurada] = await Promise.all([requisitosAtuais(ctx.tenantId, id), isAiConfigured(ctx.tenantId)]);
  const ultimasNotas = await prisma.candidaturaNota.findMany({
    where: { tenantId: ctx.tenantId, candidatura: { vagaId: id } },
    orderBy: { createdAt: "desc" },
    distinct: ["candidaturaId"],
    select: { candidaturaId: true, score: true, faixa: true, requisitosId: true },
  });
  const notaDa = new Map(ultimasNotas.map((n) => [n.candidaturaId, n]));
  const emAndamento = vaga.candidaturas.filter((c) => c.status === "EM_ANDAMENTO");
  const pendentes = requisitos ? emAndamento.filter((c) => notaDa.get(c.id)?.requisitosId !== requisitos.id).length : 0;

  const deleteAction = excluirVaga.bind(null, id);
  const encerrarAction = encerrarVaga.bind(null, id);
  const reabrirAction = reabrirVaga.bind(null, id);
  const moverEtapaAction = moverEtapaCandidatura.bind(null, id);
  const desfazerContratacaoAction = desfazerContratacao.bind(null, id);
  const encerrarCandidaturaAction = encerrarCandidatura.bind(null, id);

  const local = localDaVaga({ workCity: vaga.workCity, workStateCode: vaga.workStateCode, company: vaga.company });
  const fatos = fatosDaFicha(
    {
      cargo: vaga.cargo?.name ?? null,
      quantidade: vaga.quantity,
      contratadas: vaga.candidaturas.filter((c) => c.status === "CONTRATADO").length,
      prioridade: vaga.priority,
      abertaEm: vaga.openedAt,
      encerradaEm: vaga.closedAt,
      contrato: vaga.contractType,
      modalidade: vaga.workMode,
      cidade: local.cidade,
      uf: local.uf,
      salarioMin: vaga.salaryMin === null ? null : vaga.salaryMin.toNumber(),
      salarioMax: vaga.salaryMax === null ? null : vaga.salaryMax.toNumber(),
      mostrarSalario: vaga.showSalary,
    },
    agora
  );

  // Funil: separa candidaturas ativas (colunas do board) das encerradas
  // (reprovado/desistente, faixa embaixo). Os números do topo das colunas usam
  // TODAS (o stage preservado é o que mede quem alcançou cada etapa).
  // A trava do "Desfazer contratação" de cada contratado (30/10/2026): link de
  // admissão gerado ou contratação em outra vaga deixam o item desabilitado,
  // com o motivo. A action confere de novo na hora.
  const idsDosContratados = vaga.candidaturas.filter((c) => c.status === "CONTRATADO").map((c) => c.person.id);
  const [comLink, contratadosEmOutraVaga] = idsDosContratados.length
    ? await Promise.all([
        prisma.admissaoLink.findMany({ where: { tenantId: ctx.tenantId, personId: { in: idsDosContratados } }, select: { personId: true } }),
        prisma.candidatura.findMany({ where: { tenantId: ctx.tenantId, personId: { in: idsDosContratados }, status: "CONTRATADO", vagaId: { not: id } }, select: { personId: true } }),
      ])
    : [[], []];
  const pessoasComLink = new Set(comLink.map((l) => l.personId));
  const activeCards: FunnelCard[] = vaga.candidaturas
    .filter((c) => c.status !== "REPROVADO" && c.status !== "DESISTENTE")
    .map((c) => ({
      id: c.id,
      personId: c.person.id,
      personName: c.person.name,
      travaDoDesfazer:
        c.status === "CONTRATADO"
          ? travaDoDesfazer({
              statusDaCandidatura: c.status,
              pessoa: c.person,
              companyIdDaVaga: vaga.companyId,
              temLinkDeAdmissao: pessoasComLink.has(c.person.id),
              outrasContratacoes: contratadosEmOutraVaga.filter((o) => o.personId === c.person.id).length,
            })
          : undefined,
      origin: c.origin,
      hasResume: c.resumeUrl != null,
      stage: c.stage as Stage,
      scorecardCount: c._count.scorecards,
      respostas: resumoDasRespostas({
        pretensaoSalarial: c.pretensaoSalarial === null ? null : c.pretensaoSalarial.toNumber(),
        disponibilidade: c.disponibilidade,
        deslocamentoMinutos: c.deslocamentoMinutos,
      }),
      nota: (() => {
        const n = notaDa.get(c.id);
        return n ? { score: n.score, faixa: n.faixa as Faixa, desatualizada: n.requisitosId !== requisitos?.id } : null;
      })(),
    }))
    // Dentro de cada etapa, o mais aderente primeiro; sem nota vai para o fim.
    .sort(compararParaTriagem);
  const encerrados = vaga.candidaturas.filter((c) => c.status === "REPROVADO" || c.status === "DESISTENTE");
  // O quadro guarda os cartões no estado dele (para mover na hora, antes do
  // servidor responder) e só lê os do servidor ao montar. Esta chave o monta
  // de novo quando os dados mudam — candidato vinculado pelo painel, nota nova
  // da triagem —, senão o recém-chegado só aparecia recarregando a página.
  const versaoDoQuadro = createHash("sha1")
    .update(JSON.stringify([activeCards, encerrados.map((c) => [c.id, c.stage, c.status])]))
    .digest("hex")
    .slice(0, 16);

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Vagas", href: "/vagas" }, { label: vaga.title, truncate: true }]} />

      {/* Selo, empresa e ações dentro do próprio `PageHeader` (polimento de
          30/09): eram um cabeçalho montado em volta dele, e o selo ficava
          centrado na margem de baixo do título, e não no título. "Editar" era
          um link desenhado à mão como botão.
          07/10/2026 (auditoria DRG-23): o selo saiu do título para o `meta`,
          criado em 02/10 para "selos e datas embaixo do título" — o mesmo
          lugar do lead e da proposta do Valora. */}
      <PageHeader
        title={vaga.title}
        meta={
          <Selo cor={VAGA_STATUS_STYLE[vaga.status]}>
            {VAGA_STATUS_LABEL[vaga.status]}
          </Selo>
        }
        subtitle={<>{vaga.company.name} · {sectorLabels[vaga.sectorCode] ?? vaga.sectorCode}</>}
        action={
          canManage && (
          <div className="flex flex-wrap items-center gap-2">
            <Button href={`/vagas/${id}/editar`} variant="secondary" size="sm">
              <Pencil size={14} /> Editar
            </Button>
            {vaga.status !== "ENCERRADA" ? (
              <ConfirmActionButton
                action={encerrarAction}
                label="Encerrar vaga"
                title={`Encerrar "${vaga.title}"?`}
                description="A vaga sai das listagens ativas e do portal público. Os candidatos e o histórico do funil são preservados, e você pode reabrir a vaga depois."
                confirmLabel="Encerrar"
                successMessage="Vaga encerrada."
              />
            ) : (
              <ConfirmActionButton
                action={reabrirAction}
                label="Reabrir vaga"
                title={`Reabrir "${vaga.title}"?`}
                description="A vaga volta para o status Aberta e reaparece nas listagens. Se ela estava publicada no portal, volta a ficar visível."
                confirmLabel="Reabrir"
                successMessage="Vaga reaberta."
              />
            )}
            {/* Excluir vaga: só o administrador (13/10/2026). Encerrar segue com o gestor. */}
            {podeExcluir(ctx) && <DeleteButton action={deleteAction} nome={vaga.title} />}
          </div>
          )
        }
      />

      {/* A vaga no portal (escolha "Vaga · 2 B" do Kauan, 14/10/2026) e a faixa
          de fatos ("Vaga · 1 B"), no lugar do cartão "Detalhes" — ver
          src/lib/recrutamento/fichaDaVaga.ts. */}
      <FaixaDoPortal
        situacao={noPortal}
        url={linkPublico}
        urlCurta={linkPublico ? enderecoCurto(linkPublico) : null}
        whatsapp={linkAbsoluto ? linkDoWhatsApp(linkAbsoluto, vaga.title, vaga.company.tradeName || vaga.company.name) : null}
        podeEditar={canManage}
      />
      <FatosDaVaga fatos={fatos} observacoes={vaga.notes} />

      {coordenaRecrutamento && (
        <AcessoDosRecrutadores
          vagaId={id}
          restrita={vaga.restrictedToRecruiters}
          escolhidos={escolhidos.map((e) => e.userId)}
          recrutadores={recrutadores}
          podeEditar={canManageSector(ctx, SETOR_RECRUTAMENTO)}
        />
      )}

      <TriagemDaVaga
        vagaId={id}
        requisitos={requisitos}
        pendentes={pendentes}
        emAndamento={emAndamento.length}
        podeEditar={canManage}
        podePontuar={canAct}
        iaConfigurada={iaConfigurada}
      />

      {/* Funil de recrutamento. Os números de cada etapa ficam no topo da
          coluna do quadro (escolha "Vaga · 4 A" do Kauan, 14/10/2026): o
          gráfico de funil separado, em cima do quadro, saiu. No título, o
          "Adicionar candidato" ("Vaga · 5 A"), que substitui o formulário
          "Nova candidatura" do pé do cartão, e o "Perguntar à Ceci" ("Vaga · 6
          C"), que substitui o bloco "Assistente da vaga". */}
      <Card className="p-5 mb-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 className="text-section font-semibold text-fg">Funil de recrutamento</h2>
          {canAct && (
            <div className="flex flex-wrap items-center gap-2">
              {temCeci && <PerguntarACeci tituloDaVaga={vaga.title} />}
              <AdicionarCandidato vagaId={id} podeCadastrar={podeCadastrar} />
            </div>
          )}
        </div>

        {vaga.candidaturas.length === 0 ? (
          <p className="mt-2 text-fs-3 text-fg-muted">
            Nenhum candidato vinculado ainda.
            {canAct && " Em “Adicionar candidato”, busque no banco de talentos ou cadastre quem é novo."}
          </p>
        ) : (
          <>
            {/* Board arrastável */}
            <RecruitmentFunnel
              key={versaoDoQuadro}
              vagaId={id}
              cards={activeCards}
              encerradas={encerrados.map((c) => ({ stage: c.stage, status: c.status }))}
              quantidadeDeVagas={vaga.quantity}
              canManage={canManage}
              moveAction={moverEtapaAction}
              encerrarAction={encerrarCandidaturaAction}
              desfazerAction={desfazerContratacaoAction}
            />
            {canManage && (
              <p className="text-fs-1 text-fg-muted mt-2">
                Arraste os candidatos entre as etapas. Soltar em “Contratado” inicia a admissão.
              </p>
            )}

            {/* Encerrados */}
            {encerrados.length > 0 && (
              <div className="mt-5 pt-4 border-t border-border">
                <h3 className="text-fs-2 font-semibold text-fg-muted mb-2">
                  Encerrados ({encerrados.length})
                </h3>
                <div className="space-y-1.5">
                  {encerrados.map((c) => (
                    <div key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-fs-2">
                      <Link href={`/candidatos/${c.person.id}`} className="min-w-0 text-fg-secondary hover:text-brand transition-colors">
                        {c.person.name}
                      </Link>
                      <span className="min-w-0 text-fg-muted">
                        {c.status === "REPROVADO" ? "Reprovado" : "Desistente"}
                        {(c.rejectionReason || c.withdrawalReason) && ` · ${c.rejectionReason ?? c.withdrawalReason}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </PageContainer>
  );
}
