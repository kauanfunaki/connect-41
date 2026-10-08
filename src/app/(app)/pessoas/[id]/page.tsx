import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import {
  Wallet,
  Palmtree,
  Stethoscope,
  UserMinus,
  Clock,
  ClipboardCheck,
  CalendarClock,
  Gift,
  Star,
  GraduationCap,
  FileSpreadsheet,
  KeyRound,
} from "lucide-react";
import { PersonType, PersonEmploymentStatus } from "@/generated/prisma/enums";
import { excluirPessoa } from "../actions";
import { Button } from "@/components/ui/Button";
import { PessoaBreadcrumb } from "@/components/pessoas/PessoaBreadcrumb";
import { PageContainer } from "@/components/shared/PageContainer";
import { PersonHeader } from "@/components/pessoas/PersonHeader";
import { PersonDetailTabs } from "@/components/pessoas/PersonDetailTabs";
import { AdmissaoCard } from "@/components/pessoas/AdmissaoCard";
import { horasDoDP } from "@/components/pessoas/rotulosDoDP";
import { Badge } from "@/components/ui/Badge";
import { InfoRow } from "@/components/empresas/InfoRow";
import { CompanyHistorySection } from "@/components/empresas/CompanyHistorySection";
import { OperationsLinkList, type OperationLink } from "@/components/shared/OperationsLinkList";
import { getAuthContext, canWrite, isFullWrite } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { getPersonSectors, getApplicableCustomFields } from "@/lib/customFields";
import { listDocuments } from "@/lib/documents";
import { DocumentsSection } from "@/components/documents/DocumentsSection";
import { AtendimentosAccordion } from "@/components/conversas/AtendimentosAccordion";
import { channelLabel, statusLabel } from "@/lib/chatwoot/labels";
import { safeFindConversations } from "@/lib/chatwoot/conversations";
import { formatCalendarDate, formatInstantDate, maskCpf, formatPhone, formatCep } from "@/lib/format";

const TYPE_LABEL: Record<PersonType, string> = {
  CANDIDATO:   "Candidato",
  COLABORADOR: "Colaborador",
};

const STATUS_LABEL: Record<PersonEmploymentStatus, string> = {
  ADMISSAO_EM_ANDAMENTO: "Admissão em andamento",
  ATIVO:                 "Ativo",
  EM_FERIAS:              "Em férias",
  AFASTADO:               "Afastado",
  DESLIGADO:              "Desligado",
};

const DEP_REL_LABEL: Record<string, string> = {
  FILHO:       "Filho(a)",
  ENTEADO:     "Enteado(a)",
  CONJUGE:     "Cônjuge",
  COMPANHEIRO: "Companheiro(a)",
  PAIS:        "Pai / Mãe",
  OUTRO:       "Outro",
};

// Mesma grade e mesmo título da ficha de empresa (CompanyOverviewSection).
const GRADE = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4";
const TITULO = "text-section font-semibold text-fg mb-4";

const VINCULO_LINKS: OperationLink[] = [
  { href: "escala", label: "Escala de trabalho", description: "Turnos e dias de folga", icon: <CalendarClock size={16} /> },
  { href: "beneficios", label: "Benefícios", description: "Vale-refeição, plano de saúde e outros", icon: <Gift size={16} /> },
];

const TRABALHISTA_LINKS: OperationLink[] = [
  { href: "salario", label: "Salário", description: "Dados bancários e histórico de reajustes", icon: <Wallet size={16} /> },
  { href: "ferias", label: "Férias", description: "Períodos aquisitivo e concessivo", icon: <Palmtree size={16} /> },
  { href: "afastamentos", label: "Afastamentos", description: "Afastamentos e atestados", icon: <Stethoscope size={16} /> },
  { href: "desligamento", label: "Desligamento", description: "Processo de desligamento, se houver", icon: <UserMinus size={16} /> },
  { href: "horas-extras", label: "Horas extras", description: "Lançamentos e aprovações", icon: <Clock size={16} /> },
  { href: "exames", label: "Exames admissionais", description: "Exames e ASO", icon: <ClipboardCheck size={16} /> },
  { href: "avaliacoes", label: "Avaliações de desempenho", description: "Ciclos de avaliação", icon: <Star size={16} /> },
  { href: "treinamentos", label: "Treinamentos", description: "Turmas e participações", icon: <GraduationCap size={16} /> },
  { href: "esocial-s2200", label: "eSocial S-2200 (rascunho)", description: "Conferência dos dados de admissão", icon: <FileSpreadsheet size={16} /> },
];

