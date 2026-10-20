"use client";

import { useState } from "react";
import { Copy, KeyRound, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";

export function OpsCredentialForm({ hasToken: inicial, version: versaoInicial }: { hasToken: boolean; version: number }) {
  const toast = useToast();
  const { dialog, requestConfirm } = useConfirm();
  const [hasToken, setHasToken] = useState(inicial), [version, setVersion] = useState(versaoInicial);
  const [token, setToken] = useState(""), [ocupado, setOcupado] = useState(false), [erro, setErro] = useState("");

  async function executar(method: "POST" | "DELETE") {
    setOcupado(true); setErro("");
    try {
      const response = await fetch("/api/ops/credential", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível atualizar a chave.");
      setVersion(result.version); setHasToken(result.hasToken); setToken(result.token ?? "");
      toast.success(method === "DELETE" ? "Chave compartilhada revogada." : "Chave compartilhada gerada.");
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível atualizar a chave.");
    } finally { setOcupado(false); }
  }

  function alterar(method: "POST" | "DELETE") {
    if (method === "POST" && hasToken) {
      requestConfirm({ title: "Trocar a chave compartilhada?", description: "A chave atual será revogada. Os bots só voltarão a enviar dados depois que você atualizar a configuração deles.", confirmLabel: "Trocar chave", destructive: true }, () => executar(method));
      return;
    }
    if (method === "DELETE") {
      requestConfirm({ title: "Revogar a chave compartilhada?", description: "O envio de atividade de todos os bots será interrompido até gerar e configurar outra chave.", confirmLabel: "Revogar chave", destructive: true }, () => executar(method));
      return;
    }
    void executar(method);
  }

  async function copiar() {
    try { await navigator.clipboard.writeText(token); toast.success("Chave copiada."); }
    catch { toast.error("Não foi possível copiar. Selecione e copie a chave manualmente."); }
  }

  return <div className="space-y-4">
    <p className="text-fs-3 text-fg-secondary">Uma chave do escritório é compartilhada pelas automações do Ops Center. Cada bot informa seu próprio identificador (slug) ao enviar atividade. O Connect armazena somente o hash; a chave completa aparece apenas ao gerar ou trocar.</p>
    {hasToken ? <p className="text-helper text-fg-secondary">Chave configurada. Guarde-a na configuração protegida de cada bot autorizado.</p> : <p className="text-helper text-warning-fg">Nenhuma chave configurada. Os bots não conseguem enviar atividade.</p>}
    {token && <div className="space-y-2"><label htmlFor="ops-shared-token" className="block text-helper font-semibold text-fg-secondary">Nova chave — copie agora; ela não poderá ser consultada depois</label><div className="flex min-w-0 gap-2"><Input id="ops-shared-token" readOnly value={token} onFocus={e => e.target.select()} className="font-mono text-helper" /><Button type="button" variant="secondary" onClick={() => void copiar()}><Copy size={14} /> Copiar</Button></div></div>}
    {erro && <p role="alert" className="text-ui text-danger">{erro}</p>}
    <div className="flex flex-wrap justify-end gap-2">
      {hasToken && <Button type="button" variant="danger" disabled={ocupado} onClick={() => void alterar("DELETE")}><XCircle size={14} /> Revogar chave</Button>}
      <Button type="button" disabled={ocupado} loading={ocupado} onClick={() => void alterar("POST")}><KeyRound size={14} /> {hasToken ? "Trocar chave" : "Gerar chave"}</Button>
    </div>
    <p className="break-all rounded-md bg-surface-2 p-3 font-mono text-helper text-fg-secondary">Authorization: Bearer &lt;chave&gt;<br />POST /api/ops/events<br />POST /api/ops/watchers/&lt;slug&gt;/heartbeat</p>
    <p className="text-helper text-fg-muted"><RefreshCw size={12} className="mr-1 inline" />Ao trocar ou revogar a chave, atualize as configurações dos bots. Chaves individuais antigas continuam válidas durante a transição.</p>
    {dialog}
  </div>;
}
