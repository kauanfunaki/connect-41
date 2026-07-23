"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
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

function PageEditor({
  page, canAct, updateAction,
}: { page: CanvasPageData; canAct: boolean; updateAction: Props["updateAction"] }) {
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
    <form key={page.id} ref={formRef} className="flex flex-col gap-2 h-full min-h-0">
      <Input name="title" defaultValue={page.title} disabled={!canAct} placeholder="Título do documento" className="flex-shrink-0" />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <RichTextEditor name="content" defaultValue={page.content ?? ""} />
      </div>
      {error && <p className="text-[12px] text-danger flex-shrink-0">{error}</p>}
      {canAct && (
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="h-8 px-3 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors flex-shrink-0 self-start"
        >
          {isPending ? "Salvando…" : "Salvar"}
        </button>
      )}
    </form>
  );
}

// Documentos da tarefa como modal dedicado — sidebar de páginas à esquerda +
// editor da página selecionada à direita, em vez do accordion inline anterior
// (CanvasSection). Reaproveita o mesmo model/actions (CanvasPage), só muda a
// camada de UI.
export function CanvasModal({ canAct, pages, createAction, updateAction, deleteAction }: Props) {
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(pages[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [, startTransition] = useTransition();

  const activePage = pages.find((p) => p.id === activeId) ?? null;

  function openModal() {
    setActiveId((id) => id ?? pages[0]?.id ?? null);
    setOpen(true);
  }

  function submitCreate() {
    const title = newTitle.trim();
    if (!title) return;
    startTransition(async () => {
      const res = await createAction(title);
      if ("id" in res) setActiveId(res.id);
    });
    setNewTitle("");
    setCreating(false);
  }

  function handleDelete(pageId: string, title: string) {
    if (!confirm(`Excluir "${title}"? Esta ação não pode ser desfeita.`)) return;
    startTransition(() => deleteAction(pageId));
    if (activeId === pageId) setActiveId(pages.find((p) => p.id !== pageId)?.id ?? null);
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors w-fit"
      >
        <FileText size={13} /> Documentos{pages.length > 0 ? ` (${pages.length})` : ""}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Documentos" maxWidth="max-w-3xl">
        <div className="flex h-[65vh] min-h-[360px] gap-4">
          <div className="w-52 flex-shrink-0 flex flex-col border-r border-border pr-3">
            <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5">
              {pages.map((p) => (
                <div key={p.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveId(p.id)}
                    className={`flex-1 min-w-0 flex items-center gap-1.5 text-left px-2 py-1.5 rounded-md text-[12px] truncate transition-colors ${
                      activeId === p.id ? "bg-surface-hover text-fg font-medium" : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
                    }`}
                  >
                    <FileText size={12} className="flex-shrink-0 text-fg-muted" />
                    <span className="truncate">{p.title}</span>
                  </button>
                  {canAct && (
                    <button
                      type="button"
                      onClick={() => handleDelete(p.id, p.title)}
                      className="text-fg-muted hover:text-danger p-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label={`Excluir ${p.title}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
              {pages.length === 0 && <p className="text-[12px] text-fg-muted px-2 py-1.5">Nenhum documento ainda.</p>}
            </div>

            {canAct && (
              creating ? (
                <div className="flex items-center gap-1 pt-2 border-t border-border mt-2 flex-shrink-0">
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitCreate();
                      if (e.key === "Escape") { setCreating(false); setNewTitle(""); }
                    }}
                    placeholder="Título…"
                    autoFocus
                    className="h-8 text-[12px]"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted hover:text-fg transition-colors mt-2 pt-2 border-t border-border w-full flex-shrink-0"
                >
                  <Plus size={13} /> Nova página
                </button>
              )
            )}
          </div>

          <div className="flex-1 min-w-0">
            {activePage ? (
              <PageEditor key={activePage.id} page={activePage} canAct={canAct} updateAction={updateAction} />
            ) : (
              <div className="h-full flex items-center justify-center text-[13px] text-fg-muted">
                {canAct ? "Crie uma página pra começar." : "Nenhum documento nesta tarefa."}
              </div>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
