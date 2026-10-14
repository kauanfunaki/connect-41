"use client";

import { FileText } from "lucide-react";
import type { DocumentEntityType, DocumentCategory } from "@/generated/prisma/enums";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { CATEGORY_LABEL } from "@/lib/document-categories";
import { Selo } from "@/components/ui/Selo";
import { DocumentUploadForm } from "./DocumentUploadForm";

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
  const images = compact ? documents.filter((d) => isImageFile(d.fileName)) : [];
  const otherDocs = compact ? documents.filter((d) => !isImageFile(d.fileName)) : documents;

  // No modo compacto quem desenha o cartão e o título é o DetailSection que
  // envolve a seção no detalhamento de tarefa.
  return (
    <div className={compact ? "" : "bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] p-5"}>
      {/* Título no tamanho dos outros cartões das fichas de empresa e de
          pessoa, onde esta seção é uma aba (era 14px, os vizinhos 18px). */}
      {!compact && <h2 className="text-section font-semibold text-fg mb-4">Documentos</h2>}

      {documents.length === 0 ? (
        <p className="text-fs-3 text-fg-muted mb-4">Nenhum documento anexado ainda.</p>
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
                        <span className="text-micro font-semibold tracking-wide" style={{ color: EXT_COLOR[ext] ?? "var(--c41-fg-muted)" }}>
                          {ext}
                        </span>
                      )}
                      {d.sensitive && (
                        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-warning" title="Sensível" />
                      )}
                      {d.expiresAtLabel && (
                        <Selo tom={d.expired ? "perigo" : "atencao"} className="absolute top-1.5 left-1.5">
                          {d.expired ? "Vencido" : "Vence"}
                        </Selo>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 px-2 py-1.5 border-t border-border bg-surface">
                      <span className="flex-1 min-w-0 text-fs-1 text-fg truncate">{d.fileName}</span>
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
                <div key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <a
                      href={`/api/documents/${d.id}`}
                      className="text-fs-3 text-brand hover:underline break-words"
                    >
                      {d.fileName}
                    </a>
                    <p className="text-fs-1 text-fg-muted mt-0.5">
                      {CATEGORY_LABEL[d.category]} · enviado por {d.uploadedByName} em {d.createdAtLabel}
                      {d.sensitive && " · sensível"}
                    </p>
                  </div>
                  {d.expiresAtLabel && (
                    <Selo tom={d.expired ? "perigo" : "atencao"} className="flex-shrink-0">
                      {d.expired ? `Vencido em ${d.expiresAtLabel}` : `Vence em ${d.expiresAtLabel}`}
                    </Selo>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {canUpload && (
        <DocumentUploadForm
          entityType={entityType}
          entityId={entityId}
          className={compact ? "" : "border-t border-border pt-4"}
        />
      )}
    </div>
  );
}
