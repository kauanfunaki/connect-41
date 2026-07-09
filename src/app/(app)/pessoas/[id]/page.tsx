import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PersonType, PersonEmploymentStatus, TrainingParticipantStatus } from "@/generated/prisma/enums";
import { excluirPessoa } from "../actions";
import { PageContainer } from "@/components/shared/PageContainer";
import { PersonHeader } from "@/components/pessoas/PersonHeader";
import { PersonDetailTabs } from "@/components/pessoas/PersonDetailTabs";
import { CompanyHistorySection } from "@/components/empresas/CompanyHistorySection";
import { getAuthContext, canWrite, isFullWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";
import { getPersonSectors, getApplicableCustomFields } from "@/lib/customFields";
import { listDocuments } from "@/lib/documents";
import { DocumentsSection } from "@/components/documents/DocumentsSection";
import { AddExameForm } from "@/components/pessoas/AddExameForm";
import { ExameRow } from "@/components/pessoas/ExameRow";
import { criarExame, atualizarExame, excluirExame } from "./exames/actions";
import { SalaryHistorySection } from "@/components/pessoas/SalaryHistorySection";
import { registrarReajuste } from "./salario/actions";
import { AddFeriasForm } from "@/components/pessoas/AddFeriasForm";
import { FeriasRow } from "@/components/pessoas/FeriasRow";
import { criarFerias, atualizarFerias, excluirFerias } from "./ferias/actions";
import { AddAfastamentoForm } from "@/components/pessoas/AddAfastamentoForm";
import { AfastamentoRow } from "@/components/pessoas/AfastamentoRow";
import { criarAfastamento, atualizarAfastamento, excluirAfastamento } from "./afastamentos/actions";
import { AddDesligamentoForm } from "@/components/pessoas/AddDesligamentoForm";
import { DesligamentoRow } from "@/components/pessoas/DesligamentoRow";
import { criarDesligamento, atualizarDesligamento, excluirDesligamento } from "./desligamento/actions";
import { AddHoraExtraForm } from "@/components/pessoas/AddHoraExtraForm";
import { HoraExtraRow } from "@/components/pessoas/HoraExtraRow";
import { criarHoraExtra, atualizarHoraExtra, excluirHoraExtra } from "./horas-extras/actions";
import { AddBeneficioForm } from "@/components/pessoas/AddBeneficioForm";
import { BeneficioRow } from "@/components/pessoas/BeneficioRow";
import { vincularBeneficio, atualizarBeneficioAssignment, removerBeneficioAssignment } from "./beneficios/actions";
import { AddEscalaForm } from "@/components/pessoas/AddEscalaForm";
import { EscalaRow } from "@/components/pessoas/EscalaRow";
import { criarEscala, atualizarEscala, excluirEscala } from "./escala/actions";

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

const TRAINING_STATUS_LABEL: Record<TrainingParticipantStatus, string> = {
  PLANEJADO: "Planejado",
  CONVOCADO: "Convocado",
  REALIZADO: "Realizado",
  AUSENTE:   "Ausente",
  REPROVADO: "Reprovado",
  CONCLUIDO: "Concluído",
  VENCIDO:   "Vencido",
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

  const prisma = getPrisma();
  const [person, canViewBank, canViewSalary, canViewMedical, documents, exames, salaryHistory, vacations, absences, terminations, overtimeEntries, beneficios, escala, trainingParticipations, evaluations, pipelineItems, historyActivities] = await Promise.all([
    prisma.person.findFirst({
      where: { id, type: PersonType.COLABORADOR, ...(await scopedPersonWhere(ctx)) },
      include: {
        currentCompany: { select: { id: true, name: true } },
        cargo: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
      },
    }),
    canViewSensitiveField(ctx, "DADOS_BANCARIOS"),
    canViewSensitiveField(ctx, "SALARIO"),
    canViewSensitiveField(ctx, "DADOS_MEDICOS"),
    listDocuments(ctx.tenantId, "PERSON", id),
    prisma.exameAdmissional.findMany({ where: { tenantId: ctx.tenantId, personId: id }, orderBy: { createdAt: "desc" } }),
    prisma.salaryChange.findMany({
      where: { tenantId: ctx.tenantId, personId: id },
      orderBy: { effectiveDate: "desc" },
      include: { cargo: { select: { name: true } } },
    }),
    prisma.vacation.findMany({ where: { tenantId: ctx.tenantId, personId: id }, orderBy: { acquisitivePeriodStart: "desc" } }),
    prisma.absence.findMany({ where: { tenantId: ctx.tenantId, personId: id }, orderBy: { startDate: "desc" } }),
    prisma.termination.findMany({ where: { tenantId: ctx.tenantId, personId: id }, orderBy: { requestedAt: "desc" } }),
    prisma.overtimeEntry.findMany({ where: { tenantId: ctx.tenantId, personId: id }, orderBy: { date: "desc" } }),
    prisma.benefitAssignment.findMany({
      where: { tenantId: ctx.tenantId, personId: id },
      orderBy: { startDate: "desc" },
      include: { benefit: { select: { name: true } } },
    }),
    prisma.scheduleEntry.findMany({
      where: { tenantId: ctx.tenantId, personId: id },
      orderBy: { date: "desc" },
      include: { shift: { select: { name: true } } },
    }),
    prisma.trainingParticipant.findMany({
      where: { tenantId: ctx.tenantId, personId: id },
      orderBy: { createdAt: "desc" },
      include: { class: { select: { id: true, date: true, training: { select: { id: true, name: true } } } } },
    }),
    prisma.evaluation.findMany({
      where: { tenantId: ctx.tenantId, personId: id },
      orderBy: { evaluationDate: "desc" },
      include: { cycle: { select: { id: true, name: true } } },
    }),
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
  const criarExameAction = criarExame.bind(null, id);
  const registrarReajusteAction = registrarReajuste.bind(null, id);
  const criarFeriasAction = criarFerias.bind(null, id);
  const criarAfastamentoAction = criarAfastamento.bind(null, id);
  const criarDesligamentoAction = criarDesligamento.bind(null, id);
  const criarHoraExtraAction = criarHoraExtra.bind(null, id);
  const vincularBeneficioAction = vincularBeneficio.bind(null, id);
  const criarEscalaAction = criarEscala.bind(null, id);
  const beneficiosDisponiveis = person.currentCompanyId
    ? await prisma.benefitCatalog.findMany({
        where: { tenantId: ctx.tenantId, companyId: person.currentCompanyId, active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];
  const turnosDisponiveis = person.currentCompanyId
    ? await prisma.workShift.findMany({
        where: { tenantId: ctx.tenantId, companyId: person.currentCompanyId, active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];
  const cargosDaEmpresa = person.currentCompanyId
    ? await prisma.cargo.findMany({
        where: { tenantId: ctx.tenantId, companyId: person.currentCompanyId, active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

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
                ? person.birthDate.toLocaleDateString("pt-BR", {
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
            value={person.createdAt.toLocaleDateString("pt-BR", {
              day: "2-digit", month: "long", year: "numeric",
            })}
          />
        </div>
      </div>

      {/* Escala de Trabalho */}
      {person.type === "COLABORADOR" && (
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-[14px] font-semibold text-fg mb-3">
            Escala de Trabalho {escala.length > 0 && `(${escala.length})`}
          </h2>

          {escala.length === 0 ? (
            <p className="text-[13px] text-fg-muted mb-3">Nenhuma escala montada ainda.</p>
          ) : (
            <div>
              {escala.map((e) => (
                <EscalaRow
                  key={e.id}
                  escala={{
                    id: e.id,
                    dateLabel: e.date.toLocaleDateString("pt-BR"),
                    shiftName: e.shift?.name ?? null,
                    dayOff: e.dayOff,
                    isHoliday: e.isHoliday,
                    status: e.status,
                  }}
                  updateAction={atualizarEscala.bind(null, id, e.id)}
                  removeAction={excluirEscala.bind(null, id, e.id)}
                  canManage={canEdit}
                />
              ))}
            </div>
          )}

          {canEdit && <AddEscalaForm action={criarEscalaAction} shifts={turnosDisponiveis} />}
        </div>
      )}

      {/* Benefícios */}
      {person.type === "COLABORADOR" && (
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-[14px] font-semibold text-fg mb-3">
            Benefícios {beneficios.length > 0 && `(${beneficios.length})`}
          </h2>

          {beneficios.length === 0 ? (
            <p className="text-[13px] text-fg-muted mb-3">Nenhum benefício vinculado ainda.</p>
          ) : (
            <div>
              {beneficios.map((b) => (
                <BeneficioRow
                  key={b.id}
                  beneficio={{
                    id: b.id,
                    benefitName: b.benefit.name,
                    status: b.status,
                    companyValue: b.companyValue?.toString() ?? null,
                    discountValue: b.discountValue?.toString() ?? null,
                    startDateLabel: b.startDate.toLocaleDateString("pt-BR"),
                    endDateLabel: b.endDate?.toLocaleDateString("pt-BR") ?? null,
                  }}
                  updateAction={atualizarBeneficioAssignment.bind(null, id, b.id)}
                  removeAction={removerBeneficioAssignment.bind(null, id, b.id)}
                  canManage={canEdit}
                />
              ))}
            </div>
          )}

          {canEdit && <AddBeneficioForm action={vincularBeneficioAction} beneficios={beneficiosDisponiveis} />}
        </div>
      )}
    </div>
  );

  const trabalhistaContent = (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Dados Trabalhistas */}
        {person.type === "COLABORADOR" && (
          <div className="bg-surface border border-border rounded-lg p-5">
            <h2 className="text-[14px] font-semibold text-fg mb-4">Dados Trabalhistas</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              <InfoRow label="Status" value={STATUS_LABEL[person.employmentStatus]} />
              <InfoRow
                label="Data de Admissão"
                value={person.admissionDate?.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
              />
              <InfoRow
                label="Data de Demissão"
                value={person.dismissalDate?.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
              />
              <InfoRow label="Jornada" value={person.workShift} />
              <InfoRow label="Carga Horária Semanal" value={person.weeklyWorkHours?.toString()} />
              <InfoRow label="Carga Horária Mensal" value={person.monthlyWorkHours?.toString()} />
            </div>
          </div>
        )}

        {/* Dados Bancários e Salário (sensível) */}
        {person.type === "COLABORADOR" && (canViewBank || canViewSalary) && (
          <div className="bg-surface border border-border rounded-lg p-5">
            <h2 className="text-[14px] font-semibold text-fg mb-4">Dados Bancários e Salário</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              {canViewSalary && (
                <InfoRow
                  label="Salário Atual"
                  value={person.currentSalary != null ? `R$ ${person.currentSalary.toString()}` : null}
                />
              )}
              {canViewBank && (
                <>
                  <InfoRow label="Banco" value={person.bankName} />
                  <InfoRow label="Agência" value={person.bankAgency} mono />
                  <InfoRow label="Conta" value={person.bankAccount} mono />
                  <InfoRow label="Tipo de Conta" value={person.bankAccountType} />
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Histórico Salarial */}
      {person.type === "COLABORADOR" && canViewSalary && (
        <SalaryHistorySection
          action={registrarReajusteAction}
          cargos={cargosDaEmpresa}
          history={salaryHistory.map((h) => ({
            id: h.id,
            previousSalary: h.previousSalary?.toString() ?? null,
            newSalary: h.newSalary.toString(),
            changePercent: h.changePercent?.toString() ?? null,
            cargoName: h.cargo?.name ?? null,
            reason: h.reason,
            effectiveDateLabel: h.effectiveDate.toLocaleDateString("pt-BR"),
          }))}
        />
      )}

      {/* Férias */}
      {person.type === "COLABORADOR" && (
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-[14px] font-semibold text-fg mb-3">
            Férias {vacations.length > 0 && `(${vacations.length})`}
          </h2>

          {vacations.length === 0 ? (
            <p className="text-[13px] text-fg-muted mb-3">Nenhuma férias programada ainda.</p>
          ) : (
            <div>
              {vacations.map((v) => (
                <FeriasRow
                  key={v.id}
                  ferias={{
                    id: v.id,
                    status: v.status,
                    acquisitivePeriodLabel: `${v.acquisitivePeriodStart.toLocaleDateString("pt-BR")} — ${v.acquisitivePeriodEnd.toLocaleDateString("pt-BR")}`,
                    concessivePeriodLabel: v.concessivePeriodStart && v.concessivePeriodEnd
                      ? `${v.concessivePeriodStart.toLocaleDateString("pt-BR")} — ${v.concessivePeriodEnd.toLocaleDateString("pt-BR")}`
                      : null,
                    days: v.days,
                    isVencida: !!v.concessivePeriodEnd && v.concessivePeriodEnd < new Date() && !["CONCLUIDA", "CANCELADA"].includes(v.status),
                  }}
                  updateAction={atualizarFerias.bind(null, id, v.id)}
                  removeAction={excluirFerias.bind(null, id, v.id)}
                  canManage={canEdit}
                />
              ))}
            </div>
          )}

          {canEdit && <AddFeriasForm action={criarFeriasAction} />}
        </div>
      )}

      {/* Afastamentos/Atestados */}
      {person.type === "COLABORADOR" && (
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-[14px] font-semibold text-fg mb-3">
            Afastamentos e Atestados {absences.length > 0 && `(${absences.length})`}
          </h2>

          {absences.length === 0 ? (
            <p className="text-[13px] text-fg-muted mb-3">Nenhum afastamento registrado ainda.</p>
          ) : (
            <div>
              {absences.map((a) => (
                <AfastamentoRow
                  key={a.id}
                  afastamento={{
                    id: a.id,
                    type: a.type,
                    status: a.status,
                    startDateLabel: a.startDate.toLocaleDateString("pt-BR"),
                    returnDateLabel: a.returnDate?.toLocaleDateString("pt-BR") ?? null,
                    lostDays: a.lostDays,
                    reason: a.reason,
                  }}
                  updateAction={atualizarAfastamento.bind(null, id, a.id)}
                  removeAction={excluirAfastamento.bind(null, id, a.id)}
                  canManage={canEdit}
                  canViewMedical={canViewMedical}
                />
              ))}
            </div>
          )}

          {canEdit && <AddAfastamentoForm action={criarAfastamentoAction} canEditMedical={canViewMedical} />}
        </div>
      )}

      {/* Desligamento */}
      {person.type === "COLABORADOR" && (
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-[14px] font-semibold text-fg mb-3">
            Desligamento {terminations.length > 0 && `(${terminations.length})`}
          </h2>

          {terminations.length === 0 ? (
            <p className="text-[13px] text-fg-muted mb-3">Nenhum desligamento registrado.</p>
          ) : (
            <div>
              {terminations.map((t) => (
                <DesligamentoRow
                  key={t.id}
                  desligamento={{
                    id: t.id,
                    type: t.type,
                    status: t.status,
                    reason: t.reason,
                    requestedAtLabel: t.requestedAt.toLocaleDateString("pt-BR"),
                    finalizedAtLabel: t.finalizedAt?.toLocaleDateString("pt-BR") ?? null,
                  }}
                  updateAction={atualizarDesligamento.bind(null, id, t.id)}
                  removeAction={excluirDesligamento.bind(null, id, t.id)}
                  canManage={canEdit}
                />
              ))}
            </div>
          )}

          {canEdit && terminations.every((t) => t.status === "CANCELADO") && (
            <AddDesligamentoForm action={criarDesligamentoAction} />
          )}
        </div>
      )}

      {/* Horas Extras */}
      {person.type === "COLABORADOR" && (
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-[14px] font-semibold text-fg mb-3">
            Horas Extras {overtimeEntries.length > 0 && `(${overtimeEntries.length})`}
          </h2>

          {overtimeEntries.length === 0 ? (
            <p className="text-[13px] text-fg-muted mb-3">Nenhum lançamento de horas extras ainda.</p>
          ) : (
            <div>
              {overtimeEntries.map((o) => (
                <HoraExtraRow
                  key={o.id}
                  entry={{
                    id: o.id,
                    dateLabel: o.date.toLocaleDateString("pt-BR"),
                    dayType: o.dayType,
                    overtimeHours: o.overtimeHours?.toString() ?? null,
                    status: o.status,
                    justification: o.justification,
                  }}
                  updateAction={atualizarHoraExtra.bind(null, id, o.id)}
                  removeAction={excluirHoraExtra.bind(null, id, o.id)}
                  canManage={canEdit}
                />
              ))}
            </div>
          )}

          {canEdit && <AddHoraExtraForm action={criarHoraExtraAction} />}
        </div>
      )}

      {/* Exames Admissionais */}
      {person.type === "COLABORADOR" && (
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-[14px] font-semibold text-fg mb-3">
            Exames Admissionais {exames.length > 0 && `(${exames.length})`}
          </h2>

          {exames.length === 0 ? (
            <p className="text-[13px] text-fg-muted mb-3">Nenhum exame registrado ainda.</p>
          ) : (
            <div>
              {exames.map((e) => (
                <ExameRow
                  key={e.id}
                  exame={{
                    id: e.id,
                    status: e.status,
                    clinicName: e.clinicName,
                    scheduledAtLabel: e.scheduledAt?.toLocaleDateString("pt-BR") ?? null,
                    performedAtLabel: e.performedAt?.toLocaleDateString("pt-BR") ?? null,
                    asoDueDateLabel: e.asoDueDate?.toLocaleDateString("pt-BR") ?? null,
                    notes: e.notes,
                  }}
                  updateAction={atualizarExame.bind(null, id, e.id)}
                  removeAction={excluirExame.bind(null, id, e.id)}
                  canManage={canEdit}
                />
              ))}
            </div>
          )}

          {canEdit && <AddExameForm action={criarExameAction} />}
        </div>
      )}

      {/* Desempenho */}
      {person.type === "COLABORADOR" && evaluations.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-[14px] font-semibold text-fg mb-3">
            Avaliações de Desempenho ({evaluations.length})
          </h2>
          <div className="divide-y divide-border">
            {evaluations.map((e) => (
              <div key={e.id} className="py-2.5">
                <div className="flex items-center justify-between">
                  <Link href={`/avaliacoes/${e.cycle.id}/avaliar/${id}`} className="text-[13px] text-brand hover:underline">
                    {e.cycle.name}
                  </Link>
                  <span className="text-[12px] text-fg-muted">
                    {e.averageScore != null ? `Média: ${e.averageScore.toString()}` : "Sem nota"}
                  </span>
                </div>
                {e.developmentPlan && (
                  <p className="text-[12px] text-fg-muted mt-0.5">Plano: {e.developmentPlan}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Treinamentos */}
      {person.type === "COLABORADOR" && trainingParticipations.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-[14px] font-semibold text-fg mb-3">
            Treinamentos ({trainingParticipations.length})
          </h2>
          <div className="divide-y divide-border">
            {trainingParticipations.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5">
                <Link
                  href={`/treinamentos/${p.class.training.id}/turmas/${p.class.id}`}
                  className="text-[13px] text-brand hover:underline"
                >
                  {p.class.training.name} — {p.class.date.toLocaleDateString("pt-BR")}
                </Link>
                <span className="text-[12px] text-fg-muted">{TRAINING_STATUS_LABEL[p.status]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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
        createdAtLabel: d.createdAt.toLocaleDateString("pt-BR"),
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
