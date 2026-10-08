"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Link2Off, Building2, User, X } from "lucide-react";
import { vincularContatoChatwoot, desvincularContatoChatwoot } from "@/app/(app)/conversas/actions";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { Popover, ItemDoMenu } from "@/components/ui/Popover";

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

type Alvo = { personId?: string; companyId?: string };

// Vincular/desvincular um contato do Chatwoot a uma Pessoa/Empresa do Connect.
// Busca via /api/search (mesmo endpoint da busca global) — só empresas,
// colaboradores e candidatos interessam aqui.
//
// O painel da busca era montado à mão (até 07/10/2026): `absolute` com
// `shadow-lg`, sem fechar com Esc nem com clique fora, e o gatilho sem
// `aria-expanded`. Agora é o `Popover` do "⋯" do funil, e o "Desvincular" é um
// `IconButton` com área de toque (auditoria DRG-24).
export function VincularContato({ contactLinkId, linkedLabel, canManage }: Props) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLink(target: Alvo, fechar: () => void) {
    setIsSaving(true);
    setError(null);
    const result = await vincularContatoChatwoot(contactLinkId, target);
    if (!result.ok) setError(result.error);
    else {
      fechar();
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
    return linkedLabel ? <span className="text-[length:var(--fs-micro)] text-fg-muted">Vinculado a {linkedLabel}</span> : null;
  }

  if (linkedLabel) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="text-[length:var(--fs-micro)] text-success-fg inline-flex items-center gap-1">
          <Link2 size={12} /> {linkedLabel}
        </span>
        <IconButton
          size="sm"
          onClick={handleUnlink}
          disabled={isSaving}
          title="Desvincular"
          aria-label={`Desvincular de ${linkedLabel}`}
          className="hover:text-danger"
        >
          <Link2Off size={13} />
        </IconButton>
        {error && <span className="text-[length:var(--fs-micro)] text-danger">{error}</span>}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Popover
        align="right"
        width={288}
        aria-label="Vincular a pessoa ou empresa"
        trigger={({ open, toggle }) => (
          <Button variant="secondary" size="xs" onClick={toggle} aria-expanded={open} aria-haspopup="dialog">
            <Link2 size={12} /> Vincular
          </Button>
        )}
      >
        {({ close }) => <BuscaDoVinculo salvando={isSaving} onEscolher={(alvo) => handleLink(alvo, close)} onFechar={close} />}
      </Popover>
      {error && <span className="text-[length:var(--fs-micro)] text-danger">{error}</span>}
    </span>
  );
}

/**
 * A busca de dentro do painel. O painel só existe aberto, então a busca nasce
 * vazia a cada abertura — era o `setQuery("")` que o fechar fazia à mão.
 */
function BuscaDoVinculo({
  salvando,
  onEscolher,
  onFechar,
}: {
  salvando: boolean;
  onEscolher: (alvo: Alvo) => void;
  onFechar: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);

  useEffect(() => {
    const termo = query.trim();
    const espera = setTimeout(async () => {
      if (termo.length < 2) {
        setResults(null);
        return;
      }
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(termo)}`);
        if (res.ok) setResults((await res.json()) as SearchResult);
      } catch {
        // busca é best-effort; erro de rede só deixa a lista vazia
      }
    }, 300);
    return () => clearTimeout(espera);
  }, [query]);

  const pessoas = [...(results?.people ?? []), ...(results?.candidatos ?? [])];

  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[length:var(--fs-2)] font-medium text-fg">Vincular a pessoa ou empresa</span>
        <IconButton size="sm" onClick={onFechar} aria-label="Fechar">
          <X size={14} />
        </IconButton>
      </div>
      <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nome (mín. 2 letras)…" />
      <div className="mt-2 max-h-56 overflow-y-auto space-y-0.5">
        {results?.companies.map((c) => (
          <ItemDoMenu key={c.id} icone={<Building2 />} disabled={salvando} onClick={() => onEscolher({ companyId: c.id })}>
            <span className="min-w-0 truncate">{c.name}</span>
          </ItemDoMenu>
        ))}
        {pessoas.map((p) => (
          <ItemDoMenu key={p.id} icone={<User />} disabled={salvando} onClick={() => onEscolher({ personId: p.id })}>
            <span className="min-w-0 truncate">{p.name}</span>
          </ItemDoMenu>
        ))}
        {query.trim().length >= 2 && results && results.companies.length === 0 && pessoas.length === 0 && (
          <p className="text-[length:var(--fs-2)] text-fg-muted px-2 py-2">Nenhum resultado.</p>
        )}
      </div>
    </>
  );
}
