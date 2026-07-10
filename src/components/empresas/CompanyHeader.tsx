"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Copy, Check, MapPin, Mail, Phone, Camera, X } from "lucide-react";
import type { CompanyStatus } from "@/generated/prisma/enums";
import { StatusDot } from "@/components/shared/StatusDot";
import { DeleteButton } from "@/components/ui/DeleteButton";
import { AvatarImage } from "@/components/shared/AvatarImage";

const STATUS_LABEL: Record<CompanyStatus, string> = {
  PROSPECT: "Prospecto",
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  CHURNED: "Cancelado",
};

const STATUS_COLOR: Record<CompanyStatus, string> = {
  PROSPECT: "var(--c41-warning)",
  ACTIVE: "var(--c41-success)",
  INACTIVE: "var(--c41-fg-muted)",
  CHURNED: "var(--c41-danger)",
};

type Props = {
  id: string;
  name: string;
  tradeName: string | null;
  cnpj: string | null;
  status: CompanyStatus;
  city: string | null;
  stateCode: string | null;
  email: string | null;
  phone: string | null;
  logoUrl: string | null;
  canEdit: boolean;
  canRequestHandoff: boolean;
  deleteAction: () => Promise<{ error: string } | null | void>;
};

export function CompanyHeader({
  id,
  name,
  tradeName,
  cnpj,
  status,
  city,
  stateCode,
  email,
  phone,
  logoUrl: initialLogoUrl,
  canEdit,
  canRequestHandoff,
  deleteAction,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const location = [city, stateCode].filter(Boolean).join(" — ");

  async function copyCnpj() {
    if (!cnpj) return;
    await navigator.clipboard.writeText(cnpj);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);
    setUploadingLogo(true);
    try {
      const form = new FormData();
      form.append("logo", file);
      const res = await fetch(`/api/empresas/${id}/logo`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) setLogoError(data.error ?? "Erro ao enviar foto.");
      else setLogoUrl(data.logoUrl);
    } catch {
      setLogoError("Erro ao enviar foto.");
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleLogoRemove() {
    setLogoError(null);
    setUploadingLogo(true);
    try {
      const res = await fetch(`/api/empresas/${id}/logo`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) setLogoError(data.error ?? "Erro ao remover foto.");
      else setLogoUrl(null);
    } catch {
      setLogoError("Erro ao remover foto.");
    } finally {
      setUploadingLogo(false);
    }
  }

  return (
    <div className="bg-surface border border-border rounded-2xl p-6 mb-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4 min-w-0">
          <div className="relative flex-shrink-0 group">
            <AvatarImage src={logoUrl} name={name} size={56} shape="xl" fontSize={20} />

            {canEdit && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingLogo}
                  title={logoUrl ? "Trocar foto" : "Adicionar foto"}
                  className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/45 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity disabled:opacity-100 disabled:cursor-wait"
                >
                  <Camera size={16} />
                </button>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={handleLogoRemove}
                    disabled={uploadingLogo}
                    title="Remover foto"
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-surface border border-border-strong text-fg-muted hover:text-danger flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={11} />
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleLogoChange}
                />
              </>
            )}
          </div>

          <div className="min-w-0 pt-0.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-[length:var(--fs-section)] font-display font-semibold text-fg tracking-[-0.01em] truncate">
                {name}
              </h1>
              <StatusDot color={STATUS_COLOR[status]} label={STATUS_LABEL[status]} />
            </div>

            {tradeName && <p className="text-[length:var(--fs-body)] text-fg-secondary mt-0.5">{tradeName}</p>}

            <div className="flex items-center gap-4 flex-wrap mt-2.5">
              {cnpj && (
                <button
                  type="button"
                  onClick={copyCnpj}
                  title="Copiar CNPJ"
                  className="inline-flex items-center gap-1.5 text-[length:var(--fs-helper)] text-fg-muted hover:text-fg tnum transition-colors"
                >
                  {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                  {cnpj}
                </button>
              )}
              {location && (
                <span className="inline-flex items-center gap-1.5 text-[length:var(--fs-helper)] text-fg-muted">
                  <MapPin size={13} />
                  {location}
                </span>
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
                  {phone}
                </a>
              )}
            </div>
            {logoError && <p className="text-[length:var(--fs-helper)] text-danger mt-1.5">{logoError}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {canRequestHandoff && (
            <Link
              href={`/transferencias/novo?entityType=COMPANY&entityId=${id}`}
              className="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors inline-flex items-center"
            >
              Solicitar Transferência
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
              <DeleteButton action={deleteAction} nome={name} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
