"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { ChevronDown, ChevronRight, FileText, Folder, ImagePlus, Plus, Trash2, X } from "lucide-react";
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
  coverImageUrl: string | null;
  createdByName: string;
  updatedAt: string; // ISO
};
export type ManualDocumentData = { id: string; title: string; icon: string | null; pages: ManualPageData[] };

type Props = {
  canAct: boolean;
  canDelete: boolean;
  documents: ManualDocumentData[];
  createDocumentAction: (title: string) => Promise<{ error: string } | { id: string }>;
  renameDocumentAction: (documentId: string, title: string) => Promise<void>;
  deleteDocumentAction: (documentId: string) => Promise<void>;
  updateDocumentIconAction: (documentId: string, icon: string | null) => Promise<void>;
  createPageAction: (documentId: string, title: string) => Promise<{ error: string } | { id: string }>;
  updatePageAction: (pageId: string, prev: ManualPageState, form: FormData) => Promise<ManualPageState>;
  deletePageAction: (pageId: string) => Promise<void>;
};

// Paleta curta de ícones comuns pra manual/procedimento — não é um picker de
// emoji completo (sem lib nova), só o suficiente pra dar identidade visual
// rápida aos documentos na árvore, no espírito do ícone de página do Notion.
const ICON_CHOICES = [
  "📘", "📗", "📙", "📕", "📓", "📒", "🗂️", "🗃️", "📁", "🧾",
  "🧭", "🛠️", "⚙️", "💼", "📊", "✅", "🔔", "📌", "🚀", "🧩",
  "🔒", "👥", "💡", "📞", "🧮", "🖥️", "📅", "🎯", "📬", "💰",
];

function IconPicker({ value, onChange, onClose }: { value: string | null; onChange: (icon: string | null) => void; onClose: () => void }) {
  return (
    <>
      {/* backdrop transparente só pra capturar o clique-fora e fechar o popover */}
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute z-20 top-full left-0 mt-1 w-60 rounded-md border border-border bg-surface shadow-lg p-2">
        <div className="grid grid-cols-6 gap-0.5">
          {ICON_CHOICES.map((icon) => (
            <button
              key={icon}
              type="button"
              onClick={() => { onChange(icon); onClose(); }}
              className={`w-8 h-8 flex items-center justify-center rounded text-[17px] leading-none hover:bg-surface-hover ${value === icon ? "bg-brand-subtle" : ""}`}
            >
              {icon}
            </button>
          ))}
        </div>
        {value && (
          <button
            type="button"
            onClick={() => { onChange(null); onClose(); }}
            className="mt-1.5 w-full flex items-center gap-1.5 text-[12px] text-fg-muted hover:text-danger px-1.5 py-1 rounded hover:bg-surface-hover transition-colors"
          >
            <X size={12} /> Remover ícone
          </button>
        )}
      </div>
    </>
  );
}

// Tipografia do conteúdo — a MESMA em leitura e em escrita. Antes existiam
// duas: a de leitura aqui e a do campo de formulário dentro do RichTextEditor,
// então entrar em edição reposicionava todo o texto na tela.
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

// Separação visual entre blocos: cada filho de nível 1 do documento ganha uma
// faixa própria que acende no hover. Antes os blocos eram indistinguíveis —
// parágrafos coladas num texto corrido, sem nada indicando onde um termina e o
// outro começa, o que também tornava o puxador de arrastar difícil de
// entender (ele aparecia sem que se enxergasse a unidade que ia se mover).
const BLOCK_SEPARATION_CLASS =
  "[&>*]:relative [&>*]:rounded-md [&>*]:px-2 [&>*]:-mx-2 [&>*]:transition-colors [&>*:hover]:bg-surface-hover/50";

// Quanto tempo sem digitar antes de gravar. Curto o bastante pra ninguém
// perder trabalho ao fechar a aba, longo o bastante pra não gravar por letra.
const AUTOSAVE_DELAY_MS = 1200;

type SaveStatus = "idle" | "saving" | "saved" | "error";

function SaveIndicator({ status, error }: { status: SaveStatus; error: string | null }) {
  if (status === "idle") return null;
  if (status === "error") {
    return <span className="text-[12px] text-danger">{error ?? "Erro ao salvar"}</span>;
  }
  return (
    <span className="text-[12px] text-fg-muted">
      {status === "saving" ? "Salvando…" : "Salvo"}
    </span>
  );
}

