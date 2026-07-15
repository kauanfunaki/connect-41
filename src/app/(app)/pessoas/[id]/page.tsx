import Link from "next/link";
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
} from "lucide-react";
import { PersonType, PersonEmploymentStatus } from "@/generated/prisma/enums";
import { excluirPessoa } from "../actions";
import { PageContainer } from "@/components/shared/PageContainer";
import { PersonHeader } from "@/components/pessoas/PersonHeader";
import { PersonDetailTabs } from "@/components/pessoas/PersonDetailTabs";
import { CompanyHistorySection } from "@/components/empresas/CompanyHistorySection";
import { OperationsLinkList, type OperationLink } from "@/components/shared/OperationsLinkList";
import { getAuthContext, canWrite, isFullWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { getPersonSectors, getApplicableCustomFields } from "@/lib/customFields";
import { listDocuments } from "@/lib/documents";
import { DocumentsSection } from "@/components/documents/DocumentsSection";
import { formatCalendarDate, formatInstantDate } from "@/lib/format";

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

const VINCULO_LINKS: OperationLink[] = [
  { href: "escala", label: "Escala de Trabalho", description: "Turnos e dias de folga", icon: <CalendarClock size={16} /> },
  { href: "beneficios", label: "Benefícios", description: "Vale-refeição, plano de saúde e outros", icon: <Gift size={16} /> },
];

const TRABALHISTA_LINKS: OperationLink[] = [
  { href: "salario", label: "Salário", description: "Dados bancários e histórico de reajustes", icon: <Wallet size={16} /> },
  { href: "ferias", label: "Férias", description: "Períodos aquisitivo e concessivo", icon: <Palmtree size={16} /> },
  { href: "afastamentos", label: "Afastamentos", description: "Afastamentos e atestados", icon: <Stethoscope size={16} /> },
  { href: "desligamento", label: "Desligamento", description: "Processo de desligamento, se houver", icon: <UserMinus size={16} /> },
  { href: "horas-extras", label: "Horas Extras", description: "Lançamentos e aprovações", icon: <Clock size={16} /> },
  { href: "exames", label: "Exames Admissionais", description: "Exames e ASO", icon: <ClipboardCheck size={16} /> },
  { href: "avaliacoes", label: "Avaliações de Desempenho", description: "Ciclos de avaliação", icon: <Star size={16} /> },
  { href: "treinamentos", label: "Treinamentos", description: "Turmas e participações", icon: <GraduationCap size={16} /> },
];

export default async function PessoaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  const canEdit = canWrite(ctx.role);
  const canRequestHandoff = isFullWrite(ctx.role) || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);

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
      include: { pipeline: { select: { id: true, name: true } }, stage: { select: { name: true } } },
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

  const personSectors = await getPersonSectors(ctx.tenantId, id);
  const customFields = await getApplicableCustomFields(ctx, "PERSON", id, personSectors);

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

  const overviewContent = (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Identificação */}
      <div className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-[14px] font-semibold text-fg mb-4">Identificação</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <InfoRow label="Nome"               value={person.name} />
          <InfoRow label="Tipo"               value={TYPE_LABEL[person.type]} />
          <InfoRow label="CPF"                value={person.cpf} mono />
          <InfoRow
            label="Data de Nascimento"
            value={
              person.birthDate
                ? formatCalendarDate(person.birthDate, {
                    day: "2-digit", month: "long", year: "numeric",
                  })
                : null
            }
          />
          <InfoRow label="RG" value={person.rg} mono />
          <InfoRow label="PIS" value={person.pis} mono />
          <InfoRow label="CTPS" value={[person.ctps, person.ctpsSerie].filter(Boolean).join(" / ") || null} mono />
          <InfoRow label="Escolaridade" value={person.education} />
        </div>
      </div>

      {/* Contato */}
      <div className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-[14px] font-semibold text-fg mb-4">Contato</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <InfoRow label="E-mail"   value={person.email} />
          <InfoRow label="Telefone" value={person.phone} />
        </div>
      </div>

      {/* Endereço */}
      {fullAddress && (
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-[14px] font-semibold text-fg mb-4">Endereço</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            <InfoRow label="Logradouro"  value={[person.addressStreet, person.addressNumber].filter(Boolean).join(", ")} />
            <InfoRow label="Complemento" value={person.addressComplement} />
            <InfoRow label="Bairro"      value={person.neighborhood} />
            <InfoRow label="Cidade / UF" value={[person.city, person.stateCode].filter(Boolean).join(" — ")} />
            <InfoRow label="CEP"         value={person.zipCode} mono />
          </div>
        </div>
      )}
    </div>
  );

  const vinculoContent = (
    <div className="space-y-4">
      {/* Vínculo */}
      <div className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-[14px] font-semibold text-fg mb-4">Vínculo</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          {person.currentCompany ? (
            <div>
              <p className="text-[10px] text-fg-muted mb-0.5">Empresa atual</p>
              <Link
                href={`/empresas/${person.currentCompany.id}`}
                className="text-[13px] text-brand hover:underline"
              >
                {person.currentCompany.name}
              </Link>
            </div>
          ) : (
            <InfoRow label="Empresa atual" value={null} />
          )}
          <InfoRow label="Cargo" value={person.cargo?.name} />
          <InfoRow label="Departamento" value={person.department?.name} />
          <InfoRow
            label="Cadastrada em"
            value={formatInstantDate(person.createdAt, {
              day: "2-digit", month: "long", year: "numeric",
            })}
          />
        </div>
      </div>

      {person.type === "COLABORADOR" && <OperationsLinkList basePath={`/pessoas/${id}`} links={VINCULO_LINKS} />}
    </div>
  );

  const trabalhistaContent = (
    <div className="space-y-4">
      {/* Dados Trabalhistas */}
      {person.type === "COLABORADOR" && (
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-[14px] font-semibold text-fg mb-4">Dados Trabalhistas</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            <InfoRow label="Status" value={STATUS_LABEL[person.employmentStatus]} />
            <InfoRow
              label="Data de Admissão"
              value={person.admissionDate ? formatCalendarDate(person.admissionDate, { day: "2-digit", month: "long", year: "numeric" }) : null}
            />
            <InfoRow
              label="Data de Demissão"
              value={person.dismissalDate ? formatCalendarDate(person.dismissalDate, { day: "2-digit", month: "long", year: "numeric" }) : null}
            />
            <InfoRow label="Jornada" value={person.workShift} />
            <InfoRow label="Carga Horária Semanal" value={person.weeklyWorkHours?.toString()} />
            <InfoRow label="Carga Horária Mensal" value={person.monthlyWorkHours?.toString()} />
          </div>
        </div>
      )}

      {person.type === "COLABORADOR" && <OperationsLinkList basePath={`/pessoas/${id}`} links={TRABALHISTA_LINKS} />}

      {/* Campos Adicionais (setoriais) */}
      {customFields.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-[14px] font-semibold text-fg mb-4">Campos Adicionais</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            {customFields.map((f) => (
              <InfoRow
                key={f.id}
                label={f.label}
                value={f.fieldType === "BOOLEAN" ? (f.value === "true" ? "Sim" : "Não") : f.value}
              />
            ))}
          </div>
        </div>
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
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-5">
        <Link href="/pessoas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Pessoas
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg truncate">{person.name}</span>
      </div>

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
        history={historyContent}
      />
    </PageContainer>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] text-fg-muted mb-0.5">{label}</p>
      <p className={`text-[13px] text-fg ${mono ? "tnum" : ""}`}>{value ?? "—"}</p>
    </div>
  );
}
