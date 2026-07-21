"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { gerarLinkAdmissao, concluirAdmissao } from "@/app/(app)/pessoas/[id]/admissao-actions";

type LinkState =
  | null
  | { status: "PENDENTE"; token: string; expiresAtLabel: string }
  | { status: "PREENCHIDO"; submittedAtLabel: string };

type Props = {
  personId: string;
  initialLink: LinkState;
  canManage: boolean;
};

export function AdmissaoCard({ personId, initialLink, canManage }: Props) {
  const router = useRouter();
  const [link, setLink] = useState<LinkState>(initialLink);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailNote, setEmailNote] = useState<string | null>(null);

  const linkUrl = link?.status === "PENDENTE" ? `${typeof window !== "undefined" ? window.location.origin : ""}/admissao/${link.token}` : "";

  async function handleGerar() {
    setError(null);
    setEmailNote(null);
    setPending(true);
    try {
      const result = await gerarLinkAdmissao(personId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setLink({ status: "PENDENTE", token: result.token, expiresAtLabel: result.expiresAtLabel });
      setEmailNote(result.emailSent ? "Enviamos o link por e-mail também." : "Copie o link e envie ao colaborador (nenhum e-mail foi enviado).");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleConcluir() {
    setError(null);
    setPending(true);
    try {
      const result = await concluirAdmissao(personId);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(linkUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Não foi possível copiar. Selecione o link manualmente.");
    }
  }

  return (
    <div className="bg-surface border border-brand/30 rounded-lg p-5">
      <div className="flex items-center gap-2 mb-1">
        <UserPlus size={16} className="text-brand" />
        <h2 className="text-[14px] font-semibold text-fg">Admissão digital</h2>
      </div>

      {!link && (
        <>
          <p className="text-[13px] text-fg-muted mb-3">
            Gere um link para o colaborador preencher os próprios dados e enviar os documentos — sem digitação manual.
          </p>
          {canManage && (
            <button
              type="button"
              onClick={handleGerar}
              disabled={pending}
              className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
            >
              {pending ? "Gerando…" : "Gerar link de admissão"}
            </button>
          )}
        </>
      )}

      {link?.status === "PENDENTE" && (
        <>
          <p className="text-[13px] text-fg-muted mb-3">
            Aguardando o preenchimento pelo colaborador. Link expira em {link.expiresAtLabel}.
          </p>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex-1">
              <Input readOnly value={linkUrl} onFocus={(e) => e.target.select()} />
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="h-9 px-3 rounded-md border border-border-strong bg-surface-hover text-fg text-[12px] font-medium hover:border-brand transition-colors flex-shrink-0"
            >
              {copied ? "Copiado!" : "Copiar"}
            </button>
          </div>
          {emailNote && <p className="text-[12px] text-fg-muted mb-3">{emailNote}</p>}
          {canManage && (
            <button
              type="button"
              onClick={handleGerar}
              disabled={pending}
              className="text-[12px] text-fg-muted hover:text-fg underline transition-colors disabled:opacity-60"
            >
              {pending ? "Gerando…" : "Gerar novo link (invalida o atual)"}
            </button>
          )}
        </>
      )}

      {link?.status === "PREENCHIDO" && (
        <>
          <p className="text-[13px] text-fg-muted mb-3">
            Dados recebidos em {link.submittedAtLabel}. Confira as informações e os documentos nas abas acima e conclua a admissão (o status passa para Ativo).
          </p>
          {canManage && (
            <button
              type="button"
              onClick={handleConcluir}
              disabled={pending}
              className="h-9 px-4 rounded-md bg-success text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {pending ? "Concluindo…" : "Concluir admissão"}
            </button>
          )}
        </>
      )}

      {error && <p className="text-[13px] text-danger mt-3">{error}</p>}
    </div>
  );
}
