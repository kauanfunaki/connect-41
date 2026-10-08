"use client";

import { useRef, useState } from "react";
import { Copy, Check, MapPin, Mail, Phone, Camera, X, ArrowRightLeft, Pencil } from "lucide-react";
import type { CompanyStatus } from "@/generated/prisma/enums";
import { StatusDot } from "@/components/shared/StatusDot";
import { EntityOverflowMenu } from "@/components/ui/EntityOverflowMenu";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { ImageCropModal } from "@/components/shared/ImageCropModal";
import { formatDocumento, formatPhone } from "@/lib/format";
import { rotuloDoDocumento } from "@/lib/companyTaxId";
import { Button } from "@/components/ui/Button";

const STATUS_LABEL: Record<CompanyStatus, string> = {
  PROSPECT: "Prospecto",
  ACTIVE: "Ativo",
  INACTIVE: "Inativo",
  CHURNED: "Cancelado",
};

// Cancelado é cadastro que saiu de cena, como o inativo: bolinha cinza, e não
// vermelha (escolha 2A, 08/10/2026 — situação encerrada em neutro).
const STATUS_COLOR: Record<CompanyStatus, string> = {
  PROSPECT: "var(--c41-warning)",
  ACTIVE: "var(--c41-success)",
  INACTIVE: "var(--c41-fg-muted)",
  CHURNED: "var(--c41-fg-muted)",
};

type Props = {
  id: string;
  name: string;
  tradeName: string | null;
  kind: "PESSOA_JURIDICA" | "PESSOA_FISICA";
  cnpj: string | null;
  cpf: string | null;
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
  kind,
  cnpj,
  cpf,
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
  const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const location = [city, stateCode].filter(Boolean).join(" — ");

  // Um documento só por cadastro: PJ tem CNPJ, PF tem CPF, e o outro é nulo
  // por construção (ver `normalizarDocumento` em empresas/actions.ts).
  const documento = kind === "PESSOA_FISICA" ? cpf : cnpj;
  const rotuloDoc = rotuloDoDocumento(kind);

  async function copyDocumento() {
    if (!documento) return;
    await navigator.clipboard.writeText(documento);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) setPendingLogoFile(file);
  }

  function resetLogoInput() {
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleLogoCropConfirm(blob: Blob) {
    setPendingLogoFile(null);
    setLogoError(null);
    setUploadingLogo(true);
    try {
      const form = new FormData();
      form.append("logo", blob, `logo.${blob.type.split("/")[1] ?? "jpg"}`);
      const res = await fetch(`/api/empresas/${id}/logo`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) setLogoError(data.error ?? "Erro ao enviar foto.");
      else setLogoUrl(data.logoUrl);
    } catch {
      setLogoError("Erro ao enviar foto.");
    } finally {
      setUploadingLogo(false);
      resetLogoInput();
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
    <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-6 mb-5">
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
                  data-dica={logoUrl ? "Trocar foto" : "Adicionar foto"} aria-label={logoUrl ? "Trocar foto" : "Adicionar foto"}
                  className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/45 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity disabled:opacity-100 disabled:cursor-wait"
                >
                  <Camera size={16} />
                </button>
                {logoUrl && (
                  <button
                    type="button"
                    onClick={handleLogoRemove}
                    disabled={uploadingLogo}
                    data-dica="Remover foto" aria-label="Remover foto"
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
              <h1 className="text-section font-display font-semibold text-fg tracking-[-0.01em] truncate">
                {name}
              </h1>
              <StatusDot color={STATUS_COLOR[status]} label={STATUS_LABEL[status]} />
            </div>

            {tradeName && <p className="text-body text-fg-secondary mt-0.5">{tradeName}</p>}

            <div className="flex items-center gap-4 flex-wrap mt-2.5">
              {documento && (
                <Button
                  variant="linkMuted"
                  className="text-helper tnum"
                  onClick={copyDocumento}
                  data-dica={`Copiar ${rotuloDoc}`} aria-label={`Copiar ${rotuloDoc}`}
                >
                  {copied ? <Check size={14} className="text-success-fg" /> : <Copy size={14} />}
                  {formatDocumento(kind, cnpj, cpf)}
                </Button>
              )}
              {location && (
                <span className="inline-flex items-center gap-1.5 text-helper text-fg-muted">
                  <MapPin size={14} />
                  {location}
                </span>
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
            {logoError && <p className="text-helper text-danger mt-1.5">{logoError}</p>}
          </div>
        </div>

        {/* Eram links estilizados à mão (30/09): botão não é link. Altura `sm`
            para casar com o "⋯" do lado, que é h-8. */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {canRequestHandoff && (
            <Button href={`/transferencias/novo?entityType=COMPANY&entityId=${id}`} variant="secondary" size="sm">
              <ArrowRightLeft size={14} />
              Solicitar transferência
            </Button>
          )}
          {canEdit && (
            <>
              <Button href={`/empresas/${id}/editar`} variant="secondary" size="sm">
                <Pencil size={14} />
                Editar
              </Button>
              <EntityOverflowMenu deleteAction={deleteAction} nome={name} />
            </>
          )}
        </div>
      </div>

      <ImageCropModal
        file={pendingLogoFile}
        shape="rect"
        onCancel={() => {
          setPendingLogoFile(null);
          resetLogoInput();
        }}
        onConfirm={handleLogoCropConfirm}
      />
    </div>
  );
}
