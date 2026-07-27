"use client";

import { DocumentsSection, type DocumentItem } from "@/components/documents/DocumentsSection";

type Props = {
  entityId: string;
  documents: DocumentItem[];
  canUpload: boolean;
};

// Wrapper fino em volta do DocumentsSection (o mesmo usado em Empresa/Pessoa),
// fixando o entityType. O recolher/expandir e o cabeçalho vivem no
// DetailSection que envolve esta seção no detalhamento de tarefa.
export function TaskAttachmentsSection({ entityId, documents, canUpload }: Props) {
  return <DocumentsSection entityType="PIPELINE_ITEM" entityId={entityId} documents={documents} canUpload={canUpload} compact />;
}