// Cada atalho abre uma tela de um módulo do DP, que responde 404 a quem não é
// do setor que opera o módulo (02/10/2026). Quem não alcança não vê o atalho.
const MODULO_DO_ATALHO: Record<string, string> = {
  escala: "dp_escalas",
  beneficios: "dp_colaboradores",
  salario: "dp_colaboradores",
  ferias: "dp_colaboradores",
  afastamentos: "dp_afastamentos",
  desligamento: "dp_colaboradores",
  "horas-extras": "dp_horas_extras",
  exames: "dp_colaboradores",
  avaliacoes: "dp_avaliacoes",
  treinamentos: "dp_treinamentos",
  "esocial-s2200": "dp_colaboradores",
};

export default async function PessoaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  const canEdit = canWrite(ctx.role);
  const canRequestHandoff = isFullWrite(ctx.role) || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);
  const modulosDosAtalhos = [...new Set(Object.values(MODULO_DO_ATALHO))];
  const alcancados = new Set(
    (await Promise.all(modulosDosAtalhos.map(async (m) => ((await podeNoModulo(ctx, m, "ver")) ? m : null)))).filter(Boolean)
  );
  const atalhosDoVinculo = VINCULO_LINKS.filter((l) => alcancados.has(MODULO_DO_ATALHO[l.href]));
  const atalhosTrabalhistas = TRABALHISTA_LINKS.filter((l) => alcancados.has(MODULO_DO_ATALHO[l.href]));

  const prisma = getPrisma();
  const [person, documents, pipelineItems, historyActivities] = await Promise.all([
    prisma.person.findFirst({
      where: { id, type: PersonType.COLABORADOR, ...(await scopedPersonWhere(ctx)) },
      include: {
        currentCompany: { select: { id: true, name: true } },
        cargo: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    }),
    listDocuments(ctx.tenantId, "PERSON", id),
    prisma.pipelineItem.findMany({
      where: { tenantId: ctx.tenantId, entityType: "PERSON", entityId: id },
      include: { pipeline: { select: { id: true, name: true, sectorCode: true } }, stage: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.activity.findMany({
      where: { tenantId: ctx.tenantId, pipelineItem: { entityType: "PERSON", entityId: id } },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { user: { select: { name: true } }, pipelineItem: { include: { pipeline: { select: { name: true } } } } },
    }),
  ]);

  if (!person) notFound();

  const deleteAction = excluirPessoa.bind(null, id);

  const linkedUser = person.isInternal && person.linkedUserId
    ? await prisma.user.findFirst({ where: { id: person.linkedUserId }, select: { name: true, email: true } })
    : null;

  const personSectors = await getPersonSectors(ctx.tenantId, id);
  const customFields = await getApplicableCustomFields(ctx, "PERSON", id, personSectors);

  const conversations = await safeFindConversations(() =>
    prisma.chatwootConversation.findMany({
      where: { tenantId: ctx.tenantId, contactLink: { personId: id } },
      orderBy: { lastActivityAt: "desc" },
      take: 20,
    })
  );

  // Admissão digital: carrega o link ativo (não concluído) só quando faz sentido
  // — colaborador ainda em admissão.
  const admissaoLink =
    person.employmentStatus === "ADMISSAO_EM_ANDAMENTO"
      ? await prisma.admissaoLink.findFirst({
          where: { personId: id, tenantId: ctx.tenantId, status: { not: "CONCLUIDO" } },
          orderBy: { createdAt: "desc" },
          select: { status: true, token: true, expiresAt: true, submittedAt: true },
        })
      : null;

  const initialAdmissaoLink =
    admissaoLink?.status === "PENDENTE"
      ? { status: "PENDENTE" as const, token: admissaoLink.token, expiresAtLabel: formatInstantDate(admissaoLink.expiresAt) }
      : admissaoLink?.status === "PREENCHIDO"
        ? { status: "PREENCHIDO" as const, submittedAtLabel: admissaoLink.submittedAt ? formatInstantDate(admissaoLink.submittedAt) : "—" }
        : null;

  const dependentes =
    person.type === "COLABORADOR"
      ? await prisma.dependente.findMany({
          where: { personId: id, tenantId: ctx.tenantId },
          orderBy: { createdAt: "asc" },
        })
      : [];

  const fullAddress = [
    person.addressStreet,
    person.addressNumber,
    person.addressComplement,
    person.neighborhood,
    person.city,
    person.stateCode,
  ]
    .filter(Boolean)
    .join(", ");

  // Revisão de alinhamento (30/09): os cartões da ficha seguem a ficha da
  // empresa — Card, título de seção e a mesma grade de rótulo/valor
  // (InfoRow), com as colunas batendo de um cartão para o outro. Antes eram
  // blocos montados à mão com título de 14px e rótulo de 11px, e o cartão de
  // Observações (largura dupla) caía no meio da grade de duas colunas,
  // deixando um buraco ao lado da Identificação.
  const dataLonga = (d: Date) => formatCalendarDate(d, { day: "2-digit", month: "long", year: "numeric" });

  const overviewContent = (
    <div className="space-y-4">
      {person.employmentStatus === "ADMISSAO_EM_ANDAMENTO" && (
        <AdmissaoCard personId={id} initialLink={initialAdmissaoLink} canManage={canEdit} urlPublica={(process.env.APP_PUBLIC_URL ?? "").replace(/\/$/, "")} />
      )}

      <Card className="p-5">
        <h2 className={TITULO}>Identificação</h2>
        <div className={GRADE}>
          <InfoRow label="Nome" value={person.name} className="sm:col-span-2" />
          <InfoRow label="Tipo" value={TYPE_LABEL[person.type]} />
          <InfoRow label="CPF" value={maskCpf(person.cpf)} mono />
          <InfoRow label="Data de nascimento" value={person.birthDate ? dataLonga(person.birthDate) : null} />
          <InfoRow label="RG" value={person.rg} mono />
          <InfoRow label="PIS" value={person.pis} mono />
          <InfoRow label="CTPS" value={[person.ctps, person.ctpsSerie].filter(Boolean).join(" / ") || null} mono />
          <InfoRow label="Escolaridade" value={person.education} className="sm:col-span-2" />
        </div>
      </Card>

      {/* Cartões lado a lado com a mesma altura (items-stretch + h-full). */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        <Card className="p-5 h-full">
          <h2 className={TITULO}>Contato</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
            <InfoRow label="E-mail" value={person.email} />
            <InfoRow label="Telefone" value={formatPhone(person.phone)} />
          </div>
        </Card>

        {/* Endereço */}
        {fullAddress && (
          <Card className="p-5 h-full">
            <h2 className={TITULO}>Endereço</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
              <InfoRow label="Logradouro" value={[person.addressStreet, person.addressNumber].filter(Boolean).join(", ")} />
              <InfoRow label="Complemento" value={person.addressComplement} />
              <InfoRow label="Bairro" value={person.neighborhood} />
              <InfoRow label="Cidade / UF" value={[person.city, person.stateCode].filter(Boolean).join(" — ")} />
              <InfoRow label="CEP" value={formatCep(person.zipCode)} mono />
            </div>
          </Card>
        )}

        {/* Conta de acesso — só funcionários internos. Somente leitura aqui: o
            vínculo (e o de atendente Chatwoot, se houver) é editado numa tela só
            em Admin → Vínculos de Acesso. */}
        {person.isInternal && (
          <Card className="p-5 h-full">
            <h2 className={TITULO}>Conta de acesso</h2>
            <p className="text-body text-fg break-words">
              {linkedUser ? `${linkedUser.name} (${linkedUser.email})` : "Não vinculada"}
            </p>
            {/* Era um link de texto (até 30/09): é uma ação, virou botão. */}
            {canEdit && (
              <Button href="/admin/atendentes" variant="secondary" size="sm" className="mt-4">
                <KeyRound size={14} />
                Gerenciar vínculo em Admin → Vínculos de acesso
              </Button>
            )}
          </Card>
        )}
      </div>

      {person.notes && (
        <Card className="p-5">
          <h2 className={TITULO}>Observações</h2>
          <p className="text-body text-fg-secondary whitespace-pre-wrap">{person.notes}</p>
        </Card>
      )}
    </div>
  );

  const vinculoContent = (
    <div className="space-y-4">
      <Card className="p-5">
        <h2 className={TITULO}>Vínculo</h2>
        <div className={GRADE}>
          <InfoRow label="Empresa atual" className="sm:col-span-2">
            {person.currentCompany ? (
              <Link href={`/empresas/${person.currentCompany.id}`} className="text-brand hover:underline">
                {person.currentCompany.name}
              </Link>
            ) : (
              "—"
            )}
          </InfoRow>
          <InfoRow label="Cargo" value={person.cargo?.name} />
          <InfoRow label="Departamento" value={person.department?.name} />
          <InfoRow label="Cadastrada em" value={formatInstantDate(person.createdAt, { day: "2-digit", month: "long", year: "numeric" })} />
        </div>
      </Card>

      {person.type === "COLABORADOR" && atalhosDoVinculo.length > 0 && (
        <OperationsLinkList basePath={`/pessoas/${id}`} links={atalhosDoVinculo} />
      )}
    </div>
  );

  const trabalhistaContent = (
    <div className="space-y-4">
      {/* Dados Trabalhistas */}
      {person.type === "COLABORADOR" && (
        <Card className="p-5">
          <h2 className={TITULO}>Dados trabalhistas</h2>
          <div className={GRADE}>
            <InfoRow label="Status" value={STATUS_LABEL[person.employmentStatus]} />
            <InfoRow label="Data de admissão" value={person.admissionDate ? dataLonga(person.admissionDate) : null} />
            <InfoRow label="Data de demissão" value={person.dismissalDate ? dataLonga(person.dismissalDate) : null} />
            <InfoRow label="Jornada" value={person.workShift} />
            <InfoRow
              label="Carga horária semanal"
              value={person.weeklyWorkHours != null ? horasDoDP(person.weeklyWorkHours) : null}
            />
            <InfoRow
              label="Carga horária mensal"
              value={person.monthlyWorkHours != null ? horasDoDP(person.monthlyWorkHours) : null}
            />
          </div>
        </Card>
      )}

      {/* Dependentes */}
      {person.type === "COLABORADOR" && dependentes.length > 0 && (
        <Card className="p-5">
          <h2 className="text-section font-semibold text-fg mb-2">Dependentes</h2>
          <div className="divide-y divide-border">
            {dependentes.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-body text-fg">{d.name}</p>
                  <p className="text-helper text-fg-muted mt-0.5">
                    {DEP_REL_LABEL[d.relationship] ?? d.relationship}
                    {d.birthDate && ` · ${formatCalendarDate(d.birthDate)}`}
                    {d.cpf && ` · CPF ${maskCpf(d.cpf)}`}
                  </p>
                </div>
                <div className="flex gap-1.5 flex-shrink-0">
                  {d.isIRDependent && <Badge variant="info">IR</Badge>}
                  {d.isSalarioFamilia && <Badge variant="neutral">Salário-família</Badge>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {person.type === "COLABORADOR" && atalhosTrabalhistas.length > 0 && (
        <OperationsLinkList basePath={`/pessoas/${id}`} links={atalhosTrabalhistas} />
      )}

      {/* Campos Adicionais (setoriais) */}
      {customFields.length > 0 && (
        <Card className="p-5">
          <h2 className={TITULO}>Campos adicionais</h2>
          <div className={GRADE}>
            {customFields.map((f) => (
              <InfoRow
                key={f.id}
                label={f.label}
                value={f.fieldType === "BOOLEAN" ? (f.value === "true" ? "Sim" : "Não") : f.value}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );

  const documentsContent = (
    <DocumentsSection
      entityType="PERSON"
      entityId={id}
      canUpload={canEdit}
      documents={documents.map((d) => ({
        id: d.id,
        fileName: d.fileName,
        category: d.category,
        sensitive: d.sensitive,
        uploadedByName: d.uploadedBy.name,
        createdAtLabel: formatInstantDate(d.createdAt),
        expiresAtLabel: d.expiresAt ? formatCalendarDate(d.expiresAt) : null,
        expired: d.expiresAt != null && d.expiresAt < new Date(),
      }))}
    />
  );

  const historyContent = (
    <CompanyHistorySection
      entityLabel="pessoa"
      pipelineItems={pipelineItems.map((p) => ({
        id: p.id,
        pipelineId: p.pipeline.id,
        pipelineName: p.pipeline.name,
        pipelineSectorCode: p.pipeline.sectorCode,
        stageName: p.stage.name,
      }))}
      activities={historyActivities.map((a) => ({
        id: a.id,
        type: a.type,
        content: a.content,
        createdAt: a.createdAt,
        userName: a.user.name,
        contextLabel: a.pipelineItem.pipeline.name,
      }))}
    />
  );

  return (
    <PageContainer>
      {/* A lista de origem depende de quem é a pessoa (ver PessoaBreadcrumb);
          era uma cópia à mão da mesma trilha das sub-páginas até 30/09. */}
      <PessoaBreadcrumb isInternal={person.isInternal} personId={id} personName={person.name} />

      <PersonHeader
        id={id}
        name={person.name}
        photoUrl={person.photoUrl}
        type={person.type}
        employmentStatus={person.employmentStatus}
        cpf={person.cpf}
        email={person.email}
        phone={person.phone}
        companyId={person.currentCompany?.id ?? null}
        companyName={person.currentCompany?.name ?? null}
        canEdit={canEdit}
        canRequestHandoff={canRequestHandoff}
        deleteAction={deleteAction}
      />

      <PersonDetailTabs
        overview={overviewContent}
        vinculo={vinculoContent}
        trabalhista={trabalhistaContent}
        documents={documentsContent}
        documentsCount={documents.length}
        conversations={
          <Card className="px-4 py-2">
            <AtendimentosAccordion
              atendimentos={conversations.map((c) => ({
                id: c.id,
                dateLabel: c.lastActivityAt ? formatInstantDate(c.lastActivityAt) : "Sem data",
                channelLabel: channelLabel(c.channel),
                statusLabel: statusLabel(c.status),
                status: c.status,
                assigneeLabel: c.assigneeLabel,
                messageCount: c.messageCount,
              }))}
            />
          </Card>
        }
        conversationsCount={conversations.length}
        history={historyContent}
      />
    </PageContainer>
  );
}
