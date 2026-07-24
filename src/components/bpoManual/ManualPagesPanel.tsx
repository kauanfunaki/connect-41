"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ManualPageState } from "@/app/(app)/bpo-manual/actions";

export type ManualPageData = { id: string; title: string; content: string | null; createdByName: string };

type Props = {
  canAct: boolean;
  canDelete: boolean;
  pages: ManualPageData[];
  createAction: (title: string) => Promise<{ error: string } | { id: string }>;
  updateAction: (pageId: string, prev: ManualPageState, form: FormData) => Promise<ManualPageState>;
  deleteAction: (pageId: string) => Promise<void>;
};

function PageEditor({ page, canAct, updateAction }: { page: ManualPageData; canAct: boolean; updateAction: Props["updateAction"] }) {
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
    <form key={page.id} ref={formRef} className="flex flex-col gap-3 h-full min-h-0">
      <Input name="title" defaultValue={page.title} disabled={!canAct} placeholder="Título da página" className="flex-shrink-0 text-[15px] font-medium" />
      <p className="text-[11px] text-fg-muted flex-shrink-0 -mt-1.5">Criado por {page.createdByName}</p>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <RichTextEditor name="content" defaultValue={page.content ?? ""} />
      </div>
      {error && <p className="text-[12px] text-danger flex-shrink-0">{error}</p>}
      {canAct && (
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors flex-shrink-0 self-start"
        >
          {isPending ? "Salvando…" : "Salvar"}
        </button>
      )}
    </form>
  );
}

// Biblioteca de páginas do setor — sidebar de páginas à esquerda + editor da
// página selecionada à direita. Layout de página cheia (antes era um modal
// dentro do detalhamento de uma tarefa, ver histórico do CanvasModal removido
// em 2026-07-24 — difícil de localizar depois de criado).
export function ManualPagesPanel({ canAct, canDelete, pages, createAction, updateAction, deleteAction }: Props) {
  const [activeId, setActiveId] = useState<string | null>(pages[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [, startTransition] = useTransition();

  const activePage = pages.find((p) => p.id === activeId) ?? null;

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

  if (pages.length === 0 && !canAct) {
    return (
      <div className="bg-surface border border-border rounded-2xl">
        <EmptyState icon={<FileText />} title="Nenhuma página ainda" description="Peça ao coordenador do BPO pra criar a primeira página do manual." />
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-lg flex h-[70vh] min-h-[420px]">
      <div className="w-64 flex-shrink-0 flex flex-col border-r border-border p-3">
        <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5">
          {pages.map((p) => (
            <div key={p.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => setActiveId(p.id)}
                className={`flex-1 min-w-0 flex items-center gap-1.5 text-left px-2.5 py-2 rounded-md text-[13px] truncate transition-colors ${
                  activeId === p.id ? "bg-surface-hover text-fg font-medium" : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
                }`}
              >
                <FileText size={13} className="flex-shrink-0 text-fg-muted" />
                <span className="truncate">{p.title}</span>
              </button>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => handleDelete(p.id, p.title)}
                  className="text-fg-muted hover:text-danger p-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`Excluir ${p.title}`}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
          {pages.length === 0 && <p className="text-[12.5px] text-fg-muted px-2.5 py-2">Nenhuma página ainda.</p>}
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
                className="h-9 text-[13px]"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg transition-colors mt-2 pt-2 border-t border-border w-full flex-shrink-0"
            >
              <Plus size={14} /> Nova página
            </button>
          )
        )}
      </div>

      <div className="flex-1 min-w-0 p-4">
        {activePage ? (
          <PageEditor key={activePage.id} page={activePage} canAct={canAct} updateAction={updateAction} />
        ) : (
          <div className="h-full flex items-center justify-center text-[13px] text-fg-muted">
            {canAct ? "Crie uma página pra começar." : "Nenhuma página no manual ainda."}
          </div>
        )}
      </div>
    </div>
  );
}
