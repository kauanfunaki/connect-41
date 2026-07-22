"use client";

import { useState, useTransition, Fragment } from "react";
import { MentionTextarea, type MentionUser } from "@/components/transferencias/MentionTextarea";
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

type Props = {
  items: FeedItem[];
  canAct: boolean;
  mentionUsers: MentionUser[];
  addNoteAction: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
  editAction: (activityId: string, content: string) => Promise<void>;
  deleteAction: (activityId: string) => Promise<void>;
};

// Realça "@Nome Completo" dentro do texto do comentário, casando contra os
// nomes reais do tenant (mais longos primeiro pra "@Ana Paula" não perder pra "@Ana").
function renderWithMentions(text: string, users: MentionUser[]): React.ReactNode {
  if (!text.includes("@") || users.length === 0) return text;
  const names = [...users].map((u) => u.name).sort((a, b) => b.length - a.length);
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  outer: while (remaining.length > 0) {
    for (const name of names) {
      const token = `@${name}`;
      const idx = remaining.indexOf(token);
      if (idx === 0) {
        parts.push(<span key={key++} className="text-brand font-medium">{token}</span>);
        remaining = remaining.slice(token.length);
        continue outer;
      }
    }
    // Nenhuma menção começa aqui — avança até o próximo "@" (ou fim).
    const nextAt = remaining.indexOf("@", 1);
    const cut = nextAt === -1 ? remaining.length : nextAt;
    parts.push(<Fragment key={key++}>{remaining.slice(0, cut)}</Fragment>);
    remaining = remaining.slice(cut);
  }
  return parts;
}

function Composer({
  mentionUsers,
  parentActivityId,
  placeholder,
  submitLabel,
  defaultValue = "",
  onSubmit,
  onCancel,
}: {
  mentionUsers: MentionUser[];
  parentActivityId?: string;
  placeholder: string;
  submitLabel: string;
  defaultValue?: string;
  onSubmit: (form: FormData) => void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [isPending, startTransition] = useTransition();

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
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={isPending || !value.trim()}
          className="h-8 px-3 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Salvando…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-8 px-3 rounded-md border border-border text-[12px] text-fg-muted hover:text-fg transition-colors">
            Cancelar
          </button>
        )}
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
  addNoteAction,
  editAction,
  deleteAction,
}: {
  item: FeedItem;
  canAct: boolean;
  mentionUsers: MentionUser[];
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
              placeholder="Editar comentário…"
              submitLabel="Salvar"
              defaultValue={item.content ?? ""}
              onSubmit={(form) => { editAction(item.id, form.get("content") as string); setEditing(false); }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <p className="text-[length:var(--fs-body)] text-fg-secondary mt-0.5 whitespace-pre-wrap">
            {item.content ? renderWithMentions(item.content, mentionUsers) : null}
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
                    {r.content ? renderWithMentions(r.content, mentionUsers) : null}
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

export function ActivityFeed({ items, canAct, mentionUsers, addNoteAction, editAction, deleteAction }: Props) {
  const [detailed, setDetailed] = useState(false);

  const visible = detailed ? items : summarize(items);
  const hiddenCount = items.length - visible.length;

  return (
    <div className="bg-surface border border-border rounded-lg p-5 lg:sticky lg:top-6 self-start">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-[13px] font-semibold text-fg">Comentários e atividade</h2>
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

      {canAct && (
        <div className="mb-4">
          <Composer
            mentionUsers={mentionUsers}
            placeholder="Escrever um comentário… use @ para mencionar"
            submitLabel="Comentar"
            onSubmit={(form) => addNoteAction(null, form)}
          />
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-[length:var(--fs-helper)] text-fg-muted">Nenhuma atividade registrada ainda.</p>
      ) : (
        <div className="scroll-y max-h-[420px] overflow-y-auto">
          {visible.map((a, i) =>
            a.isComment ? (
              <Comment
                key={a.id}
                item={a}
                canAct={canAct}
                mentionUsers={mentionUsers}
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
                  {a.content && <p className="text-[length:var(--fs-body)] text-fg-secondary mt-1">{a.content}</p>}
                </div>
              </div>
            )
          )}

          {!detailed && hiddenCount > 0 && (
            <p className="text-[11px] text-fg-muted pt-1">
              + {hiddenCount} evento{hiddenCount > 1 ? "s" : ""} oculto{hiddenCount > 1 ? "s" : ""}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
