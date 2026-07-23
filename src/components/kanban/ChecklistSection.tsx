"use client";

import { useState, useTransition } from "react";
import { Check, CheckSquare, ChevronDown, ChevronUp, Pencil, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/Input";

export type ChecklistItemData = { id: string; text: string; done: boolean };

type Props = {
  canAct: boolean;
  items: ChecklistItemData[];
  createAction: (text: string) => Promise<void>;
  toggleAction: (id: string, done: boolean) => Promise<void>;
  editAction: (id: string, text: string) => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
  reorderAction: (id: string, direction: "up" | "down") => Promise<void>;
};

function ChecklistRow({
  item, index, total, canAct, toggleAction, editAction, deleteAction, reorderAction,
}: {
  item: ChecklistItemData;
  index: number;
  total: number;
  canAct: boolean;
  toggleAction: Props["toggleAction"];
  editAction: Props["editAction"];
  deleteAction: Props["deleteAction"];
  reorderAction: Props["reorderAction"];
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(item.text);
  const [, startTransition] = useTransition();

  function saveEdit() {
    if (!value.trim()) return;
    startTransition(() => editAction(item.id, value));
    setEditing(false);
  }

  return (
    <div className="flex items-center gap-2 py-1.5 group">
      <button
        type="button"
        disabled={!canAct}
        onClick={() => startTransition(() => toggleAction(item.id, !item.done))}
        aria-label={item.done ? "Desmarcar" : "Concluir"}
        className={`w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center flex-shrink-0 transition-colors ${
          item.done ? "bg-brand border-brand text-on-brand" : "border-border-strong hover:border-brand"
        }`}
      >
        {item.done && <Check size={12} />}
      </button>

      {editing ? (
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveEdit();
              if (e.key === "Escape") setEditing(false);
            }}
            autoFocus
          />
          <button type="button" onClick={saveEdit} className="text-fg-muted hover:text-brand flex-shrink-0"><Check size={14} /></button>
          <button type="button" onClick={() => setEditing(false)} className="text-fg-muted hover:text-danger flex-shrink-0"><X size={14} /></button>
        </div>
      ) : (
        <span className={`text-[13px] flex-1 min-w-0 truncate ${item.done ? "text-fg-muted line-through" : "text-fg"}`}>
          {item.text}
        </span>
      )}

      {canAct && !editing && (
        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <button type="button" disabled={index === 0} onClick={() => startTransition(() => reorderAction(item.id, "up"))} className="text-fg-muted hover:text-fg disabled:opacity-30 p-1"><ChevronUp size={13} /></button>
          <button type="button" disabled={index === total - 1} onClick={() => startTransition(() => reorderAction(item.id, "down"))} className="text-fg-muted hover:text-fg disabled:opacity-30 p-1"><ChevronDown size={13} /></button>
          <button type="button" onClick={() => setEditing(true)} className="text-fg-muted hover:text-fg p-1"><Pencil size={13} /></button>
          <button type="button" onClick={() => startTransition(() => deleteAction(item.id))} className="text-fg-muted hover:text-danger p-1"><Trash2 size={13} /></button>
        </div>
      )}
    </div>
  );
}

export function ChecklistSection({ canAct, items, createAction, toggleAction, editAction, deleteAction, reorderAction }: Props) {
  const [newText, setNewText] = useState("");
  const [open, setOpen] = useState(items.length > 0);
  const [, startTransition] = useTransition();

  const done = items.filter((i) => i.done).length;
  const pct = items.length > 0 ? Math.round((done / items.length) * 100) : 0;

  function addItem() {
    const text = newText.trim();
    if (!text) return;
    startTransition(() => createAction(text));
    setNewText("");
  }

  if (items.length === 0 && !open) {
    if (!canAct) return null;
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors"
      >
        <CheckSquare size={13} /> Criar checklist
      </button>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-semibold text-fg">Checklist</h2>
        {items.length > 0 ? (
          <span className="text-[11px] text-fg-muted tnum">{done}/{items.length} · {pct}%</span>
        ) : (
          <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="text-fg-muted hover:text-fg p-0.5">
            <X size={14} />
          </button>
        )}
      </div>

      {items.length > 0 && (
        <div className="h-1.5 rounded-full bg-surface-hover overflow-hidden mb-3">
          <div className="h-full bg-brand transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      )}

      <div className="divide-y divide-border">
        {items.map((item, i) => (
          <ChecklistRow
            key={item.id}
            item={item}
            index={i}
            total={items.length}
            canAct={canAct}
            toggleAction={toggleAction}
            editAction={editAction}
            deleteAction={deleteAction}
            reorderAction={reorderAction}
          />
        ))}
      </div>

      {canAct && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
          <Input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
            placeholder="Adicionar item ao checklist…"
          />
          <button
            type="button"
            onClick={addItem}
            className="h-9 px-3 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors flex-shrink-0"
          >
            Adicionar
          </button>
        </div>
      )}
    </div>
  );
}
