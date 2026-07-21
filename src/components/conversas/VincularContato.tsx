"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Link2Off, Building2, User, X } from "lucide-react";
import { vincularContatoChatwoot, desvincularContatoChatwoot } from "@/app/(app)/conversas/actions";
import { Input } from "@/components/ui/Input";

type SearchResult = {
  companies: { id: string; name: string }[];
  people: { id: string; name: string }[];
  candidatos: { id: string; name: string }[];
};

type Props = {
  contactLinkId: string;
  linkedLabel: string | null; // nome da pessoa/empresa vinculada, null se não vinculado
  canManage: boolean;
};

// Vincular/desvincular um contato do Chatwoot a uma Pessoa/Empresa do Connect.
// Busca via /api/search (mesmo endpoint da busca global) — só empresas,
// colaboradores e candidatos interessam aqui.
export function VincularContato({ contactLinkId, linkedLabel, canManage }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      if (!open || query.trim().length < 2) {
        setResults(null);
        return;
      }
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) setResults((await res.json()) as SearchResult);
      } catch {
        // busca é best-effort; erro de rede só deixa a lista vazia
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, query]);

  async function handleLink(target: { personId?: string; companyId?: string }) {
    setIsSaving(true);
    setError(null);
    const result = await vincularContatoChatwoot(contactLinkId, target);
    if (!result.ok) setError(result.error);
    else {
      setOpen(false);
      setQuery("");
      router.refresh();
    }
    setIsSaving(false);
  }

  async function handleUnlink() {
    setIsSaving(true);
    setError(null);
    const result = await desvincularContatoChatwoot(contactLinkId);
    if (!result.ok) setError(result.error);
    else router.refresh();
    setIsSaving(false);
  }

  if (!canManage) {
    return linkedLabel ? <span className="text-[11.5px] text-fg-muted">Vinculado a {linkedLabel}</span> : null;
  }

  if (linkedLabel) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-[11.5px] text-success inline-flex items-center gap-1">
          <Link2 size={12} /> {linkedLabel}
        </span>
        <button
          type="button"
          onClick={handleUnlink}
          disabled={isSaving}
          title="Desvincular"
          className="text-fg-muted hover:text-danger disabled:opacity-60 transition-colors"
        >
          <Link2Off size={13} />
        </button>
        {error && <span className="text-[11px] text-danger">{error}</span>}
      </span>
    );
  }

  return (
    <span className="relative inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-border-strong text-[11.5px] font-medium text-fg hover:bg-surface-hover transition-colors"
      >
        <Link2 size={12} /> Vincular
      </button>
      {error && <span className="text-[11px] text-danger">{error}</span>}

      {open && (
        <div className="absolute right-0 top-9 z-20 w-72 bg-surface border border-border-strong rounded-lg shadow-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-medium text-fg">Vincular a pessoa ou empresa</span>
            <button type="button" onClick={() => setOpen(false)} className="text-fg-muted hover:text-fg">
              <X size={14} />
            </button>
          </div>
          <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome (mín. 2 letras)…" />
          <div className="mt-2 max-h-56 overflow-y-auto space-y-0.5">
            {results?.companies.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={isSaving}
                onClick={() => handleLink({ companyId: c.id })}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[12.5px] text-fg hover:bg-surface-hover disabled:opacity-60 transition-colors"
              >
                <Building2 size={13} className="text-fg-muted flex-shrink-0" /> <span className="truncate">{c.name}</span>
              </button>
            ))}
            {[...(results?.people ?? []), ...(results?.candidatos ?? [])].map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={isSaving}
                onClick={() => handleLink({ personId: p.id })}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-[12.5px] text-fg hover:bg-surface-hover disabled:opacity-60 transition-colors"
              >
                <User size={13} className="text-fg-muted flex-shrink-0" /> <span className="truncate">{p.name}</span>
              </button>
            ))}
            {query.trim().length >= 2 && results && results.companies.length === 0 && results.people.length === 0 && results.candidatos.length === 0 && (
              <p className="text-[12px] text-fg-muted px-2 py-2">Nenhum resultado.</p>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