// Controles da capa. Ficam disponíveis SEMPRE (não atrás de um modo de
// edição): a capa grava sozinha na hora em que o arquivo é escolhido, então
// exigir "entrar em edição" e depois "descer a tela e salvar o documento" era
// um caminho inventado — nenhuma dessas duas etapas tinha efeito sobre ela.
function CoverControls({
  pageId, coverUrl, onChange, canAct,
}: {
  pageId: string;
  coverUrl: string | null;
  onChange: (url: string | null) => void;
  canAct: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("cover", file);
      const res = await fetch(`/api/bpo-manual/pages/${pageId}/cover`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Erro ao enviar capa.");
      else onChange(data.coverImageUrl);
    } catch {
      setError("Erro ao enviar capa.");
    } finally {
      setPending(false);
    }
  }

  async function handleRemove() {
    setPending(true);
    setError(null);
    try {
      await fetch(`/api/bpo-manual/pages/${pageId}/cover`, { method: "DELETE" });
      onChange(null);
    } finally {
      setPending(false);
    }
  }

  if (!canAct) {
    return coverUrl ? (
      // eslint-disable-next-line @next/next/no-img-element -- imagem servida por rota própria (src/app/api/bpo-manual), não candidata a otimização do next/image
      <img src={coverUrl} alt="" className="w-full h-48 object-cover" />
    ) : null;
  }

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />

      {coverUrl ? (
        <div className="relative group">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagem servida por rota própria (src/app/api/bpo-manual) */}
          <img src={coverUrl} alt="" className="w-full h-48 object-cover" />
          <div className="absolute top-3 right-3 flex gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={pending}
              className="h-7 px-2.5 rounded-md bg-surface/90 border border-border text-[12px] text-fg-secondary hover:text-fg disabled:opacity-60"
            >
              Trocar capa
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={pending}
              className="h-7 px-2.5 rounded-md bg-surface/90 border border-border text-[12px] text-fg-secondary hover:text-danger disabled:opacity-60"
            >
              Remover
            </button>
          </div>
        </div>
      ) : null}

      {error && <p className="text-[12px] text-danger px-6 pt-2">{error}</p>}

      {!coverUrl && (
        <div className={`${CANVAS_CLASS} !py-0 !pt-6`}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={pending}
            className="inline-flex items-center gap-1.5 text-[12px] text-fg-muted hover:text-fg-secondary disabled:opacity-60"
          >
            <ImagePlus size={13} /> {pending ? "Enviando…" : "Adicionar capa"}
          </button>
        </div>
      )}
    </>
  );
}

// A página é uma folha só: título e conteúdo no fluxo, sem caixa de formulário
// à vista e sem modo de edição separado. Quem pode escrever, escreve clicando
// direto no texto — igual ao título, que já funcionava assim.
//
// O modo "Editar" anterior misturava duas coisas que não têm nada a ver: a
// capa (que grava sozinha, na hora) e o texto (que exigia rolar até o rodapé
// pra achar "Salvar"). Aqui a capa tem controles próprios e o texto grava
// sozinho, com o estado da gravação visível no topo.
function PageCanvas({
  page, canAct, updatePageAction,
}: {
  page: ManualPageData;
  canAct: boolean;
  updatePageAction: Props["updatePageAction"];
}) {
  const [coverUrl, setCoverUrl] = useState(page.coverImageUrl);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // O que está pendente de gravação. Ref, não state: é lido dentro do timer e
  // não deve provocar render a cada tecla.
  const draftRef = useRef({ title: page.title, content: page.content ?? "" });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(async () => {
    const { title, content } = draftRef.current;
    if (!title.trim()) {
      setStatus("error");
      setError("Título é obrigatório");
      return;
    }
    setStatus("saving");
    setError(null);
    const form = new FormData();
    form.append("title", title);
    form.append("content", content);
    const res = await updatePageAction(page.id, null, form);
    if (res?.error) {
      setStatus("error");
      setError(res.error);
    } else {
      setStatus("saved");
    }
  }, [page.id, updatePageAction]);

  const scheduleSave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(save, AUTOSAVE_DELAY_MS);
  }, [save]);

  // Grava o que estiver pendente ao sair da página (trocar de página no menu
  // desmonta este componente, porque a chave inclui o id). Sem isso, escrever
  // e clicar noutra página em menos de AUTOSAVE_DELAY_MS perderia o texto.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        void save();
      }
    };
  }, [save]);

  return (
    <div className="h-full overflow-y-auto scroll-y relative">
      {canAct && (
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          <SaveIndicator status={status} error={error} />
        </div>
      )}

      <CoverControls pageId={page.id} coverUrl={coverUrl} onChange={setCoverUrl} canAct={canAct} />

      <article className={CANVAS_CLASS}>
        {canAct ? (
          // eslint-disable-next-line no-restricted-syntax -- título da página, não campo de formulário: precisa ter exatamente a mesma caixa do <h1> de leitura. O Input do DS tem altura, borda e fundo fixos.
          <input
            defaultValue={page.title}
            placeholder="Título da página"
            aria-label="Título da página"
            onChange={(e) => {
              draftRef.current.title = e.target.value;
              scheduleSave();
            }}
            className="w-full bg-transparent border-0 outline-none text-[32px] font-semibold text-fg tracking-[-0.02em] leading-tight placeholder:text-fg-muted"
          />
        ) : (
          <h1 className="text-[32px] font-semibold text-fg tracking-[-0.02em] leading-tight">{page.title}</h1>
        )}

        <p className="text-[12px] text-fg-muted mt-2 mb-8">
          Criado por {page.createdByName} · atualizado em{" "}
          {formatInstantDate(new Date(page.updatedAt), { day: "2-digit", month: "short", year: "numeric" })}
        </p>

        {canAct ? (
          <RichTextEditor
            chrome="bare"
            blockDragHandle
            defaultValue={page.content ?? ""}
            contentClass={`${READING_CLASS} ${BLOCK_SEPARATION_CLASS} min-h-[240px]`}
            onChange={(html) => {
              draftRef.current.content = html;
              scheduleSave();
            }}
          />
        ) : page.content ? (
          <div className={READING_CLASS} dangerouslySetInnerHTML={{ __html: page.content }} />
        ) : (
          <p className="text-[15px] text-fg-muted italic">Esta página ainda não tem conteúdo.</p>
        )}
      </article>
    </div>
  );
}

