"use client";

import { useState } from "react";
import { Paperclip } from "lucide-react";
import { DocumentsSection, type DocumentItem } from "@/components/documents/DocumentsSection";

type Props = {
  entityId: string;
  documents: DocumentItem[];
  canUpload: boolean;
};

// Wrapper só de UI em volta do DocumentsSection (reaproveitado como está,
// usado também em Empresa/Pessoa) — no detalhamento da tarefa ele precisa
// aparecer recolhido como pill, no mesmo formato de
// SubtasksSection/LinkedItemsSection/ChecklistSection, em vez do card grande
// sempre aberto que fazia sentido nas fichas mas destoava aqui.
export function TaskAttachmentsSection({ entityId, documents, canUpload }: Props) {
  const [open, setOpen] = useState(documents.length > 0);

  if (!open) {
    if (!canUpload) return null;
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors w-fit"
      >
        <Paperclip size={13} /> Anexar documento
      </button>
    );
  }

  return <DocumentsSection entityType="PIPELINE_ITEM" entityId={entityId} documents={documents} canUpload={canUpload} />;
}
