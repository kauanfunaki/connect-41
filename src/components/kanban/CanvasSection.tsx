"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import type { PipelineState } from "@/app/(app)/kanban/actions";

export type CanvasPageData = { id: string; title: string; content: string | null; createdByName: string };

type Props = {
  canAct: boolean;
  pages: CanvasPageData[];
  createAction: (title: string) => Promise<{ error: string } | { id: string }>;
  updateAction: (canvasId: string, prev: PipelineState, form: FormData) => Promise<PipelineState>;
  deleteAction: (canvasId: string) => Promise<void>;
};

function CanvasEditor({
  page, canAct, updateAction, onClose,
}: { page: CanvasPageData; canAct: boolean; updateAction: Props["updateAction"]; onClose: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    if (!formRef.current) return;
    setError(null);
    const form = new FormData(formRef.current);
    startTransition(async () => {
      const res = await updateAction(page.id, null, form);
      if (res?.error) setError(res.error);
    });
  }

  return (
    <div className="border border-border rounded-lg p-4 mt-2">
      <form ref={formRef} className="space-y-2">
        <Input name="title" defaultValue={page.title} disabled={!canAct} placeholder="Título do documento" />
        <RichTextEditor name="content" defaultValue={page.content ?? ""} />
        {error && <p className="text-[12px] text-danger">{error}</p>}
        {canAct && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="h-8 px-3 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
            >
              {isPending ? "Salvando…" : "Salvar"}
            </button>
            <button type="button" onClick={onClose} className="h-8 px-3 rounded-md border border-border text-[12px] text-fg-muted hover:text-fg transition-colors">
              Fechar
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

// "Criar documento" — página em branco (não é upload de arquivo), sempre
// vinculada a esta tarefa. Botão escondido atrás quando ainda não há nenhuma,
// igual às demais seções (subtarefa/checklist/links).
export function CanvasSection({ canAct, pages, createAction, updateAction, deleteAction }: Props) {
  const [open, setOpen] = useState(pages.length > 0);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function submitCreate() {
    const title = newTitle.trim();
    if (!title) return;
    startTransition(async () => {
      const res = await createAction(title);
      if ("id" in res) setExpandedId(res.id);
    });
    setNewTitle("");
    setCreating(false);
  }

  if (!open && pages.length === 0) {
    if (!canAct) return null;
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors"
      >
        <FileText size={13} /> Criar documento
      </button>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <h2 className="text-[13px] font-semibold text-fg mb-3">Documentos</h2>

      {pages.length > 0 && (
        <div className="divide-y divide-border">
          {pages.map((p) => (
            <div key={p.id}>
              <div className="flex items-center justify-between gap-2 py-1.5 group">
                <button
                  type="button"
                  onClick={() => setExpandedId((id) => (id === p.id ? null : p.id))}
                  className="flex items-center gap-2 text-[13px] text-fg hover:text-brand transition-colors truncate min-w-0"
                >
                  <FileText size={14} className="flex-shrink-0 text-fg-muted" />
                  {p.title}
                </button>
                {canAct && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm(`Excluir "${p.title}"? Esta ação não pode ser desfeita.`)) startTransition(() => deleteAction(p.id));
                    }}
                    className="text-fg-muted hover:text-danger p-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              {expandedId === p.id && (
                <CanvasEditor page={p} canAct={canAct} updateAction={updateAction} onClose={() => setExpandedId(null)} />
              )}
            </div>
          ))}
        </div>
      )}

      {canAct && (
        creating ? (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitCreate()}
              placeholder="Título do novo documento…"
              autoFocus
            />
            <button
              type="button"
              onClick={submitCreate}
              className="h-9 px-3 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover transition-colors flex-shrink-0"
            >
              Criar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted hover:text-fg transition-colors mt-3 pt-3 border-t border-border w-full"
          >
            <Plus size={13} /> Novo documento
          </button>
        )
      )}
    </div>
  );
}
