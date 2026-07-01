import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { CompanyStatus } from "@/generated/prisma/enums";
import { excluirEmpresa } from "../actions";
import { DeleteButton } from "@/components/empresas/DeleteButton";
import { getAuthContext, canWrite, isFullWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";

const STATUS_LABEL: Record<CompanyStatus, string> = {
  PROSPECT: "Prospecto",
  ACTIVE:   "Ativo",
  INACTIVE: "Inativo",
  CHURNED:  "Cancelado",
};

const STATUS_STYLE: Record<CompanyStatus, string> = {
  PROSPECT: "bg-warning/10 text-warning border-warning/25",
  ACTIVE:   "bg-success/10 text-success border-success/25",
  INACTIVE: "bg-surface-2 text-fg-muted border-border",
  CHURNED:  "bg-danger/10 text-danger border-danger/25",
};

export default async function EmpresaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  const canEdit = canWrite(ctx.role);
  const canRequestHandoff = isFullWrite(ctx.role) || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id, ...(await scopedCompanyWhere(ctx)) },
    include: {
      services: { orderBy: { createdAt: "asc" } },
      people:   { orderBy: { name: "asc" }, take: 10 },
    },
  });

  if (!company) notFound();

  const deleteAction = excluirEmpresa.bind(null, id);

  const fullAddress = [
    company.addressStreet,
    company.addressNumber,
    company.addressComplement,
    company.neighborhood,
    company.city,
    company.stateCode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/empresas"
          className="text-[13px] text-fg-muted hover:text-fg transition-colors"
        >
          Empresas
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg truncate">{company.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-[22px] font-semibold text-fg tracking-[-0.01em]">
              {company.name}
            </h1>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${STATUS_STYLE[company.status]}`}
            >
              {STATUS_LABEL[company.status]}
            </span>
          </div>
          {company.tradeName && (
            <p className="text-[14px] text-fg-secondary">{company.tradeName}</p>
          )}
          {company.cnpj && (
            <p className="text-[13px] text-fg-muted tnum mt-0.5">{company.cnpj}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {canRequestHandoff && (
            <Link
              href={`/handoffs/novo?entityType=COMPANY&entityId=${id}`}
              className="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors inline-flex items-center"
            >
              Solicitar Handoff
            </Link>
          )}
          {canEdit && (
            <>
              <Link
                href={`/empresas/${id}/editar`}
                className="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors inline-flex items-center"
              >
                Editar
              </Link>
              <DeleteButton action={deleteAction} nome={company.name} />
            </>
          )}
        </div>
      </div>

      {/* Identificação */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-4">
        <h2 className="text-[13px] font-medium text-fg mb-4">Identificação</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <InfoRow label="Razão Social"      value={company.name} />
          <InfoRow label="Nome Fantasia"     value={company.tradeName} />
          <InfoRow label="CNPJ"              value={company.cnpj} mono />
          <InfoRow label="Regime Tributário" value={company.taxRegime} />
        </div>
      </div>

      {/* Endereço */}
      {fullAddress && (
        <div className="bg-surface border border-border rounded-lg p-5 mb-4">
          <h2 className="text-[13px] font-medium text-fg mb-4">Endereço</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            <InfoRow label="Logradouro" value={[company.addressStreet, company.addressNumber].filter(Boolean).join(", ")} />
            <InfoRow label="Complemento" value={company.addressComplement} />
            <InfoRow label="Bairro"      value={company.neighborhood} />
            <InfoRow label="Cidade / UF" value={[company.city, company.stateCode].filter(Boolean).join(" — ")} />
            <InfoRow label="CEP"         value={company.zipCode} mono />
          </div>
        </div>
      )}

      {/* Contato */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-4">
        <h2 className="text-[13px] font-medium text-fg mb-4">Contato</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <InfoRow label="E-mail"   value={company.email} />
          <InfoRow label="Telefone" value={company.phone} />
          <InfoRow
            label="Website"
            value={company.website}
            href={company.website ?? undefined}
          />
        </div>
      </div>

      {/* Dados Fiscais */}
      {(company.stateRegistration || company.municipalRegistration || company.nire) && (
        <div className="bg-surface border border-border rounded-lg p-5 mb-4">
          <h2 className="text-[13px] font-medium text-fg mb-4">Dados Fiscais</h2>
          <div className="grid grid-cols-3 gap-x-8 gap-y-3">
            <InfoRow label="Inscrição Estadual"   value={company.stateRegistration} mono />
            <InfoRow label="Inscrição Municipal"  value={company.municipalRegistration} mono />
            <InfoRow label="NIRE"                 value={company.nire} mono />
          </div>
        </div>
      )}

      {/* CRM */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-4">
        <h2 className="text-[13px] font-medium text-fg mb-4">CRM</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <InfoRow label="Origem" value={company.source} />
          <InfoRow
            label="Criada em"
            value={company.createdAt.toLocaleDateString("pt-BR", {
              day: "2-digit", month: "long", year: "numeric",
            })}
          />
          <InfoRow
            label="Atualizada"
            value={company.updatedAt.toLocaleDateString("pt-BR", {
              day: "2-digit", month: "long", year: "numeric",
            })}
          />
        </div>
      </div>

      {/* Serviços contratados */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[13px] font-medium text-fg">Serviços contratados</h2>
        </div>
        {company.services.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Nenhum serviço cadastrado.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {company.services.map((s) => (
              <span
                key={s.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-surface-2 text-fg-secondary border border-border"
              >
                {s.sectorCode}
                <span className={`w-1.5 h-1.5 rounded-full ${s.status === "ACTIVE" ? "bg-success" : "bg-fg-muted"}`} />
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Pessoas vinculadas */}
      {company.people.length > 0 && (
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-[13px] font-medium text-fg mb-3">
            Pessoas ({company.people.length})
          </h2>
          <div className="space-y-1">
            {company.people.map((p) => (
              <Link
                key={p.id}
                href={`/pessoas/${p.id}`}
                className="flex items-center justify-between px-3 py-2 rounded-md hover:bg-surface-2 transition-colors"
              >
                <span className="text-[13px] text-fg">{p.name}</span>
                <span className="text-[11px] text-fg-muted">
                  {p.type === "COLABORADOR" ? "Colaborador" : "Candidato"}
                </span>
              </Link>
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
  href,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  href?: string;
}) {
  return (
    <div>
      <p className="text-[11px] text-fg-muted mb-0.5">{label}</p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-[13px] text-brand hover:underline ${mono ? "tnum" : ""}`}
        >
          {value ?? "—"}
        </a>
      ) : (
        <p className={`text-[13px] text-fg ${mono ? "tnum" : ""}`}>{value ?? "—"}</p>
      )}
    </div>
  );
}
