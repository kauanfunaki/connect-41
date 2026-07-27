"use client";

import { useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, FileText, Folder, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/useConfirm";
import type { ManualPageState } from "@/app/(app)/bpo-manual/actions";

export type ManualPageData = { id: string; title: string; content: string | null; createdByName: string };
export type ManualDocumentData = { id: string; title: string; pages: ManualPageData[] };

type Props = {
  canAct: boolean;
  canDelete: boolean;
  documents: ManualDocumentData[];
  createDocumentAction: (title: string) => Promise<{ error: string } | { id: string }>;
  renameDocumentAction: (documentId: string, title: string) => Promise<void>;
  deleteDocumentAction: (documentId: string) => Promise<void>;
  createPageAction: (documentId: string, title: string) => Promise<{ error: string } | { id: string }>;
  updatePageAction: (pageId: string, prev: ManualPageState, form: FormData) => Promise<ManualPageState>;
  deletePageAction: (pageId: string) => Promise<void>;
};

function PageEditor({ page, canAct, updatePageAction }: { page: ManualPageData; canAct: boolean; updatePageAction: Props["updatePageAction"] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    if (!formRef.current) return;
    setError(null);
    const form = new FormData(formRef.current);
    startTransition(async () => {
      const res = await updatePageAction(page.id, null, form);
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

// Biblioteca em dois níveis (Documento > Página) — cada documento é uma
// coleção própria de páginas (ex.: "Onboarding", "Processo de Cobrança"),
// diferente do modelo anterior de uma lista única de páginas onde só dava
// pra adicionar mais conteúdo, nunca começar um segundo documento.
export function ManualWorkspace({
  canAct, canDelete, documents, createDocumentAction, renameDocumentAction, deleteDocumentAction,
  createPageAction, updatePageAction, deletePageAction,
}: Props) {
  const firstDoc = documents[0];
  const [activePageId, setActivePageId] = useState<string | null>(firstDoc?.pages[0]?.id ?? null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(firstDoc ? [firstDoc.id] : []));
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState("");
  const [creatingPageFor, setCreatingPageFor] = useState<string | null>(null);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [, startTransition] = useTransition();
  const { dialog, requestConfirm } = useConfirm();

  const activeDoc = documents.find((d) => d.pages.some((p) => p.id === activePageId));
  const activePage = activeDoc?.pages.find((p) => p.id === activePageId) ?? null;

  function toggleExpanded(docId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  }

  function submitCreateDocument() {
    const title = newDocTitle.trim();
    if (!title) return;
    startTransition(async () => {
      const res = await createDocumentAction(title);
      if ("id" in res) setExpanded((prev) => new Set(prev).add(res.id));
    });
    setNewDocTitle("");
    setCreatingDoc(false);
  }

  function submitCreatePage(documentId: string) {
    const title = newPageTitle.trim();
    if (!title) return;
    startTransition(async () => {
      const res = await createPageAction(documentId, title);
      if ("id" in res) setActivePageId(res.id);
    });
    setNewPageTitle("");
    setCreatingPageFor(null);
  }

  function submitRenameDocument(docId: string) {
    const title = renameValue.trim();
    setRenamingDocId(null);
    if (!title) return;
    startTransition(() => renameDocumentAction(docId, title));
  }

  function handleDeleteDocument(doc: ManualDocumentData) {
    requestConfirm(
      {
        title: `Excluir o documento "${doc.title}"?`,
        description: doc.pages.length > 0 ? `Isso remove ${doc.pages.length} página(s) junto. Esta ação não pode ser desfeita.` : "Esta ação não pode ser desfeita.",
        destructive: true,
        confirmLabel: "Excluir",
      },
      async () => {
        await deleteDocumentAction(doc.id);
        if (doc.pages.some((p) => p.id === activePageId)) setActivePageId(null);
      }
    );
  }

  function handleDeletePage(page: ManualPageData) {
    requestConfirm({ title: `Excluir "${page.title}"?`, description: "Esta ação não pode ser desfeita.", destructive: true, confirmLabel: "Excluir" }, async () => {
      await deletePageAction(page.id);
      if (activePageId === page.id) setActivePageId(null);
    });
  }

  if (documents.length === 0 && !canAct) {
    return (
      <div className="bg-surface border border-border rounded-2xl">
        <EmptyState icon={<FileText />} title="Nenhum documento ainda" description="Peça ao coordenador do BPO pra criar o primeiro documento do manual." />
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-lg flex h-[70vh] min-h-[420px]">
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-border p-3">
        <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5">
          {documents.map((doc) => {
            const isExpanded = expanded.has(doc.id);
            return (
              <div key={doc.id}>
                <div className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(doc.id)}
                    className="flex-shrink-0 text-fg-muted hover:text-fg p-0.5"
                    aria-label={isExpanded ? "Recolher" : "Expandir"}
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  <Folder size={14} className="text-fg-muted flex-shrink-0" />
                  {renamingDocId === doc.id ? (
                    <Input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => submitRenameDocument(doc.id)}
                      onKeyDown={(e) => e.key === "Enter" && submitRenameDocument(doc.id)}
                      className="flex-1 min-w-0 !h-7 px-2 text-[13px]"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        if (canAct) {
                          setRenamingDocId(doc.id);
                          setRenameValue(doc.title);
                        } else {
                          toggleExpanded(doc.id);
                        }
                      }}
                      className="flex-1 min-w-0 text-left text-[13px] font-medium text-fg truncate py-1"
                      title={canAct ? "Clique para renomear" : doc.title}
                    >
                      {doc.title}
                    </button>
                  )}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDeleteDocument(doc)}
                      className="flex-shrink-0 text-fg-muted hover:text-danger p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Excluir documento"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>

                {isExpanded && (
                  <div className="ml-6 space-y-0.5">
                    {doc.pages.map((p) => (
                      <div key={p.id} className="group flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setActivePageId(p.id)}
                          className={`flex-1 min-w-0 flex items-center gap-1.5 text-left px-2 py-1 rounded-md text-[12.5px] transition-colors truncate ${
                            activePageId === p.id ? "bg-brand-subtle text-brand font-medium" : "text-fg-secondary hover:bg-surface-hover hover:text-fg"
                          }`}
                        >
                          <FileText size={12} className="flex-shrink-0" />
                          <span className="truncate">{p.title}</span>
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDeletePage(p)}
                            className="flex-shrink-0 text-fg-muted hover:text-danger p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-label="Excluir página"
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    ))}

                    {canAct && (
                      creatingPageFor === doc.id ? (
                        <Input
                          autoFocus
                          value={newPageTitle}
                          onChange={(e) => setNewPageTitle(e.target.value)}
                          onBlur={() => submitCreatePage(doc.id)}
                          onKeyDown={(e) => e.key === "Enter" && submitCreatePage(doc.id)}
                          placeholder="Título da página…"
                          className="w-full !h-7 px-2 text-[12.5px]"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setCreatingPageFor(doc.id); setNewPageTitle(""); }}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-[12px] text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
                        >
                          <Plus size={11} /> Página
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {canAct && (
          <div className="pt-2 mt-2 border-t border-border flex-shrink-0">
            {creatingDoc ? (
              <Input
                autoFocus
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                onBlur={submitCreateDocument}
                onKeyDown={(e) => e.key === "Enter" && submitCreateDocument()}
                placeholder="Título do documento…"
                className="w-full !h-8 px-2 text-[13px]"
              />
            ) : (
              <button
                type="button"
                onClick={() => setCreatingDoc(true)}
                className="w-full flex items-center gap-1.5 h-8 px-2 rounded-md text-[12.5px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors"
              >
                <Plus size={13} /> Novo documento
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 p-4">
        {activePage ? (
          <PageEditor key={activePage.id} page={activePage} canAct={canAct} updatePageAction={updatePageAction} />
        ) : (
          <div className="h-full flex items-center justify-center text-[13px] text-fg-muted text-center px-6">
            {documents.length === 0
              ? canAct
                ? "Crie um documento pra começar."
                : "Nenhum documento no manual ainda."
              : "Selecione ou crie uma página pra começar."}
          </div>
        )}
      </div>
      {dialog}
    </div>
  );
}
