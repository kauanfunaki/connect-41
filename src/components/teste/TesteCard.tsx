"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { gerarLinkTeste } from "@/app/(app)/testes/actions";
import { AssessmentResult } from "./AssessmentResult";
import { TestTypeSelect, type TemplateOption, type TestTypeValue } from "./TestTypeSelect";
import type { DiscScores, DiscDimension } from "@/lib/disc";
import type { QuizScores } from "@/lib/quiz";

type LinkState =
  | null
  | { status: "PENDENTE"; token: string; expiresAtLabel: string }
  | {
      status: "RESPONDIDO";
      id: string;
      type: "DISC";
      scores: DiscScores;
      primaryProfile: DiscDimension;
      secondaryProfile: DiscDimension | null;
      submittedAtLabel: string;
    }
  | {
      status: "RESPONDIDO";
      id: string;
      type: "MULTIPLA_ESCOLHA";
      scores: QuizScores;
      templateName: string;
      submittedAtLabel: string;
    };

type Props = {
  personId: string;
  candidaturaId: string | null;
  initialLink: LinkState;
  canManage: boolean;
  templates: TemplateOption[];
};

export function TesteCard({ personId, candidaturaId, initialLink, canManage, templates }: Props) {
  const router = useRouter();
  const [link, setLink] = useState<LinkState>(initialLink);
  const [testType, setTestType] = useState<TestTypeValue>({ type: "DISC" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailNote, setEmailNote] = useState<string | null>(null);

  const linkUrl =
    link?.status === "PENDENTE" ? `${typeof window !== "undefined" ? window.location.origin : ""}/teste/${link.token}` : "";

  async function handleGerar() {
    setError(null);
    setEmailNote(null);
    setPending(true);
    try {
      const result = await gerarLinkTeste(
        personId,
        candidaturaId,
        testType.type,
        testType.type === "MULTIPLA_ESCOLHA" ? testType.templateId : null
      );
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setLink({ status: "PENDENTE", token: result.token, expiresAtLabel: result.expiresAtLabel });
      setEmailNote(
        result.emailSent
          ? "Enviamos o link por e-mail também."
          : "Copie o link e envie ao candidato (nenhum e-mail foi enviado)."
      );
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
    <div className="bg-surface border border-border rounded-lg p-5">
      <div className="flex items-center gap-2 mb-1">
        <ClipboardList size={16} className="text-brand" />
        <h2 className="text-[14px] font-semibold text-fg">Teste</h2>
      </div>

      {!link && (
        <>
          <p className="text-[13px] text-fg-muted mb-3">Envie um link para o candidato responder um teste sozinho.</p>
          {canManage && (
            <div className="space-y-3">
              <div className="max-w-xs">
                <TestTypeSelect templates={templates} value={testType} onChange={setTestType} id={`teste-type-${personId}`} />
              </div>
              <button
                type="button"
                onClick={handleGerar}
                disabled={pending}
                className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
              >
                {pending ? "Gerando…" : "Enviar teste"}
              </button>
            </div>
          )}
        </>
      )}

      {link?.status === "PENDENTE" && (
        <>
          <p className="text-[13px] text-fg-muted mb-3">
            Aguardando resposta do candidato. Link expira em {link.expiresAtLabel}.
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

      {link?.status === "RESPONDIDO" && (
        <>
          <p className="text-[12px] text-fg-muted mb-3">Respondido em {link.submittedAtLabel}.</p>
          {link.type === "DISC" ? (
            <AssessmentResult
              type="DISC"
              scores={link.scores}
              primaryProfile={link.primaryProfile}
              secondaryProfile={link.secondaryProfile}
              compact
              detailHref={`/testes/${link.id}`}
            />
          ) : (
            <AssessmentResult
              type="MULTIPLA_ESCOLHA"
              scores={link.scores}
              templateName={link.templateName}
              compact
              detailHref={`/testes/${link.id}`}
            />
          )}
        </>
      )}

      {error && <p className="text-[13px] text-danger mt-3">{error}</p>}
    </div>
  );
}
