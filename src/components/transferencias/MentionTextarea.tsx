"use client";

import { useRef, useState } from "react";
import { Textarea } from "@/components/ui/Textarea";

export type MentionUser = { id: string; name: string };

type Props = {
  id: string;
  name: string;
  rows?: number;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  users: MentionUser[];
};

// Textarea com autocomplete de "@nome" — não é um editor rich text, o texto
// final continua sendo puro (mesmo campo `description: String? @db.Text` de
// sempre). A "referência" de verdade acontece no servidor: criarHandoff
// varre o texto salvo por "@Nome Completo" e notifica quem foi mencionado
// (ver extractMentionedUserIds em src/lib/handoffMentions.ts) — por isso é
// importante que o nome inserido pelo autocomplete bata exatamente com o
// nome cadastrado do usuário.
export function MentionTextarea({ id, name, rows = 16, placeholder, value, onChange, users }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [triggerIndex, setTriggerIndex] = useState<number | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  const matches = open
    ? users.filter((u) => u.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];

  function detectTrigger(text: string, cursor: number) {
    // Procura o último "@" antes do cursor que não esteja colado a uma letra
    // (evita disparar no meio de um e-mail, por exemplo).
    const uptoCursor = text.slice(0, cursor);
    const at = uptoCursor.lastIndexOf("@");
    if (at === -1) {
      setOpen(false);
      return;
    }
    const before = uptoCursor[at - 1];
    if (before && /\S/.test(before)) {
      setOpen(false);
      return;
    }
    const afterAt = uptoCursor.slice(at + 1);
    if (/\s/.test(afterAt) || afterAt.length > 40) {
      setOpen(false);
      return;
    }
    setQuery(afterAt);
    setTriggerIndex(at);
    setHighlighted(0);
    setOpen(true);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value);
    detectTrigger(e.target.value, e.target.selectionStart ?? e.target.value.length);
  }

  function selectUser(user: MentionUser) {
    if (triggerIndex === null || !textareaRef.current) return;
    const cursor = textareaRef.current.selectionStart ?? value.length;
    const before = value.slice(0, triggerIndex);
    const after = value.slice(cursor);
    const inserted = `@${user.name} `;
    const next = `${before}${inserted}${after}`;
    onChange(next);
    setOpen(false);
    setTriggerIndex(null);

    // Reposiciona o cursor depois do nome inserido, na próxima tick (depois
    // do React re-renderizar o value controlado).
    const newCursor = before.length + inserted.length;
    requestAnimationFrame(() => {
      textareaRef.current?.setSelectionRange(newCursor, newCursor);
      textareaRef.current?.focus();
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => (h - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      selectUser(matches[highlighted]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        id={id}
        name={name}
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Delay pra permitir o onMouseDown do item da lista disparar antes do blur fechar o popup.
          setTimeout(() => setOpen(false), 150);
        }}
      />
      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-surface border border-border-strong rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {matches.map((user, i) => (
            <button
              key={user.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                selectUser(user);
              }}
              className={`w-full text-left px-3 py-1.5 text-[13px] ${i === highlighted ? "bg-surface-hover text-fg" : "text-fg-muted hover:bg-surface-hover"}`}
            >
              {user.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
