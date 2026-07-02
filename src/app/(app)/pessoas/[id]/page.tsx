import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PersonType } from "@/generated/prisma/enums";
import { excluirPessoa } from "../actions";
import { DeleteButton } from "@/components/pessoas/DeleteButton";
import { getAuthContext, canWrite, isFullWrite } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { getPersonSectors, getApplicableCustomFields } from "@/lib/customFields";

const TYPE_LABEL: Record<PersonType, string> = {
  CANDIDATO:   "Candidato",
  COLABORADOR: "Colaborador",
};

const TYPE_STYLE: Record<PersonType, string> = {
  CANDIDATO:   "bg-brand/10 text-brand border-brand/25",
  COLABORADOR: "bg-success/10 text-success border-success/25",
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
  const person = await prisma.person.findFirst({
    where: { id, ...(await scopedPersonWhere(ctx)) },
    include: { currentCompany: { select: { id: true, name: true } } },
  });

  if (!person) notFound();

  const deleteAction = excluirPessoa.bind(null, id);

  const personSectors = await getPersonSectors(ctx.tenantId, id);
  const customFields = await getApplicableCustomFields(ctx, "PERSON", id, personSectors);

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
          <InfoRow
            label="Cadastrada em"
            value={person.createdAt.toLocaleDateString("pt-BR", {
              day: "2-digit", month: "long", year: "numeric",
            })}
          />
        </div>
      </div>

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
