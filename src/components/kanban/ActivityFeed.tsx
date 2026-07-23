"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Paperclip, Search, LinkIcon } from "lucide-react";
import { MentionTextarea, type MentionUser } from "@/components/transferencias/MentionTextarea";
import { Input } from "@/components/ui/Input";
import { renderRichText } from "@/lib/richText";
import type { PipelineState } from "@/app/(app)/kanban/actions";

export type FeedReply = {
  id: string;
  userId: string;
  userName: string;
  createdAtLabel: string;
  content: string | null;
  edited: boolean;
  canModify: boolean;
};

export type FeedItem = {
  id: string;
  type: string;
  label: string;
  createdAtLabel: string;
  userId: string;
  userName: string;
  content: string | null;
  importante: boolean;
  isComment: boolean;
  edited: boolean;
  canModify: boolean;
  replies: FeedReply[];
};

export type TaskMentionCandidate = { id: string; name: string; href: string };

type Props = {
  items: FeedItem[];
  canAct: boolean;
  mentionUsers: MentionUser[];
  pipelineItemId: string;
  taskCandidates: TaskMentionCandidate[];
  addNoteAction: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
  editAction: (activityId: string, content: string) => Promise<void>;
  deleteAction: (activityId: string) => Promise<void>;
};

function TaskMentionPicker({ candidates, onPick }: { candidates: TaskMentionCandidate[]; onPick: (c: TaskMentionCandidate) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const matches = query.trim() ? candidates.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8) : candidates.slice(0, 8);

  return (
    <div className="relative">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        title="Mencionar tarefa"
        className="text-fg-muted hover:text-fg p-1.5 rounded-md hover:bg-surface-hover transition-colors"
      >
        <LinkIcon size={15} />
      </button>
      {open && (
        <div className="absolute z-20 bottom-full left-0 mb-1 w-64 bg-surface-elevated border border-border-strong rounded-lg shadow-[var(--c41-shadow-lg)] p-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar tarefa…"
            autoFocus
            className="mb-1"
          />
          <div className="max-h-40 overflow-y-auto">
            {matches.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onPick(c); setOpen(false); setQuery(""); }}
                className="w-full text-left px-2 py-1.5 rounded-md text-[12px] text-fg-secondary hover:bg-surface-hover hover:text-fg transition-colors truncate"
              >
                {c.name}
              </button>
            ))}
            {matches.length === 0 && <p className="text-[11px] text-fg-muted px-2 py-1.5">Nenhuma tarefa encontrada</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Composer({
  mentionUsers,
  taskCandidates,
  pipelineItemId,
  parentActivityId,
  placeholder,
  submitLabel,
  defaultValue = "",
  onSubmit,
  onCancel,
}: {
  mentionUsers: MentionUser[];
  taskCandidates: TaskMentionCandidate[];
  pipelineItemId: string;
  parentActivityId?: string;
  placeholder: string;
  submitLabel: string;
  defaultValue?: string;
  onSubmit: (form: FormData) => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [isPending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function submit() {
    if (!value.trim()) return;
    const form = new FormData();
    form.set("content", value.trim());
    if (parentActivityId) form.set("parentActivityId", parentActivityId);
    startTransition(() => {
      onSubmit(form);
      setValue("");
    });
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("entityType", "PIPELINE_ITEM");
      form.set("entityId", pipelineItemId);
      form.set("category", "OUTRO");
      const res = await fetch("/api/documents", { method: "POST", body: form });
      const body = await res.json();
      if (res.ok) {
        setValue((v) => `${v}${v ? " " : ""}[${body.fileName}](/api/documents/${body.id})`);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <MentionTextarea
        id={`composer-${parentActivityId ?? "root"}`}
        name="content"
        rows={2}
        placeholder={placeholder}
        value={value}
        onChange={setValue}
        users={mentionUsers}
      />
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Anexar arquivo ou imagem"
          className="text-fg-muted hover:text-fg p-1.5 rounded-md hover:bg-surface-hover transition-colors disabled:opacity-60"
        >
          <Paperclip size={15} />
        </button>
        <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.pdf" className="hidden" onChange={handleFile} />
        <TaskMentionPicker candidates={taskCandidates} onPick={(c) => setValue((v) => `${v}${v ? " " : ""}[${c.name}](${c.href})`)} />

        <div className="flex-1" />
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-8 px-3 rounded-md border border-border text-[12px] text-fg-muted hover:text-fg transition-colors">
            Cancelar
          </button>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={isPending || uploading || !value.trim()}
          className="h-8 px-3 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Salvando…" : uploading ? "Enviando…" : submitLabel}
        </button>
      </div>
    </div>
  );
}

function CommentActions({
  canAct,
  canModify,
  onReply,
  onEdit,
  onDelete,
}: {
  canAct: boolean;
  canModify: boolean;
  onReply?: () => void;
  onEdit?: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-2 mt-1">
      {canAct && onReply && (
        <button type="button" onClick={onReply} className="text-[11px] text-fg-muted hover:text-fg transition-colors">Responder</button>
      )}
      {canModify && onEdit && (
        <button type="button" onClick={onEdit} className="text-[11px] text-fg-muted hover:text-fg transition-colors">Editar</button>
      )}
      {canModify && (
        <button type="button" onClick={onDelete} className="text-[11px] text-fg-muted hover:text-danger transition-colors">Excluir</button>
      )}
    </div>
  );
}

function Comment({
  item,
  canAct,
  mentionUsers,
  taskCandidates,
  pipelineItemId,
  addNoteAction,
  editAction,
  deleteAction,
}: {
  item: FeedItem;
  canAct: boolean;
  mentionUsers: MentionUser[];
  taskCandidates: TaskMentionCandidate[];
  pipelineItemId: string;
  addNoteAction: Props["addNoteAction"];
  editAction: Props["editAction"];
  deleteAction: Props["deleteAction"];
}) {
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [, startTransition] = useTransition();

  function confirmDelete(id: string) {
    if (confirm("Excluir este comentário? Esta ação não pode ser desfeita.")) {
      startTransition(() => deleteAction(id));
    }
  }

  return (
    <div className="flex gap-2.5 pb-3">
      <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 bg-surface-hover border border-border-strong text-[9px] font-medium text-fg-secondary">
        {item.userName.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[length:var(--fs-helper)] text-fg font-medium">{item.userName}</p>
          <span className="font-mono text-[11px] text-fg-muted whitespace-nowrap flex-shrink-0">
            {item.createdAtLabel}{item.edited && " · editado"}
          </span>
        </div>

        {editing ? (
          <div className="mt-1">
            <Composer
              mentionUsers={mentionUsers}
              taskCandidates={taskCandidates}
              pipelineItemId={pipelineItemId}
              placeholder="Editar comentário…"
              submitLabel="Salvar"
              defaultValue={item.content ?? ""}
              onSubmit={(form) => { editAction(item.id, form.get("content") as string); setEditing(false); }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <p className="text-[length:var(--fs-body)] text-fg-secondary mt-0.5 whitespace-pre-wrap">
            {item.content ? renderRichText(item.content, mentionUsers) : null}
          </p>
        )}

        {!editing && (
          <CommentActions
            canAct={canAct}
            canModify={item.canModify}
            onReply={() => setReplying((v) => !v)}
            onEdit={() => setEditing(true)}
            onDelete={() => confirmDelete(item.id)}
          />
        )}

        {item.replies.length > 0 && (
          <div className="mt-2 pl-3 border-l-2 border-border space-y-2">
            {item.replies.map((r) => (
              <div key={r.id} className="flex gap-2">
                <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 bg-surface-hover border border-border text-[8px] font-medium text-fg-secondary mt-0.5">
                  {r.userName.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] text-fg font-medium">{r.userName}</p>
                    <span className="font-mono text-[10px] text-fg-muted whitespace-nowrap flex-shrink-0">
                      {r.createdAtLabel}{r.edited && " · editado"}
                    </span>
                  </div>
                  <p className="text-[length:var(--fs-helper)] text-fg-secondary whitespace-pre-wrap">
                    {r.content ? renderRichText(r.content, mentionUsers) : null}
                  </p>
                  {r.canModify && (
                    <button type="button" onClick={() => confirmDelete(r.id)} className="text-[10px] text-fg-muted hover:text-danger transition-colors mt-0.5">Excluir</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {replying && (
          <div className="mt-2">
            <Composer
              mentionUsers={mentionUsers}
              taskCandidates={taskCandidates}
              pipelineItemId={pipelineItemId}
              parentActivityId={item.id}
              placeholder={`Responder a ${item.userName}…`}
              submitLabel="Responder"
              onSubmit={(form) => { addNoteAction(null, form); setReplying(false); }}
              onCancel={() => setReplying(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// Modo resumido: comentários + as 2 movimentações mais recentes. Modo
// detalhado: tudo. Comentários (NOTE) e eventos automáticos convivem no mesmo
// fluxo, visualmente distintos (comentário = avatar/caixa; evento = ponto).
function summarize(items: FeedItem[]): FeedItem[] {
  let eventCount = 0;
  return items.filter((item) => {
    if (item.isComment) return true;
    eventCount += 1;
    return eventCount <= 2;
  });
}

// Feed em ordem cronológica ascendente (mais antigo em cima, mais recente
// embaixo, perto do campo de digitação) — items chega em ordem desc (mais
// recente primeiro), por isso inverte aqui.
export function ActivityFeed({ items, canAct, mentionUsers, pipelineItemId, taskCandidates, addNoteAction, editAction, deleteAction }: Props) {
  const [detailed, setDetailed] = useState(false);
  const [search, setSearch] = useState("");

  const chronological = useMemo(() => [...items].reverse(), [items]);
  const bySummary = detailed ? chronological : summarize(chronological);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return bySummary;
    return bySummary.filter((a) => a.content?.toLowerCase().includes(q) || a.userName.toLowerCase().includes(q) || a.label.toLowerCase().includes(q));
  }, [bySummary, search]);
  const hiddenCount = chronological.length - bySummary.length;

  return (
    <div className="bg-surface border border-border rounded-lg p-5 flex flex-col h-full min-h-[400px]">
      <div className="flex items-center justify-between gap-2 mb-3 flex-shrink-0">
        <h2 className="text-[13px] font-semibold text-fg">Comentários e atividade</h2>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => setSearch((s) => (s === "" ? " " : ""))}
              title="Pesquisar"
              className="text-fg-muted hover:text-fg p-1 rounded-md hover:bg-surface-hover transition-colors"
            >
              <Search size={14} />
            </button>
          )}
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => setDetailed((v) => !v)}
              className="h-7 px-2.5 rounded-md border border-border text-[11px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors flex-shrink-0"
            >
              {detailed ? "Ocultar detalhes" : "Mostrar detalhes"}
            </button>
          )}
        </div>
      </div>

      {search !== "" && (
        <Input
          value={search.trim()}
          onChange={(e) => setSearch(e.target.value || " ")}
          placeholder="Pesquisar no chat desta tarefa…"
          autoFocus
          className="mb-3 flex-shrink-0"
        />
      )}

      <div className="scroll-y flex-1 overflow-y-auto min-h-0">
        {items.length === 0 ? (
          <p className="text-[length:var(--fs-helper)] text-fg-muted">Nenhuma atividade registrada ainda.</p>
        ) : (
          <>
            {!detailed && hiddenCount > 0 && (
              <p className="text-[11px] text-fg-muted pb-2">
                {hiddenCount} evento{hiddenCount > 1 ? "s" : ""} oculto{hiddenCount > 1 ? "s" : ""} acima
              </p>
            )}
            {visible.map((a, i) =>
              a.isComment ? (
                <Comment
                  key={a.id}
                  item={a}
                  canAct={canAct}
                  mentionUsers={mentionUsers}
                  taskCandidates={taskCandidates}
                  pipelineItemId={pipelineItemId}
                  addNoteAction={addNoteAction}
                  editAction={editAction}
                  deleteAction={deleteAction}
                />
              ) : (
                <div key={a.id} className="flex gap-2.5 relative pb-3">
                  {i < visible.length - 1 && <span className="absolute left-[9px] top-[20px] bottom-0 w-px bg-border" />}
                  <span
                    className={`w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0 z-[1] border ${
                      a.importante ? "bg-brand-subtle border-brand" : "bg-surface-hover border-border-strong"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${a.importante ? "bg-brand" : "bg-fg-muted"}`} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[length:var(--fs-body)] text-fg font-medium leading-snug">{a.label}</p>
                      <span className="font-mono text-[11px] text-fg-muted whitespace-nowrap flex-shrink-0">{a.createdAtLabel}</span>
                    </div>
                    <p className="text-[length:var(--fs-helper)] text-fg-muted">{a.userName}</p>
                    {a.content && <p className="text-[length:var(--fs-body)] text-fg-secondary mt-1">{renderRichText(a.content, mentionUsers)}</p>}
                  </div>
                </div>
              )
            )}
          </>
        )}
      </div>

      {canAct && (
        <div className="mt-3 pt-3 border-t border-border flex-shrink-0">
          <Composer
            mentionUsers={mentionUsers}
            taskCandidates={taskCandidates}
            pipelineItemId={pipelineItemId}
            placeholder="Escrever um comentário… use @ para mencionar"
            submitLabel="Comentar"
            onSubmit={(form) => addNoteAction(null, form)}
          />
        </div>
      )}
    </div>
  );
}
