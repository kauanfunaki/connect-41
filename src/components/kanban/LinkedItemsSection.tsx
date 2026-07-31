"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { getRecentLinkedIds, pushRecentLinkedId } from "@/lib/kanbanRecentLinks";

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
// Cartão e cabeçalho vêm do DetailSection que envolve esta seção.
export function LinkedItemsSection({ canAct, basePath, links, candidates, createAction, deleteAction }: Props) {
  const [query, setQuery] = useState("");
  const [picking, setPicking] = useState(false);
  const [, startTransition] = useTransition();

  const available = candidates.filter((c) => !links.some((l) => l.id === c.id));
  const matches = query.trim()
    ? available.filter((c) => c.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : getRecentLinkedIds()
        .map((recentId) => available.find((c) => c.id === recentId))
        .filter((c): c is LinkCandidate => c != null)
        .slice(0, 8);
  const showingRecents = !query.trim() && matches.length > 0;

  return (
    <div>
      {links.length === 0 && (
        <p className="text-[12px] text-fg-muted italic mb-2">Nenhuma tarefa vinculada.</p>
      )}

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
                  aria-label="Desvincular tarefa"
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
              <Input compact value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar tarefa…" autoFocus />
              <button type="button" onClick={() => { setPicking(false); setQuery(""); }} aria-label="Cancelar busca" className="text-fg-muted hover:text-fg p-1.5 flex-shrink-0">
                <X size={14} />
              </button>
            </div>
            {matches.length > 0 && (
              <div className="mt-1 bg-surface-elevated border border-border-strong rounded-lg shadow-[var(--c41-shadow-lg)] max-h-48 overflow-y-auto">
                {showingRecents && (
                  <p className="px-3 pt-2 pb-1 text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">Recentes</p>
                )}
                {matches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      pushRecentLinkedId(c.id);
                      startTransition(() => createAction(c.id));
                      setQuery("");
                      setPicking(false);
                    }}
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
