import Link from "next/link";
import { FileText } from "lucide-react";
import type { SpaceDocument } from "@/lib/canvasAggregation";

// Layout pedido: ícone de documento | Nome do documento (fonte normal) |
// "• em {Tarefa X}" (mais apagado) — agregação de canvas pages visível no
// Espaço/Pasta, sem precisar abrir a tarefa específica.
export function SpaceDocumentsList({ documents }: { documents: SpaceDocument[] }) {
  if (documents.length === 0) {
    return <p className="text-[13px] text-fg-muted">Nenhum documento criado ainda.</p>;
  }

  return (
    <div className="bg-surface border border-border rounded-lg divide-y divide-border">
      {documents.map((d) => (
        <Link
          key={d.id}
          href={d.href}
          className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-surface-hover transition-colors"
        >
          <FileText size={15} className="text-fg-muted flex-shrink-0" />
          <span className="text-[13px] text-fg truncate">{d.title}</span>
          <span className="text-[12px] text-fg-muted flex-shrink-0">• em {d.taskName}</span>
        </Link>
      ))}
    </div>
  );
}
