"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Check, Building2, Mail, Phone } from "lucide-react";
import { StatusDot } from "@/components/shared/StatusDot";
import { DeleteButton } from "@/components/pessoas/DeleteButton";
import { AvatarImage } from "@/components/shared/AvatarImage";
import type { PersonType, PersonEmploymentStatus } from "@/generated/prisma/enums";
import { maskCpf, formatPhone } from "@/lib/format";

const TYPE_LABEL: Record<PersonType, string> = {
  CANDIDATO: "Candidato",
  COLABORADOR: "Colaborador",
};

const TYPE_STYLE: Record<PersonType, string> = {
  CANDIDATO: "bg-brand/10 text-brand border-brand/25",
  COLABORADOR: "bg-success/10 text-success border-success/25",
};

const STATUS_LABEL: Record<PersonEmploymentStatus, string> = {
  ADMISSAO_EM_ANDAMENTO: "Admissão em andamento",
  ATIVO: "Ativo",
  EM_FERIAS: "Em férias",
  AFASTADO: "Afastado",
  DESLIGADO: "Desligado",
};

type Props = {
  id: string;
  name: string;
  photoUrl: string | null;
  type: PersonType;
  employmentStatus: PersonEmploymentStatus;
  cpf: string | null;
  email: string | null;
  phone: string | null;
  companyId: string | null;
  companyName: string | null;
  canEdit: boolean;
  canRequestHandoff: boolean;
  deleteAction: () => Promise<{ error: string } | null | void>;
};

// Header de detalhe de pessoa — mesma "família visual" do CompanyHeader
// (card rounded-2xl, avatar à esquerda, metadados com ícones, ações à direita).
export function PersonHeader({
  id,
  name,
  photoUrl,
  type,
  employmentStatus,
  cpf,
  email,
  phone,
  companyId,
  companyName,
  canEdit,
  canRequestHandoff,
  deleteAction,
}: Props) {
  const [copied, setCopied] = useState(false);

  async function copyCpf() {
    if (!cpf) return;
    await navigator.clipboard.writeText(cpf);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 mb-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4 min-w-0">
          <AvatarImage src={photoUrl} name={name} size={56} shape="circle" fontSize={20} />

          <div className="min-w-0 pt-0.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-[length:var(--fs-section)] font-display font-semibold text-fg tracking-[-0.01em] truncate">
                {name}
              </h1>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border ${TYPE_STYLE[type]}`}
              >
                {TYPE_LABEL[type]}
              </span>
              {type === "COLABORADOR" && (
                <StatusDot color="var(--c41-fg-muted)" label={STATUS_LABEL[employmentStatus]} />
              )}
            </div>

            <div className="flex items-center gap-4 flex-wrap mt-2.5">
              {cpf && (
                <button
                  type="button"
                  onClick={copyCpf}
                  title="Copiar CPF"
                  className="inline-flex items-center gap-1.5 text-[length:var(--fs-helper)] text-fg-muted hover:text-fg tnum transition-colors"
                >
                  {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                  {maskCpf(cpf)}
                </button>
              )}
              {companyId && companyName && (
                <Link
                  href={`/empresas/${companyId}`}
                  className="inline-flex items-center gap-1.5 text-[length:var(--fs-helper)] text-fg-muted hover:text-fg transition-colors"
                >
                  <Building2 size={13} />
                  {companyName}
                </Link>
              )}
              {email && (
                <a
                  href={`mailto:${email}`}
                  className="inline-flex items-center gap-1.5 text-[length:var(--fs-helper)] text-fg-muted hover:text-fg transition-colors"
                >
                  <Mail size={13} />
                  {email}
                </a>
              )}
              {phone && (
                <a
                  href={`tel:${phone}`}
                  className="inline-flex items-center gap-1.5 text-[length:var(--fs-helper)] text-fg-muted hover:text-fg transition-colors"
                >
                  <Phone size={13} />
                  {formatPhone(phone)}
                </a>
              )}
            </div>
          </div>
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
              <DeleteButton action={deleteAction} nome={name} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
