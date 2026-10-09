"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, Check, Building2, Mail, Phone, Pencil, ArrowRightLeft } from "lucide-react";
import { StatusDot } from "@/components/shared/StatusDot";
import { EntityOverflowMenu } from "@/components/ui/EntityOverflowMenu";
import { AvatarImage } from "@/components/shared/AvatarImage";
import type { PersonType, PersonEmploymentStatus } from "@/generated/prisma/enums";
import { maskCpf, formatPhone } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

const TYPE_LABEL: Record<PersonType, string> = {
  CANDIDATO: "Candidato",
  COLABORADOR: "Colaborador",
};

// O tipo é categoria — Badge; a situação do vínculo é a bolinha (escolha 2A,
// 08/10/2026). A bolinha era sempre cinza, até em "Ativo", que na lista de
// pessoas é verde: agora tem a cor da situação, e o desligado fica neutro.
const TYPE_VARIANT: Record<PersonType, "info" | "success"> = {
  CANDIDATO: "info",
  COLABORADOR: "success",
};

const STATUS_LABEL: Record<PersonEmploymentStatus, string> = {
  ADMISSAO_EM_ANDAMENTO: "Admissão em andamento",
  ATIVO: "Ativo",
  EM_FERIAS: "Em férias",
  AFASTADO: "Afastado",
  DESLIGADO: "Desligado",
};

const STATUS_COLOR: Record<PersonEmploymentStatus, string> = {
  ADMISSAO_EM_ANDAMENTO: "var(--c41-brand)",
  ATIVO: "var(--c41-success)",
  EM_FERIAS: "var(--c41-warning)",
  AFASTADO: "var(--c41-warning)",
  DESLIGADO: "var(--c41-fg-muted)",
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
// (card rounded-lg, avatar à esquerda, metadados com ícones, ações à direita).
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
    <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-6 mb-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4 min-w-0">
          <AvatarImage src={photoUrl} name={name} size={56} shape="circle" fontSize={20} />

          <div className="min-w-0 pt-0.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-section font-display font-semibold text-fg tracking-[-0.01em] truncate">
                {name}
              </h1>
              <Badge variant={TYPE_VARIANT[type]}>{TYPE_LABEL[type]}</Badge>
              {type === "COLABORADOR" && (
                <StatusDot color={STATUS_COLOR[employmentStatus]} label={STATUS_LABEL[employmentStatus]} />
              )}
            </div>

            <div className="flex items-center gap-4 flex-wrap mt-2.5">
              {cpf && (
                <Button
                  variant="linkMuted"
                  className="text-helper tnum"
                  onClick={copyCpf}
                  title="Copiar CPF" aria-label="Copiar CPF"
                >
                  {copied ? <Check size={14} className="text-success-fg" /> : <Copy size={14} />}
                  {maskCpf(cpf)}
                </Button>
              )}
              {companyId && companyName && (
                <Link
                  href={`/empresas/${companyId}`}
                  className="inline-flex items-center gap-1.5 text-helper text-fg-muted hover:text-fg transition-colors"
                >
                  <Building2 size={14} />
                  {companyName}
                </Link>
              )}
              {email && (
                <a
                  href={`mailto:${email}`}
                  className="inline-flex items-center gap-1.5 text-helper text-fg-muted hover:text-fg transition-colors"
                >
                  <Mail size={14} />
                  {email}
                </a>
              )}
              {phone && (
                <a
                  href={`tel:${phone}`}
                  className="inline-flex items-center gap-1.5 text-helper text-fg-muted hover:text-fg transition-colors"
                >
                  <Phone size={14} />
                  {formatPhone(phone)}
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Eram links com cara de botão (até 30/09); viraram o Button. */}
          {canRequestHandoff && (
            <Button href={`/transferencias/novo?entityType=PERSON&entityId=${id}`} variant="secondary" size="sm">
              <ArrowRightLeft size={14} />
              Solicitar transferência
            </Button>
          )}
          {canEdit && (
            <>
              <Button href={`/pessoas/${id}/editar`} variant="secondary" size="sm">
                <Pencil size={14} />
                Editar
              </Button>
              <EntityOverflowMenu deleteAction={deleteAction} nome={name} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
