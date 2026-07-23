"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Link2, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/Input";

export type LinkedItem = { id: string; name: string };
export type LinkCandidate = { id: string; name: string };

type Props = {
  canAct: boolean;
  basePath: string;
  links: LinkedItem[];
  candidates: LinkCandidate[]; // outras tarefas do mesmo kanban, pra buscar/vincular
  createAction: (linkedItemId: string) => Promise<void>;
  deleteAction: (linkedItemId: string) => Promise<void>;
};

// "Vincular itens ou adicionar dependências" — só registra a relação entre
// duas tarefas (sem bloquear nada automaticamente).
export function LinkedItemsSection({ canAct, basePath, links, candidates, createAction, deleteAction }: Props) {
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);
  const [open, setOpen] = useState(links.length > 0);
  const [, startTransition] = useTransition();

  if (!open && links.length === 0) {
    if (!canAct) return null;
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors"
      >
        <Link2 size={13} /> Vincular itens ou adicionar dependências
      </button>
    );
  }

  const matches = query.trim()
    ? candidates.filter((c) => c.name.toLowerCase().includes(query.toLowerCase()) && !links.some((l) => l.id === c.id)).slice(0, 8)
    : [];

  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <h2 className="text-[13px] font-semibold text-fg mb-3">Itens vinculados</h2>

      {links.length > 0 && (
        <div className="divide-y divide-border mb-3">
          {links.map((l) => (
            <div key={l.id} className="flex items-center justify-between gap-2 py-1.5 group">
              <Link href={`${basePath}/itens/${l.id}`} className="text-[13px] text-fg hover:text-brand transition-colors truncate">
                {l.name}
              </Link>
              {canAct && (
                <button
                  type="button"
                  onClick={() => startTransition(() => deleteAction(l.id))}
                  className="text-fg-muted hover:text-danger p-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {canAct && (
        picking ? (
          <div className="relative">
            <div className="flex items-center gap-2">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tarefa…" autoFocus />
              <button type="button" onClick={() => { setPicking(false); setQuery(""); }} className="text-fg-muted hover:text-fg p-1.5 flex-shrink-0">
                <X size={14} />
              </button>
            </div>
            {matches.length > 0 && (
              <div className="mt-1 bg-surface-elevated border border-border-strong rounded-lg shadow-[var(--c41-shadow-lg)] max-h-48 overflow-y-auto">
                {matches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { startTransition(() => createAction(c.id)); setQuery(""); setPicking(false); }}
                    className="w-full text-left px-3 py-2 text-[13px] text-fg-secondary hover:bg-surface-hover hover:text-fg transition-colors truncate"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="text-[12px] text-fg-muted hover:text-fg transition-colors"
          >
            + Vincular tarefa
          </button>
        )
      )}
    </div>
  );
}
