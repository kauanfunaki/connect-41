import Link from "next/link";
import { Pencil } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { excluirCandidato } from "../actions";
import { DeleteButton } from "@/components/pessoas/DeleteButton";
import { canManageSector } from "@/lib/auth/context";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { listDocuments } from "@/lib/documents";
import { DocumentsSection } from "@/components/documents/DocumentsSection";
import { AiResumeExtract } from "@/components/candidatos/AiResumeExtract";
import { extrairDadosCurriculo } from "./ai-actions";
import { formatCalendarDate, formatInstantDate, maskCpf, formatPhone, formatCep } from "@/lib/format";
import { TagToggleList } from "@/components/kanban/TagToggleList";
import { alternarTagPessoa } from "../actions";
import { TesteCard } from "@/components/teste/TesteCard";
import type { ProcessoSeletivoStatus } from "@/generated/prisma/enums";
import type { DiscScores, DiscDimension } from "@/lib/disc";
import type { QuizScores } from "@/lib/quiz";

const CANDIDATURA_STATUS_LABEL: Record<ProcessoSeletivoStatus, string> = {
  EM_ANDAMENTO: "Em andamento",
  APROVADO:     "Aprovado",
  REPROVADO:    "Reprovado",
  DESISTENTE:   "Desistente",
  CONTRATADO:   "Contratado",
  ENCERRADO:    "Encerrado",
};

