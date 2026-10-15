"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import { Check, ClipboardList, Clock, Copy, ExternalLink, MessageCircle, RefreshCw } from "lucide-react";
import { AlinhadoAoCampo } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Aviso } from "@/components/ui/Aviso";
import { useConfirm } from "@/components/ui/useConfirm";
import { gerarLinkTeste } from "@/app/(app)/testes/actions";
import {
  diaEMesDoLink,
  linkDoWhatsApp,
  mensagemDoTeste,
  partesDoPrazo,
  prazoDoLink,
  type LinkPendenteNaFicha,
} from "@/lib/testes/linkDoTeste";
import { AssessmentResult } from "./AssessmentResult";
import { TestTypeSelect, type TemplateOption, type TestTypeValue } from "./TestTypeSelect";
import type { DiscScores, DiscDimension } from "@/lib/disc";
import type { QuizScores } from "@/lib/quiz";

type LinkState =
  | null
  | LinkPendenteNaFicha
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
  /** APP_PUBLIC_URL, do servidor — a origem do link que vai para o candidato. */
  urlPublica?: string;
  /** Nome, telefone e vaga do candidato — a mensagem pronta do WhatsApp. */
  nome: string;
  telefone: string | null;
  vaga: string | null;
};

export function TesteCard({ personId, candidaturaId, initialLink, canManage, templates, urlPublica, nome, telefone, vaga }: Props) {
  const router = useRouter();
  const [link, setLink] = useState<LinkState>(initialLink);
  const [testType, setTestType] = useState<TestTypeValue>({ type: "DISC" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [emailNote, setEmailNote] = useState<string | null>(null);
  const { dialog, requestConfirm } = useConfirm();

  const linkUrl =
    // O endereço público, como no e-mail (05/10/2026): `window.location` levava o
    // host do setor em que a pessoa estava, e o candidato recebia `bpo.…/teste`.
    link?.status === "PENDENTE" ? `${urlPublica || (typeof window !== "undefined" ? window.location.origin : "")}/teste/${link.token}` : "";

  async function handleGerar() {
    setError(null);
    setEmailNote(null);
    setPending(true);
    // "Gerar novo link" repete o teste que está pendente; sem link, vale o
    // escolhido no seletor.
    const type = link?.status === "PENDENTE" ? link.type : testType.type;
    const templateId =
      link?.status === "PENDENTE" ? link.templateId : testType.type === "MULTIPLA_ESCOLHA" ? testType.templateId : null;
    try {
      const result = await gerarLinkTeste(personId, candidaturaId, type, templateId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      const agora = new Date();
      const expiraEm = new Date(result.expiraEm);
      setLink({
        status: "PENDENTE",
        id: result.id,
        token: result.token,
        validoAte: diaEMesDoLink(expiraEm),
        prazo: prazoDoLink({ criadoEm: agora, expiraEm, agora }),
        type,
        templateId,
      });
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
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-1">
        <ClipboardList size={16} className="text-brand" />
        <h2 className="text-section font-semibold text-fg">Teste</h2>
      </div>

      {!link && (
        <>
          <p className="text-ui text-fg-muted mb-3">Envie um link para o candidato responder um teste sozinho.</p>
          {/* O tipo e o "Enviar" na mesma linha: eram um em cima do outro,
              com o select numa coluna de 320px e o botão solto embaixo. */}
          {canManage && (
            <FieldGrid columns="sm:grid-cols-[minmax(0,320px)_auto]">
              <TestTypeSelect templates={templates} value={testType} onChange={setTestType} id={`teste-type-${personId}`} />
              <AlinhadoAoCampo>
                <Button type="button" onClick={handleGerar} disabled={pending} className="w-full sm:w-auto">
                  {pending ? "Gerando…" : "Enviar teste"}
                </Button>
              </AlinhadoAoCampo>
            </FieldGrid>
          )}
        </>
      )}

      {/* O link pendente no desenho 1A da página do teste (15/10/2026): era
          "Aguardando resposta do candidato…" e o endereço cru num campo, sem
          Abrir, WhatsApp nem o prazo. */}
      {link?.status === "PENDENTE" && (
        <div className="space-y-3">
          {link.prazo.vencido ? (
            <Aviso tom="perigo">
              Este link venceu em {link.validoAte} e não abre mais para o candidato.
              {canManage ? " Gere um novo para mandar de novo." : " Peça a quem gerencia o Recrutamento para gerar um novo."}
            </Aviso>
          ) : (
            <>
              <p className="flex items-center gap-2 text-ui text-fg">
                <Clock size={14} aria-hidden className="text-warning-fg flex-shrink-0" />
                <span>
                  {partesDoPrazo(link.prazo).texto} <b className="font-semibold">{partesDoPrazo(link.prazo).destaque}</b>
                </span>
                <span className="ml-auto text-fs-2 text-fg-muted tnum">{link.validoAte}</span>
              </p>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <Input readOnly value={linkUrl} onFocus={(e) => e.target.select()} aria-label="Link do teste" className="font-mono" />
                </div>
                <Button variant="primary" className="flex-shrink-0" onClick={handleCopy}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copiado!" : "Copiar"}
                </Button>
              </div>
            </>
          )}
          {emailNote && <p className="text-fs-2 text-fg-muted">{emailNote}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {!link.prazo.vencido && (
              <>
                <Button variant="secondary" size="sm" href={linkUrl} nativo target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={13} /> Abrir
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  href={linkDoWhatsApp(telefone, mensagemDoTeste({ nome, vaga, url: linkUrl, validoAte: link.validoAte }))}
                  nativo
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle size={13} /> Mandar no WhatsApp
                </Button>
              </>
            )}
            {canManage && (
              // Era texto cinza sublinhado (30/09): botão não é link. Confirma
              // antes, como na página do teste: o link atual deixa de abrir.
              <Button
                variant={link.prazo.vencido ? "primary" : "ghost"}
                size="sm"
                onClick={() =>
                  link.prazo.vencido
                    ? handleGerar()
                    : requestConfirm(
                        {
                          title: "Gerar um novo link?",
                          description:
                            "O link atual deixa de funcionar na hora. O novo vale por 7 dias e, se o candidato tiver e-mail cadastrado, vai por e-mail também.",
                          confirmLabel: "Gerar novo link",
                        },
                        handleGerar
                      )
                }
                disabled={pending}
                className={link.prazo.vencido ? "" : "sm:ml-auto"}
              >
                <RefreshCw size={13} />
                {pending ? "Gerando…" : "Gerar novo link"}
              </Button>
            )}
          </div>
        </div>
      )}

      {link?.status === "RESPONDIDO" && (
        <>
          <p className="text-fs-2 text-fg-muted mb-3">Respondido em {link.submittedAtLabel}.</p>
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

      {error && <p className="text-ui text-danger mt-3">{error}</p>}
      {dialog}
    </Card>
  );
}
