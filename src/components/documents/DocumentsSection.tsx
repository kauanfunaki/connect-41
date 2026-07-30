"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText } from "lucide-react";
import type { DocumentEntityType, DocumentCategory } from "@/generated/prisma/enums";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

import { CATEGORY_LABEL, CATEGORY_OPTIONS } from "@/lib/document-categories";

export type DocumentItem = {
  id: string;
  fileName: string;
  category: DocumentCategory;
  sensitive: boolean;
  uploadedByName: string;
  /** Só usado no modo compacto (cartão de anexo). Ausente cai nas iniciais. */
  uploadedByPhotoUrl?: string | null;
  createdAtLabel: string;
  expiresAtLabel: string | null;
  expired: boolean;
};

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
function isImageFile(fileName: string): boolean {
  return IMAGE_EXT.has(fileName.split(".").pop()?.toLowerCase() ?? "");
}

function fileExt(fileName: string): string {
  return fileName.split(".").pop()?.toUpperCase() ?? "";
}

// Cor por tipo — só o suficiente pra bater o olho e reconhecer o arquivo, sem
// virar semáforo. PDF vermelho é a convenção que todo mundo já lê.
const EXT_COLOR: Record<string, string> = {
  PDF: "var(--c41-danger)",
  DOC: "#2563EB",
  DOCX: "#2563EB",
  XLS: "var(--c41-success)",
  XLSX: "var(--c41-success)",
  CSV: "var(--c41-success)",
};

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

  // No modo compacto quem desenha o cartão e o título é o DetailSection que
  // envolve a seção no detalhamento de tarefa.
  return (
    <div className={compact ? "" : "bg-surface border border-border rounded-lg p-5"}>
      {!compact && <h2 className="text-[14px] font-semibold text-fg mb-4">Documentos</h2>}

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
          {/* Compacto: cartão por arquivo (ícone grande, nome embaixo e avatar
              de quem anexou à direita do nome), no formato dos anexos do
              ClickUp — a lista corrida de metadados espremia o nome do arquivo
              e não deixava reconhecer o anexo de relance. */}
          {compact && otherDocs.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {otherDocs.map((d) => {
                const ext = fileExt(d.fileName);
                return (
                  <a
                    key={d.id}
                    href={`/api/documents/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    title={`${d.fileName} · ${CATEGORY_LABEL[d.category]} · ${d.uploadedByName} em ${d.createdAtLabel}`}
                    className="group block rounded-lg border border-border bg-surface-hover overflow-hidden hover:border-border-strong transition-colors"
                  >
                    <div className="relative h-20 flex flex-col items-center justify-center gap-1">
                      <FileText size={26} style={{ color: EXT_COLOR[ext] ?? "var(--c41-fg-muted)" }} />
                      {ext && (
                        <span className="text-[9px] font-semibold tracking-wide" style={{ color: EXT_COLOR[ext] ?? "var(--c41-fg-muted)" }}>
                          {ext}
                        </span>
                      )}
                      {d.sensitive && (
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-warning" title="Sensível" />
                      )}
                      {d.expiresAtLabel && (
                        <span
                          className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-medium ${
                            d.expired ? "bg-danger/15 text-danger" : "bg-warning/15 text-warning"
                          }`}
                        >
                          {d.expired ? "Vencido" : "Vence"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1.5 border-t border-border bg-surface">
                      <span className="flex-1 min-w-0 text-[11px] text-fg truncate">{d.fileName}</span>
                      <AvatarImage
                        src={d.uploadedByPhotoUrl ?? null}
                        name={d.uploadedByName}
                        size={18}
                        bordered={false}
                        fontSize={8}
                      />
                    </div>
                  </a>
                );
              })}
            </div>
          )}

          {!compact && otherDocs.length > 0 && (
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
        <form ref={formRef} onSubmit={handleSubmit} className={`flex items-end gap-3 flex-wrap ${compact ? "" : "border-t border-border pt-4"}`}>
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