// Biblioteca em dois níveis (Documento > Página) — cada documento é uma
// coleção própria de páginas (ex.: "Onboarding", "Processo de Cobrança"),
// diferente do modelo anterior de uma lista única de páginas onde só dava
// pra adicionar mais conteúdo, nunca começar um segundo documento.
export function ManualWorkspace({
  canAct, canDelete, documents, createDocumentAction, renameDocumentAction, deleteDocumentAction, updateDocumentIconAction,
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
  const [iconPickerFor, setIconPickerFor] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const { dialog, requestConfirm } = useConfirm();

  function submitDocumentIcon(docId: string, icon: string | null) {
    startTransition(() => updateDocumentIconAction(docId, icon));
  }

  const activeDoc = documents.find((d) => d.pages.some((p) => p.id === activePageId));
  const activePage = activeDoc?.pages.find((p) => p.id === activePageId) ?? null;

  function selectPage(pageId: string | null) {
    setActivePageId(pageId);
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
      if ("id" in res) setActivePageId(res.id);
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
      <Card>
        <EmptyState icon={<FileText />} title="Nenhum documento ainda" description="Peça ao coordenador do BPO pra criar o primeiro documento do manual." />
      </Card>
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
                  <div className="relative flex-shrink-0">
                    {canAct ? (
                      <button
                        type="button"
                        onClick={() => setIconPickerFor(iconPickerFor === doc.id ? null : doc.id)}
                        className="w-[18px] h-[18px] flex items-center justify-center rounded text-[14px] leading-none hover:bg-surface-hover"
                        title="Escolher ícone"
                        aria-label="Escolher ícone do documento"
                      >
                        {doc.icon ?? <Folder size={14} className="text-fg-muted" />}
                      </button>
                    ) : doc.icon ? (
                      <span className="w-[18px] h-[18px] flex items-center justify-center text-[14px] leading-none">{doc.icon}</span>
                    ) : (
                      <Folder size={14} className="text-fg-muted" />
                    )}
                    {iconPickerFor === doc.id && (
                      <IconPicker
                        value={doc.icon}
                        onChange={(icon) => submitDocumentIcon(doc.id, icon)}
                        onClose={() => setIconPickerFor(null)}
                      />
                    )}
                  </div>
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
                      title={canAct ? "Clique para renomear" : doc.title} aria-label={canAct ? "Clique para renomear" : doc.title}
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
          // A chave por id remonta o canvas ao trocar de página — é o que
          // dispara a gravação do rascunho pendente na limpeza do efeito.
          <PageCanvas
            key={activePage.id}
            page={activePage}
            canAct={canAct}
            updatePageAction={updatePageAction}
          />
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
