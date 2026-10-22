"use client";

import { useState } from "react";
import { Copy, KeyRound, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { formatInstantDateTime } from "@/lib/format";
import type { ChaveOpsNaTela, CredencialOpsNaTela } from "@/lib/ops/credencial";

export function OpsCredentialForm({ keys: iniciais, version: versaoInicial }: { keys: ChaveOpsNaTela[]; version: number }) {
  const toast = useToast();
  const { dialog, requestConfirm } = useConfirm();
  const [keys, setKeys] = useState(iniciais), [version, setVersion] = useState(versaoInicial);
  const [tokens, setTokens] = useState<Record<string, string>>({}), [name, setName] = useState("");
  const [ocupado, setOcupado] = useState(false), [erro, setErro] = useState("");

  async function atualizar() {
    const response = await fetch("/api/ops/credential", { cache: "no-store", signal: AbortSignal.timeout(15000) });
    const result = await response.json() as CredencialOpsNaTela & { error?: string };
    if (!response.ok || result.status !== "ready") throw new Error(result.error || ("message" in result ? result.message : "Não foi possível consultar as chaves."));
    setKeys(result.keys); setVersion(result.version);
    setTokens(old => Object.fromEntries(Object.entries(old).filter(([id]) => result.keys.some(key => key.id === id))));
  }

  async function executar(method: "POST" | "DELETE", id?: string) {
    setOcupado(true); setErro("");
    try {
      const response = await fetch("/api/ops/credential", { method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(method === "POST" ? { name } : { id, version }), signal: AbortSignal.timeout(15000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível atualizar as chaves.");
      if (method === "POST") {
        const key = result.key as ChaveOpsNaTela;
        setKeys(old => [key, ...old]); setTokens(old => ({ ...old, [key.id]: result.token })); setName("");
        toast.success("Nova chave gerada.");
      } else {
        setKeys(old => old.filter(key => key.id !== id));
        setTokens(old => Object.fromEntries(Object.entries(old).filter(([keyId]) => keyId !== id)));
        toast.success("Chave revogada.");
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível atualizar as chaves.");
      await atualizar().catch(() => {});
    } finally { setOcupado(false); }
  }

  async function copiar(token: string) {
    try { await navigator.clipboard.writeText(token); toast.success("Chave copiada."); }
    catch { toast.error("Não foi possível copiar. Selecione e copie a chave manualmente."); }
  }

  return <div className="space-y-4">
    <p className="text-fs-3 text-fg-secondary">Você pode manter várias chaves ativas, por exemplo uma por servidor ou equipe. Cada chave pode atender vários bots deste escritório; cada bot informa seu próprio identificador (slug).</p>
    <form className="space-y-3 rounded-lg border border-border p-4" onSubmit={event => { event.preventDefault(); void executar("POST"); }}>
      <label className="block space-y-1 text-helper text-fg-secondary"><span>Nome da chave</span><Input required maxLength={120} value={name} disabled={ocupado} placeholder="Ex.: Servidor principal" onChange={event => setName(event.target.value)} /></label>
      <p className="text-helper text-fg-muted">Gerar uma nova chave mantém as anteriores ativas. A chave completa aparece nesta tela após a geração e não poderá ser consultada ao reabrir a página.</p>
      <Button type="submit" disabled={ocupado}><KeyRound size={14} /> Gerar chave</Button>
    </form>
    {erro && <p role="alert" className="text-ui text-danger">{erro}</p>}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p role="status" className="text-helper text-fg-secondary">{keys.length ? `${keys.length} ${keys.length === 1 ? "chave ativa" : "chaves ativas"}` : "Nenhuma chave compartilhada ativa."}</p>
      <Button type="button" variant="secondary" size="sm" disabled={ocupado} onClick={async () => {
        setOcupado(true); setErro(""); try { await atualizar(); } catch (err) { setErro(err instanceof Error ? err.message : "Não foi possível consultar as chaves."); } finally { setOcupado(false); }
      }}><RefreshCw size={14} /> Atualizar chaves</Button>
    </div>
    <div className="max-h-[32rem] space-y-3 overflow-y-auto">
      {keys.map(key => <div key={key.id} className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0"><p className="break-words font-medium text-fg">{key.name}</p><p className="text-fs-1 text-fg-muted">Criada em {formatInstantDateTime(new Date(key.createdAt))}{key.legacy ? " · já usada pelos bots antes desta atualização" : ""}</p></div>
          <Button type="button" variant="danger" size="sm" disabled={ocupado} aria-label={`Revogar chave ${key.name}`} onClick={() => requestConfirm({ title: `Revogar ${key.name}?`, description: "Os bots que usam esta chave precisarão receber outra chave ativa. O histórico será preservado.", confirmLabel: "Revogar chave", destructive: true }, () => executar("DELETE", key.id))}><XCircle size={14} /> Revogar</Button>
        </div>
        {tokens[key.id] && <div className="space-y-2"><label htmlFor={`ops-token-${key.id}`} className="block text-helper font-semibold text-fg-secondary">Chave de {key.name} — copie agora</label><div className="flex min-w-0 gap-2"><Input id={`ops-token-${key.id}`} readOnly value={tokens[key.id]} onFocus={event => event.target.select()} className="min-w-0 flex-1 font-mono text-helper" /><Button type="button" variant="secondary" aria-label={`Copiar chave ${key.name}`} onClick={() => void copiar(tokens[key.id])}><Copy size={14} /> Copiar</Button></div></div>}
      </div>)}
    </div>
    <p className="break-all rounded-md bg-surface-2 p-3 font-mono text-helper text-fg-secondary">Authorization: Bearer &lt;chave&gt;<br />POST /api/ops/events<br />POST /api/ops/watchers/&lt;slug&gt;/heartbeat</p>
    <p className="text-helper text-fg-muted">O Connect guarda somente os hashes das chaves. Guarde a chave completa na configuração protegida dos bots autorizados. As chaves individuais antigas também continuam válidas.</p>
    {dialog}
  </div>;
}
