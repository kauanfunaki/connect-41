"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { DeveloperAvatar } from "@/components/github/GithubOverview";
import { formatInstantDateTime } from "@/lib/format";
import type { AccountLinkView } from "@/lib/github/conta";

const RETORNO: Record<string, { tom: "sucesso" | "perigo" | "atencao"; texto: string }> = {
  vinculado: { tom: "sucesso", texto: "Conta GitHub vinculada. Suas contribuições já aparecem com o seu nome no painel." },
  "em-uso": { tom: "atencao", texto: "Esta conta GitHub já está vinculada a outra pessoa do escritório." },
  erro: { tom: "perigo", texto: "Não foi possível vincular a conta GitHub. Tente novamente." },
};

// Sua conta → GitHub (27/10/2026): a pessoa do Tech confirma no GitHub qual é a
// conta dela; o painel de contribuições passa a mostrar "login — nome no Connect".
export function ContaGithub({ view, retorno, desvincular }: { view: AccountLinkView; retorno?: string; desvincular: () => Promise<void> }) {
  const [pendente, iniciar] = useTransition(), aviso = retorno ? RETORNO[retorno] : undefined;
  return <div className="space-y-3">
    {aviso && <Aviso tom={aviso.tom}>{aviso.texto}</Aviso>}
    {view.link ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
      <div className="flex min-w-0 items-center gap-3"><DeveloperAvatar login={view.link.login} />
        <div className="min-w-0"><p className="truncate text-ui font-semibold text-fg">{view.link.login}</p>
          <p className="text-helper text-fg-muted">Vinculada em {formatInstantDateTime(new Date(view.link.linkedAt))}</p></div></div>
      <div className="flex flex-wrap gap-2">
        {view.available && <Button href="/api/integrations/github/conta" nativo variant="secondary" size="sm">Trocar conta</Button>}
        <Button variant="danger" size="sm" disabled={pendente} onClick={() => iniciar(() => desvincular())}>{pendente ? "Desvinculando…" : "Desvincular"}</Button>
      </div>
    </div> : view.available ? <div className="space-y-2">
      <p className="text-ui text-fg-secondary">Vincule a sua conta para aparecer com o seu nome em GitHub — Contribuições. O GitHub só confirma quem você é; nenhum repositório é lido com a sua conta.</p>
      <Button href="/api/integrations/github/conta" nativo>Vincular conta GitHub</Button>
    </div> : <Aviso tom="neutro">{view.reason}</Aviso>}
  </div>;
}