export default async function CandidatoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx, setor } = await abrirTelaDoModulo("recrutamento_candidatos");
  const canEdit = canManageSector(ctx, setor);

  const prisma = getPrisma();
  const [person, documents, allTags] = await Promise.all([
    prisma.person.findFirst({
      where: { id, tenantId: ctx.tenantId, type: "CANDIDATO" },
      include: { tags: { select: { tagId: true } } },
    }),
    listDocuments(ctx.tenantId, "PERSON", id),
    prisma.tag.findMany({
      where: { tenantId: ctx.tenantId, sectorCode: "recrutamento" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
  ]);

  if (!person) notFound();

  const candidaturas = await prisma.candidatura.findMany({
    where: { tenantId: ctx.tenantId, personId: id },
    orderBy: { createdAt: "desc" },
    include: { vaga: { select: { id: true, title: true, company: { select: { name: true } } } } },
  });

  // Teste é traço da pessoa, reaproveitável entre candidaturas — mostra o link
  // mais recente independente de qual candidatura o gerou.
  const [testeLink, templates] = await Promise.all([
    prisma.assessmentLink.findFirst({
      where: { tenantId: ctx.tenantId, personId: id },
      orderBy: { createdAt: "desc" },
      include: { template: { select: { name: true } } },
    }),
    canEdit
      ? prisma.assessmentTemplate.findMany({
          where: { tenantId: ctx.tenantId, sectorCode: "recrutamento", active: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);
  const initialTesteLink =
    testeLink?.status === "PENDENTE"
      ? { status: "PENDENTE" as const, token: testeLink.token, expiresAtLabel: formatInstantDate(testeLink.expiresAt) }
      : testeLink?.status === "RESPONDIDO" && testeLink.type === "DISC"
        ? {
            status: "RESPONDIDO" as const,
            id: testeLink.id,
            type: "DISC" as const,
            scores: testeLink.scores as unknown as DiscScores,
            primaryProfile: testeLink.primaryProfile as DiscDimension,
            secondaryProfile: testeLink.secondaryProfile as DiscDimension | null,
            submittedAtLabel: testeLink.submittedAt ? formatInstantDate(testeLink.submittedAt) : "—",
          }
        : testeLink?.status === "RESPONDIDO"
          ? {
              status: "RESPONDIDO" as const,
              id: testeLink.id,
              type: "MULTIPLA_ESCOLHA" as const,
              scores: testeLink.scores as unknown as QuizScores,
              templateName: testeLink.template?.name ?? "Modelo excluído",
              submittedAtLabel: testeLink.submittedAt ? formatInstantDate(testeLink.submittedAt) : "—",
            }
          : null;

  const deleteAction = excluirCandidato.bind(null, id);

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
    <PageContainer>
      <Breadcrumb items={[{ label: "Candidatos", href: "/candidatos" }, { label: person.name, truncate: true }]} />

      {/* Selo, CPF e ações dentro do próprio `PageHeader` (polimento de
          30/09), como na ficha da vaga. "Editar" era um link desenhado à mão
          como botão. */}
      <PageHeader
        title={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            {person.name}
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium tracking-normal border ${
                person.active
                  ? "bg-success/10 text-success border-success/25"
                  : "bg-surface-2 text-fg-muted border-border"
              }`}
            >
              {person.active ? "Ativo" : "Inativo"}
            </span>
          </span>
        }
        subtitle={person.cpf ? <span className="tnum">CPF: {maskCpf(person.cpf)}</span> : undefined}
        action={
          canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              <Button href={`/candidatos/${id}/editar`} variant="secondary" size="sm">
                <Pencil size={14} /> Editar
              </Button>
              <DeleteButton action={deleteAction} nome={person.name} />
            </div>
          )
        }
      />

      {/* Tags / Skills — banco de talentos */}
      <Card className="p-5 mb-4">
        <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg mb-1">Tags / Habilidades</h2>
        <p className="text-[12px] text-fg-muted mb-3">
          Torna o candidato pesquisável no banco de talentos, mesmo que não avance nesta vaga.
        </p>
        <TagToggleList
          allTags={allTags}
          selectedIds={person.tags.map((t) => t.tagId)}
          toggleAction={alternarTagPessoa.bind(null, id)}
        />
      </Card>

      {/* Teste */}
      <div className="mb-4">
        <TesteCard personId={id} candidaturaId={null} initialLink={initialTesteLink} canManage={canEdit} templates={templates} />
      </div>

      {/* Identificação */}
      <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-5 mb-4">
        <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg mb-4">Identificação</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
          <InfoRow label="CPF" value={maskCpf(person.cpf)} mono />
          <InfoRow
            label="Data de Nascimento"
            value={
              person.birthDate
                ? formatCalendarDate(person.birthDate, { day: "2-digit", month: "long", year: "numeric" })
                : null
            }
          />
          <InfoRow label="RG" value={person.rg} mono />
          <InfoRow label="Escolaridade" value={person.education} />
        </div>
      </div>

      {/* Contato */}
      <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-5 mb-4">
        <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg mb-4">Contato</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
          <InfoRow label="E-mail" value={person.email} />
          <InfoRow label="Telefone" value={formatPhone(person.phone)} />
        </div>
      </div>

      {/* Endereço */}
      {fullAddress && (
        <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-5 mb-4">
          <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg mb-4">Endereço</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-4">
            <InfoRow label="Logradouro" value={[person.addressStreet, person.addressNumber].filter(Boolean).join(", ")} />
            <InfoRow label="Complemento" value={person.addressComplement} />
            <InfoRow label="Bairro" value={person.neighborhood} />
            <InfoRow label="Cidade / UF" value={[person.city, person.stateCode].filter(Boolean).join(" — ")} />
            <InfoRow label="CEP" value={formatCep(person.zipCode)} mono />
          </div>
        </div>
      )}

      {/* Candidaturas */}
      <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-5 mb-4">
        <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg mb-3">
          Candidaturas {candidaturas.length > 0 && `(${candidaturas.length})`}
        </h2>

        {candidaturas.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Ainda não foi vinculado a nenhuma vaga.</p>
        ) : (
          <div className="divide-y divide-border">
            {candidaturas.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
                <Link href={`/vagas/${c.vaga.id}`} className="min-w-0 text-[13px] text-brand hover:underline">
                  {c.vaga.title}
                </Link>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="min-w-0 truncate text-[12px] text-fg-muted">{c.vaga.company.name}</span>
                  <span className="inline-flex flex-shrink-0 items-center px-2 py-0.5 rounded-full text-[11px] font-medium border bg-surface-2 text-fg-secondary border-border">
                    {CANDIDATURA_STATUS_LABEL[c.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {canEdit && (
        <div className="mb-4">
          <AiResumeExtract action={extrairDadosCurriculo.bind(null, id)} />
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
          createdAtLabel: formatInstantDate(d.createdAt),
          expiresAtLabel: d.expiresAt ? formatCalendarDate(d.expiresAt) : null,
          expired: d.expiresAt != null && d.expiresAt < new Date(),
        }))}
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
    <div className="min-w-0">
      <p className="text-[length:var(--fs-helper)] text-fg-muted mb-0.5">{label}</p>
      <p className={`text-[13px] text-fg break-words ${mono ? "tnum" : ""}`}>{value || "—"}</p>
    </div>
  );
}
