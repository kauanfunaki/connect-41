"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FilePen, X } from "lucide-react";
import { useConfirm } from "@/components/ui/useConfirm";
import { descartar } from "@/app/(app)/chamados/actions";

// O rascunho aparece como um chip: o nome retoma, o "x" descarta sem abrir.
export function RascunhoDaLista({ id, titulo }: { id: string; titulo: string }) {
  const router = useRouter(), { dialog, requestConfirm } = useConfirm();
  const excluir = () => requestConfirm({ title: "Excluir rascunho?", description: `"${titulo}" e os anexos dele serão apagados.`, confirmLabel: "Excluir", destructive: true }, async () => {
    const r = await descartar(id); if (!r.ok) throw new Error(r.error); router.refresh();
  });
  return <span className="inline-flex max-w-full items-center rounded-md border border-border-strong bg-surface text-ui">
    <Link href={`/chamados/novo?rascunho=${id}`} className="inline-flex min-w-0 items-center gap-1.5 rounded-l-md py-1.5 pl-2.5 pr-1.5 font-semibold text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-brand"><FilePen size={14} aria-hidden className="shrink-0 text-fg-muted" /><span className="truncate" data-dica={titulo}>{titulo}</span></Link>
    <button type="button" onClick={excluir} aria-label={`Excluir o rascunho ${titulo}`} title="Excluir rascunho" className="inline-flex size-8 shrink-0 items-center justify-center rounded-r-md border-l border-border text-fg-muted hover:bg-danger/10 hover:text-danger focus-visible:outline-2 focus-visible:outline-brand"><X size={14} /></button>
    {dialog}
  </span>;
}
