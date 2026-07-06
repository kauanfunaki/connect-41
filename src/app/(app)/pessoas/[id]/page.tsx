import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PersonType, PersonEmploymentStatus } from "@/generated/prisma/enums";
import { excluirPessoa } from "../actions";
import { DeleteButton } from "@/components/pessoas/DeleteButton";
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

const TYPE_LABEL: Record<PersonType, string> = {
  CANDIDATO:   "Candidato",
  COLABORADOR: "Colaborador",
};

const TYPE_STYLE: Record<PersonType, string> = {
  CANDIDATO:   "bg-brand/10 text-brand border-brand/25",
  COLABORADOR: "bg-success/10 text-success border-success/25",
};

const STATUS_LABEL: Record<PersonEmploymentStatus, string> = {
  ADMISSAO_EM_ANDAMENTO: "Admissão em andamento",
  ATIVO:                 "Ativo",
  EM_FERIAS:              "Em férias",
  AFASTADO:               "Afastado",
  DESLIGADO:              "Desligado",
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
  const [person, canViewBank, canViewSalary, canViewMedical, documents, exames, salaryHistory, vacations, absences, terminations] = await Promise.all([
    prisma.person.findFirst({
      where: { id, ...(await scopedPersonWhere(ctx)) },
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
  ]);

  if (!person) notFound();

  const deleteAction = excluirPessoa.bind(null, id);
  const criarExameAction = criarExame.bind(null, id);
  const registrarReajusteAction = registrarReajuste.bind(null, id);
  const criarFeriasAction = criarFerias.bind(null, id);
  const criarAfastamentoAction = criarAfastamento.bind(null, id);
  const criarDesligamentoAction = criarDesligamento.bind(null, id);
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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <Link href="/pessoas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Pessoas
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg truncate">{person.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">
              {person.name}
            </h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${TYPE_STYLE[person.type]}`}
            >
              {TYPE_LABEL[person.type]}
            </span>
            {person.type === "COLABORADOR" && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border bg-surface-2 text-fg-secondary border-border">
                {STATUS_LABEL[person.employmentStatus]}
              </span>
            )}
          </div>
          {person.cpf && (
            <p className="text-[13px] text-fg-muted tnum mt-0.5">CPF: {person.cpf}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {canRequestHandoff && (
            <Link
              href={`/transferencias/novo?entityType=PERSON&entityId=${id}`}
              className="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors inline-flex items-center"
            >
              Solicitar Transferência
            </Link>
          )}
          {canEdit && (
            <>
              <Link
                href={`/pessoas/${id}/editar`}
                className="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors inline-flex items-center"
              >
                Editar
              </Link>
              <DeleteButton action={deleteAction} nome={person.name} />
            </>
          )}
        </div>
      </div>

      {/* Identificação */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-4">
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
      <div className="bg-surface border border-border rounded-lg p-5 mb-4">
        <h2 className="text-[14px] font-semibold text-fg mb-4">Contato</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <InfoRow label="E-mail"   value={person.email} />
          <InfoRow label="Telefone" value={person.phone} />
        </div>
      </div>

      {/* Endereço */}
      {fullAddress && (
        <div className="bg-surface border border-border rounded-lg p-5 mb-4">
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

      {/* Vínculo */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-4">
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

      {/* Dados Trabalhistas */}
      {person.type === "COLABORADOR" && (
        <div className="bg-surface border border-border rounded-lg p-5 mb-4">
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
        <div className="bg-surface border border-border rounded-lg p-5 mb-4">
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
        <div className="bg-surface border border-border rounded-lg p-5 mb-4">
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
        <div className="bg-surface border border-border rounded-lg p-5 mb-4">
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
        <div className="bg-surface border border-border rounded-lg p-5 mb-4">
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

      {/* Exames Admissionais */}
      {person.type === "COLABORADOR" && (
        <div className="bg-surface border border-border rounded-lg p-5 mb-4">
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

      {/* Campos Adicionais (setoriais) */}
      {customFields.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-5 mb-4">
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

      {/* Documentos */}
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
    </div>
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
