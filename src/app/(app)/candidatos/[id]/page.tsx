import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { excluirCandidato } from "../actions";
import { DeleteButton } from "@/components/pessoas/DeleteButton";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { listDocuments } from "@/lib/documents";
import { DocumentsSection } from "@/components/documents/DocumentsSection";
import { formatCalendarDate, formatInstantDate, maskCpf, formatPhone, formatCep } from "@/lib/format";
import type { ProcessoSeletivoStatus } from "@/generated/prisma/enums";

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
  const ctx = await getAuthContext();
  const canEdit = canWrite(ctx.role);

  const prisma = getPrisma();
  const [person, documents] = await Promise.all([
    prisma.person.findFirst({
      where: { id, tenantId: ctx.tenantId, type: "CANDIDATO" },
    }),
    listDocuments(ctx.tenantId, "PERSON", id),
  ]);

  if (!person) notFound();

  const candidaturas = await prisma.candidatura.findMany({
    where: { tenantId: ctx.tenantId, personId: id },
    orderBy: { createdAt: "desc" },
    include: { vaga: { select: { id: true, title: true, company: { select: { name: true } } } } },
  });

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
    <PageContainer variant="narrow">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/candidatos" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Candidatos
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg truncate">{person.name}</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">{person.name}</h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${
                person.active
                  ? "bg-success/10 text-success border-success/25"
                  : "bg-surface-2 text-fg-muted border-border"
              }`}
            >
              {person.active ? "Ativo" : "Inativo"}
            </span>
          </div>
          {person.cpf && <p className="text-[13px] text-fg-muted tnum mt-0.5">CPF: {maskCpf(person.cpf)}</p>}
        </div>

        {canEdit && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href={`/candidatos/${id}/editar`}
              className="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors inline-flex items-center"
            >
              Editar
            </Link>
            <DeleteButton action={deleteAction} nome={person.name} />
          </div>
        )}
      </div>

      {/* Identificação */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-4">
        <h2 className="text-[14px] font-semibold text-fg mb-4">Identificação</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
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
      <div className="bg-surface border border-border rounded-lg p-5 mb-4">
        <h2 className="text-[14px] font-semibold text-fg mb-4">Contato</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
          <InfoRow label="E-mail" value={person.email} />
          <InfoRow label="Telefone" value={formatPhone(person.phone)} />
        </div>
      </div>

      {/* Endereço */}
      {fullAddress && (
        <div className="bg-surface border border-border rounded-lg p-5 mb-4">
          <h2 className="text-[14px] font-semibold text-fg mb-4">Endereço</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
            <InfoRow label="Logradouro" value={[person.addressStreet, person.addressNumber].filter(Boolean).join(", ")} />
            <InfoRow label="Complemento" value={person.addressComplement} />
            <InfoRow label="Bairro" value={person.neighborhood} />
            <InfoRow label="Cidade / UF" value={[person.city, person.stateCode].filter(Boolean).join(" — ")} />
            <InfoRow label="CEP" value={formatCep(person.zipCode)} mono />
          </div>
        </div>
      )}

      {/* Candidaturas */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-4">
        <h2 className="text-[14px] font-semibold text-fg mb-3">
          Candidaturas {candidaturas.length > 0 && `(${candidaturas.length})`}
        </h2>

        {candidaturas.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Ainda não foi vinculado a nenhuma vaga.</p>
        ) : (
          <div className="divide-y divide-border">
            {candidaturas.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2.5">
                <Link href={`/vagas/${c.vaga.id}`} className="text-[13px] text-brand hover:underline">
                  {c.vaga.title}
                </Link>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-fg-muted">{c.vaga.company.name}</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border bg-surface-2 text-fg-secondary border-border">
                    {CANDIDATURA_STATUS_LABEL[c.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
    <div>
      <p className="text-[10px] text-fg-muted mb-0.5">{label}</p>
      <p className={`text-[13px] text-fg ${mono ? "tnum" : ""}`}>{value ?? "—"}</p>
    </div>
  );
}
