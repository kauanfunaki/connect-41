"use client";

import { useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, FileText, Folder, Pencil, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { EmptyState } from "@/components/ui/EmptyState";
import { useConfirm } from "@/components/ui/useConfirm";
import { formatInstantDate } from "@/lib/format";
import type { ManualPageState } from "@/app/(app)/bpo-manual/actions";

export type ManualPageData = {
  id: string;
  title: string;
  content: string | null;
  createdByName: string;
  updatedAt: string; // ISO
};
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

// Tipografia do conteúdo em leitura — deliberadamente mais generosa que a do
// editor (parágrafos espaçados, títulos com respiro), no espírito de uma
// página de documentação e não de um campo de formulário.
const READING_CLASS =
  "text-[15px] text-fg leading-[1.75] " +
  "[&_p]:my-3 [&_p:first-child]:mt-0 " +
  // h1 e pre não têm botão na toolbar, mas a allowlist do sanitizador aceita
  // (src/lib/clientDocuments.ts) — colar de fora traz os dois.
  "[&_h1]:text-[24px] [&_h1]:font-semibold [&_h1]:mt-8 [&_h1]:mb-2 [&_h1]:tracking-[-0.01em] " +
  "[&_h2]:text-[20px] [&_h2]:font-semibold [&_h2]:mt-7 [&_h2]:mb-2 [&_h2]:tracking-[-0.01em] " +
  "[&_h3]:text-[16px] [&_h3]:font-semibold [&_h3]:mt-5 [&_h3]:mb-1.5 " +
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-3 [&_li]:my-1 " +
  "[&_a]:text-brand [&_a]:underline " +
  "[&_strong]:font-semibold [&_u]:underline [&_s]:line-through " +
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border-strong [&_blockquote]:pl-4 [&_blockquote]:text-fg-secondary " +
  "[&_code]:bg-surface-hover [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[13px] " +
  "[&_pre]:bg-surface-hover [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:text-[13px]";

// Largura de leitura confortável, no espírito do Notion — texto corrido em
// 1440px de tela vira uma linha longa demais pra acompanhar.
const CANVAS_CLASS = "mx-auto w-full max-w-[720px] px-6 py-10";

// Leitura: a página é uma folha em branco com título e conteúdo, sem caixas
// nem campos de formulário à vista. Editar é um modo separado (PageEditor) —
// antes o manual ficava permanentemente em modo de edição, então "salvar" não
// mudava nada na tela e não havia como só *ler* um procedimento.
function PageCanvas({
  page, canAct, onEdit,
}: {
  page: ManualPageData;
  canAct: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="h-full overflow-y-auto scroll-y relative">
      {canAct && (
        <button
          type="button"
          onClick={onEdit}
          className="absolute top-4 right-4 z-10 inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-surface text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors"
        >
          <Pencil size={12} /> Editar
        </button>
      )}

      <article className={CANVAS_CLASS}>
        <h1 className="text-[32px] font-semibold text-fg tracking-[-0.02em] leading-tight">{page.title}</h1>
        <p className="text-[12px] text-fg-muted mt-2 mb-8">
          Criado por {page.createdByName} · atualizado em{" "}
          {formatInstantDate(new Date(page.updatedAt), { day: "2-digit", month: "short", year: "numeric" })}
        </p>

        {page.content ? (
          <div className={READING_CLASS} dangerouslySetInnerHTML={{ __html: page.content }} />
        ) : canAct ? (
          <button
            type="button"
            onClick={onEdit}
            className="text-[15px] text-fg-muted italic hover:text-fg-secondary transition-colors"
          >
            Página em branco — clique para escrever.
          </button>
        ) : (
          <p className="text-[15px] text-fg-muted italic">Esta página ainda não tem conteúdo.</p>
        )}
      </article>
    </div>
  );
}

// Edição: mesma medida e mesma escala de título da leitura, pra trocar de modo
// não deslocar o texto na tela. Salvar com sucesso volta pro modo leitura.
function PageEditor({
  page, updatePageAction, onDone, onCancel,
}: {
  page: ManualPageData;
  updatePageAction: Props["updatePageAction"];
  onDone: () => void;
  onCancel: () => void;
}) {
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
      else onDone();
    });
  }

  return (
    <form ref={formRef} className="h-full overflow-y-auto scroll-y">
      <div className={CANVAS_CLASS}>
        {/* eslint-disable-next-line no-restricted-syntax -- título da página, não campo de formulário: precisa ter exatamente a mesma caixa do <h1> do modo leitura pra trocar de modo não deslocar o texto. O Input do DS tem altura, borda e fundo fixos. */}
        <input
          name="title"
          defaultValue={page.title}
          placeholder="Título da página"
          aria-label="Título da página"
          className="w-full bg-transparent border-0 outline-none text-[32px] font-semibold text-fg tracking-[-0.02em] leading-tight placeholder:text-fg-muted"
        />
        <p className="text-[12px] text-fg-muted mt-2 mb-6">Criado por {page.createdByName}</p>

        <RichTextEditor name="content" defaultValue={page.content ?? ""} />

        {error && <p className="text-[12px] text-danger mt-2">{error}</p>}

        <div className="flex items-center gap-2 mt-4">
          <button
            type="button"
            onClick={save}
            disabled={isPending}
            className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
          >
            {isPending ? "Salvando…" : "Salvar"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="h-9 px-4 rounded-md border border-border text-[13px] text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
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
  // Página abre sempre em leitura; editar é uma escolha explícita. A exceção é
  // a página recém-criada, que nasce vazia — mostrar uma folha em branco
  // "somente leitura" logo depois de criá-la seria só um passo a mais.
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
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

  // Trocar de página sempre sai da edição — senão o modo "grudava" e a página
  // seguinte abria em edição sem ninguém ter pedido.
  function selectPage(pageId: string | null) {
    setActivePageId(pageId);
    setEditingPageId(null);
  }

  function toggleExpanded(docId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  }

  // Fechar e criar são passos separados de propósito: o campo some SEMPRE que
  // perde o foco (ou no Esc), tendo texto ou não. Antes o submit saía cedo
  // quando o título estava vazio e nunca chegava a fechar — clicar fora
  // deixava o input aberto pra sempre, sem jeito óbvio de cancelar.
  function closeCreateDocument() {
    setNewDocTitle("");
    setCreatingDoc(false);
  }

  function submitCreateDocument() {
    const title = newDocTitle.trim();
    closeCreateDocument();
    if (!title) return;
    startTransition(async () => {
      const res = await createDocumentAction(title);
      if ("id" in res) setExpanded((prev) => new Set(prev).add(res.id));
    });
  }

  function closeCreatePage() {
    setNewPageTitle("");
    setCreatingPageFor(null);
  }

  function submitCreatePage(documentId: string) {
    const title = newPageTitle.trim();
    closeCreatePage();
    if (!title) return;
    startTransition(async () => {
      const res = await createPageAction(documentId, title);
      if ("id" in res) {
        setActivePageId(res.id);
        setEditingPageId(res.id);
      }
    });
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
        if (doc.pages.some((p) => p.id === activePageId)) selectPage(null);
      }
    );
  }

  function handleDeletePage(page: ManualPageData) {
    requestConfirm({ title: `Excluir "${page.title}"?`, description: "Esta ação não pode ser desfeita.", destructive: true, confirmLabel: "Excluir" }, async () => {
      await deletePageAction(page.id);
      if (activePageId === page.id) selectPage(null);
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
    // h-full (não uma altura em vh): o pai já reserva exatamente o espaço que
    // sobra da viewport, então o card nunca empurra a página e a única rolagem
    // é a interna — árvore de documentos à esquerda, canvas à direita.
    // overflow-hidden pro canto arredondado recortar essas áreas de rolagem.
    <div className="bg-surface border border-border rounded-lg overflow-hidden flex h-full min-h-0">
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
                          onClick={() => selectPage(p.id)}
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
                          onKeyDown={(e) => {
                            if (e.key === "Enter") submitCreatePage(doc.id);
                            if (e.key === "Escape") closeCreatePage();
                          }}
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitCreateDocument();
                  if (e.key === "Escape") closeCreateDocument();
                }}
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

      <div className="flex-1 min-w-0 min-h-0">
        {activePage ? (
          editingPageId === activePage.id && canAct ? (
            <PageEditor
              key={`edit-${activePage.id}`}
              page={activePage}
              updatePageAction={updatePageAction}
              onDone={() => setEditingPageId(null)}
              onCancel={() => setEditingPageId(null)}
            />
          ) : (
            <PageCanvas
              key={`read-${activePage.id}`}
              page={activePage}
              canAct={canAct}
              onEdit={() => setEditingPageId(activePage.id)}
            />
          )
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
