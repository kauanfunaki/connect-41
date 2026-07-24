"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DocumentEntityType, DocumentCategory } from "@/generated/prisma/enums";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const CATEGORY_LABEL: Record<DocumentCategory, string> = {
  ADMISSAO:    "Admissão",
  ASO:         "ASO",
  CURRICULO:   "Currículo",
  ATESTADO:    "Atestado",
  CERTIFICADO: "Certificado",
  RECIBO:      "Recibo",
  CONTRATO:    "Contrato",
  OUTRO:       "Outro",
};

const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABEL) as DocumentCategory[];

export type DocumentItem = {
  id: string;
  fileName: string;
  category: DocumentCategory;
  sensitive: boolean;
  uploadedByName: string;
  createdAtLabel: string;
  expiresAtLabel: string | null;
  expired: boolean;
};

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
function isImageFile(fileName: string): boolean {
  return IMAGE_EXT.has(fileName.split(".").pop()?.toLowerCase() ?? "");
}

type Props = {
  entityType: DocumentEntityType;
  entityId: string;
  documents: DocumentItem[];
  canUpload: boolean;
  // Grade compacta de miniaturas pras imagens, em vez de uma linha cheia de
  // metadados por arquivo — usada no detalhamento de tarefa, onde anexar
  // várias imagens (ex.: prints de comprovante) deixava a tela poluída.
  // Empresa/Pessoa continuam com a lista cheia (default).
  compact?: boolean;
};

export function DocumentsSection({ entityType, entityId, documents, canUpload, compact = false }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsUploading(true);

    const form = new FormData(e.currentTarget);
    form.set("entityType", entityType);
    form.set("entityId", entityId);

    try {
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Erro ao enviar documento.");
        return;
      }
      formRef.current?.reset();
      router.refresh();
    } catch {
      setError("Erro ao enviar documento. Tente novamente.");
    } finally {
      setIsUploading(false);
    }
  }

  const images = compact ? documents.filter((d) => isImageFile(d.fileName)) : [];
  const otherDocs = compact ? documents.filter((d) => !isImageFile(d.fileName)) : documents;

  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <h2 className="text-[14px] font-semibold text-fg mb-4">Documentos</h2>

      {documents.length === 0 ? (
        <p className="text-[13px] text-fg-muted mb-4">Nenhum documento anexado ainda.</p>
      ) : (
        <>
          {images.length > 0 && (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-4">
              {images.map((d) => (
                <a
                  key={d.id}
                  href={`/api/documents/${d.id}`}
                  target="_blank"
                  rel="noreferrer"
                  title={`${d.fileName} · ${d.uploadedByName} em ${d.createdAtLabel}`}
                  className="group relative aspect-square rounded-md overflow-hidden border border-border hover:border-border-strong transition-colors"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/documents/${d.id}`} alt={d.fileName} className="w-full h-full object-cover" />
                  {d.sensitive && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-warning border border-canvas" title="Sensível" />
                  )}
                </a>
              ))}
            </div>
          )}
          {otherDocs.length > 0 && (
            <div className="divide-y divide-border mb-4">
              {otherDocs.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <a
                      href={`/api/documents/${d.id}`}
                      className="text-[13px] text-brand hover:underline"
                    >
                      {d.fileName}
                    </a>
                    <p className="text-[11px] text-fg-muted mt-0.5">
                      {CATEGORY_LABEL[d.category]} · enviado por {d.uploadedByName} em {d.createdAtLabel}
                      {d.sensitive && " · sensível"}
                    </p>
                  </div>
                  {d.expiresAtLabel && (
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border flex-shrink-0 ${
                        d.expired
                          ? "bg-danger/10 text-danger border-danger/25"
                          : "bg-warning/10 text-warning border-warning/25"
                      }`}
                    >
                      {d.expired ? `Vencido em ${d.expiresAtLabel}` : `Vence em ${d.expiresAtLabel}`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {canUpload && (
        <form ref={formRef} onSubmit={handleSubmit} className="flex items-end gap-3 flex-wrap border-t border-border pt-4">
          <div className="w-44">
            <CampoForm label="Categoria" htmlFor="category">
              <Select id="category" name="category" defaultValue="OUTRO">
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
                ))}
              </Select>
            </CampoForm>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="file" className="block text-[length:var(--fs-label)] font-medium text-fg">Arquivo</label>
            <input id="file" name="file" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" required className="text-[12px] text-fg file:mr-3 file:h-9 file:px-3 file:rounded-[10px] file:border file:border-border-strong file:bg-surface-hover file:text-fg file:text-[12px] file:font-medium file:cursor-pointer file:border-solid hover:file:border-brand file:transition-colors" />
          </div>
          <div className="w-40">
            <CampoForm label="Vencimento (opcional)" htmlFor="expiresAt">
              <Input id="expiresAt" name="expiresAt" type="date" />
            </CampoForm>
          </div>
          <div className="pb-2">
            <Checkbox name="sensitive" value="true" label="Documento sensível" />
          </div>
          <button
            type="submit"
            disabled={isUploading}
            className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
          >
            {isUploading ? "Enviando…" : "Anexar"}
          </button>
        </form>
      )}

      {error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2 mt-3">
          {error}
        </p>
      )}
    </div>
  );
}
