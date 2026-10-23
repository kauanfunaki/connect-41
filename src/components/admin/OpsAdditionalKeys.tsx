"use client";
import { useState } from "react";
import { Copy, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useConfirm } from "@/components/ui/useConfirm";
import type { ChaveOps } from "@/lib/ops/chaves";

export function OpsAdditionalKeys({ initialKeys }: { initialKeys: ChaveOps[] }) {
  const [keys, setKeys] = useState(initialKeys), [name, setName] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [generated, setGenerated] = useState<{ name: string; token: string } | null>(null);
  const { dialog, requestConfirm } = useConfirm();
  async function execute(key?: ChaveOps, revoke = false) {
    setBusy(true); setError(""); setGenerated(null);
    try {
      const response = await fetch(key ? `/api/ops/credentials/${encodeURIComponent(key.id)}` : "/api/ops/credentials", {
        method: revoke ? "DELETE" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(key ? { version: key.version } : { name }), signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível atualizar a chave.");
      setKeys(current => key ? current.map(k => k.id === key.id ? { ...k, version: result.version, hasToken: result.hasToken } : k) : [...current, { id: result.id, name: result.name, version: result.version, hasToken: true }]);
      if (result.token) setGenerated({ name: key?.name ?? result.name, token: result.token });
      if (!key) setName("");
    } catch (e) { setError((e instanceof Error ? e.message : "Falha na operação.") + " Atualize a página para conferir o estado antes de tentar novamente."); }
    finally { setBusy(false); }
  }
  function alter(key: ChaveOps, revoke: boolean) {
    requestConfirm({ title: `${revoke ? "Revogar" : "Trocar"} a chave ${key.name}?`, description: "Somente os bots que usam esta chave serão afetados. As demais chaves continuam válidas.", confirmLabel: revoke ? "Revogar chave" : "Trocar chave", destructive: true }, () => execute(key, revoke));
  }
  return <section className="space-y-3 border-t border-border pt-4" aria-label="Chaves adicionais">
    <h3 className="font-semibold text-fg">Chaves adicionais</h3>
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 flex-1"><label htmlFor="ops-key-name" className="block text-helper mb-1">Nome da chave</label><Input id="ops-key-name" value={name} maxLength={120} onChange={e => setName(e.target.value)} placeholder="Ex.: Central do servidor" /></div>
      <Button type="button" disabled={busy || !name.trim()} onClick={() => void execute()}><Plus size={14} /> Adicionar chave</Button>
    </div>
    {!keys.length && <p className="text-helper text-fg-muted">Nenhuma chave adicional.</p>}
    <ul className="divide-y divide-border">{keys.map(key => <li key={key.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
      <span className="min-w-0 break-words text-ui">{key.name} <span className="text-helper text-fg-muted">· {key.hasToken ? "Ativa" : "Revogada"}</span></span>
      <div className="flex gap-2"><Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => key.hasToken ? alter(key, false) : void execute(key)}> {key.hasToken ? "Trocar" : "Gerar nova chave"}</Button>{key.hasToken && <Button type="button" size="sm" variant="danger" disabled={busy} onClick={() => alter(key, true)}>Revogar</Button>}</div>
    </li>)}</ul>
    {generated && <div className="space-y-2"><label htmlFor="ops-extra-token" className="block text-helper font-semibold">{generated.name} — copie agora; esta chave aparece uma única vez</label><div className="flex gap-2"><Input id="ops-extra-token" value={generated.token} readOnly className="min-w-0 font-mono" onFocus={e => e.target.select()} /><Button type="button" variant="secondary" onClick={() => void navigator.clipboard.writeText(generated.token).catch(() => setError("Selecione e copie a chave manualmente."))}><Copy size={14} /> Copiar</Button></div></div>}
    {error && <p role="alert" className="text-ui text-danger">{error}</p>}{dialog}
  </section>;
}
