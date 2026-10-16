"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Clock, Copy, ExternalLink, MessageCircle, RefreshCw, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/useConfirm";
import { gerarLinkTeste, excluirLinkTeste } from "@/app/(app)/testes/actions";
import { partesDoPrazo, linkDoWhatsApp, mensagemDoTeste, type PrazoDoLink } from "@/lib/testes/linkDoTeste";
import type { AssessmentType } from "@/generated/prisma/enums";

type Props = {
  linkId: string;
  /** APP_PUBLIC_URL, do servidor — a origem do link que vai para o candidato. */
  urlPublica: string;
  token: string;
  /** Nome do candidato, telefone e vaga — a mensagem do WhatsApp. */
  nome: string;
  telefone: string | null;
  vaga: string | null;
  /** "13/10" e quem gerou o link. */
  enviadoEm: string;
  enviadoPor: string | null;
  /** "20/10" — o dia em que o link deixa de abrir. */
  validoAte: string;
  prazo: PrazoDoLink;
  /** Quem pode gerar teste no setor (a mesma regra de `gerarLinkTeste`). */
  podeGerar: boolean;
  /** O que o "Gerar novo link" repete: a pessoa, a candidatura e o teste. */
  novoLink: { personId: string; candidaturaId: string | null; type: AssessmentType; templateId: string | null };
  /** Excluir o teste enviado: só o administrador (`podeExcluir`). */
  podeExcluir: boolean;
};

const semAssinatura = () => () => {};

/**
 * O link do teste enquanto o candidato não responde (14/10/2026, escolha
 * "Teste · 1A — Link com botões e prazo" do Kauan). Era uma frase e o link em
 * texto cinza, sem clique: agora o link num campo com Copiar, Abrir e Mandar
 * no WhatsApp (mensagem pronta com a vaga, o link e o prazo), os dois passos
 * — enviado e respondido — e o prazo contando, com a barra.
 *
 * "Gerar novo link" é a mesma ação da ficha do candidato (`gerarLinkTeste`):
 * apaga o link pendente e cria outro, com 7 dias de novo. Como a página é do
 * link antigo, ela troca para a do novo.
 *
 * Nada de "e-mail enviado" ou "aberto pelo candidato": o Connect não guarda.
 */
export function LinkDoTeste(props: Props) {
  const { linkId, urlPublica, token, nome, telefone, vaga, enviadoEm, enviadoPor, validoAte, prazo, podeGerar, novoLink, podeExcluir } = props;
  const router = useRouter();
  const toast = useToast();
  const { dialog, requestConfirm } = useConfirm();
  // Sem APP_PUBLIC_URL (desenvolvimento), a origem do navegador — como no
  // quadro de teste da ficha. No servidor, vazio.
  const origemDoNavegador = useSyncExternalStore(semAssinatura, () => window.location.origin, () => "");
  const url = `${urlPublica || origemDoNavegador}/teste/${token}`;
  const whatsapp = linkDoWhatsApp(telefone, mensagemDoTeste({ nome, vaga, url, validoAte }));
  const prazoNaTela = partesDoPrazo(prazo);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado. É só colar na mensagem para o candidato.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o link no campo e copie.");
    }
  }

  function gerarNovo() {
    requestConfirm(
      {
        title: "Gerar um novo link?",
        description: prazo.vencido
          ? "O candidato recebe um link novo, que vale por 7 dias. Se ele tiver e-mail cadastrado, o link vai por e-mail também."
          : "O link atual deixa de funcionar na hora. O novo vale por 7 dias e, se o candidato tiver e-mail cadastrado, vai por e-mail também.",
        confirmLabel: "Gerar novo link",
      },
      async () => {
        const r = await gerarLinkTeste(novoLink.personId, novoLink.candidaturaId, novoLink.type, novoLink.templateId);
        if ("error" in r) throw new Error(r.error);
        toast.success(r.emailSent ? "Novo link gerado e enviado por e-mail." : "Novo link gerado. Mande para o candidato.");
        router.replace(`/testes/${r.id}`);
      }
    );
  }

  function excluir() {
    requestConfirm(
      {
        title: "Excluir este teste?",
        description: "O link enviado ao candidato deixa de funcionar. Esta ação não pode ser desfeita.",
        confirmLabel: "Excluir",
        destructive: true,
      },
      async () => {
        await excluirLinkTeste(linkId);
        toast.success("Teste excluído.");
        router.replace("/testes");
      }
    );
  }

  const botaoGerar = podeGerar ? (
    <Button variant={prazo.vencido ? "primary" : "ghost"} size="sm" onClick={gerarNovo} className={prazo.vencido ? "" : "sm:ml-auto"}>
      <RefreshCw size={13} /> Gerar novo link
    </Button>
  ) : null;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-4">
        <h2 className="text-card-title font-semibold text-fg">Link do teste</h2>
        <span className="text-fs-2 text-fg-muted">
          enviado em {enviadoEm}
          {enviadoPor ? ` por ${enviadoPor}` : ""}
        </span>
      </div>

      {prazo.vencido ? (
        <div className="space-y-3">
          <Aviso tom="perigo">
            Este link venceu em {validoAte} e não abre mais para o candidato.
            {podeGerar ? " Gere um novo para mandar de novo." : " Peça a quem gerencia o Recrutamento para gerar um novo."}
          </Aviso>
          {botaoGerar && <div className="flex">{botaoGerar}</div>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <Input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link do teste" className="font-mono" />
            </div>
            <Button variant="primary" className="flex-shrink-0" onClick={copiar}>
              <Copy size={14} /> Copiar
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" href={url} nativo target="_blank" rel="noopener noreferrer">
              <ExternalLink size={13} /> Abrir
            </Button>
            <Button variant="secondary" size="sm" href={whatsapp} nativo target="_blank" rel="noopener noreferrer">
              <MessageCircle size={13} /> Mandar no WhatsApp
            </Button>
            {botaoGerar}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center mt-5 pt-4 border-t border-border">
        {/* Os dois passos que o Connect sabe: o link saiu e a resposta voltou. */}
        <ol className="flex items-start gap-2" aria-label="Andamento do teste">
          <li className="flex flex-col items-center gap-0.5 min-w-[6rem] text-center">
            <span aria-hidden className="w-4 h-4 rounded-full bg-brand border-2 border-brand mb-1" />
            <span className="text-fs-2 font-semibold text-fg">Enviado</span>
            <span className="text-micro text-fg-muted">{enviadoEm}</span>
          </li>
          <li aria-hidden className="flex-1 h-0.5 bg-border-strong mt-2" />
          <li className="flex flex-col items-center gap-0.5 min-w-[6rem] text-center">
            <span aria-hidden className="w-4 h-4 rounded-full bg-surface border-2 border-border-strong mb-1" />
            <span className="text-fs-2 font-semibold text-fg">Respondido</span>
            <span className="text-micro text-fg-muted">{prazo.vencido ? "não respondeu" : "aguardando"}</span>
          </li>
        </ol>

        <div className="rounded-lg bg-surface-2 px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <Clock size={14} aria-hidden className={prazo.vencido ? "text-danger" : "text-warning-fg"} />
            <span className="text-ui text-fg">
              {prazoNaTela.texto && `${prazoNaTela.texto} `}
              <b className="font-semibold">{prazoNaTela.destaque}</b>
            </span>
            <span className="ml-auto text-fs-2 text-fg-muted tnum">{validoAte}</span>
          </div>
          <div
            className="h-1.5 rounded-full bg-surface overflow-hidden"
            role="progressbar"
            aria-label="Quanto do prazo do link já passou"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(prazo.usado * 100)}
          >
            <div className={`h-full rounded-full ${prazo.vencido ? "bg-danger" : "bg-warning"}`} style={{ width: `${Math.round(prazo.usado * 100)}%` }} />
          </div>
        </div>
      </div>

      {podeExcluir && (
        <div className="flex justify-end mt-4 pt-3 border-t border-border">
          <Button variant="danger" size="xs" onClick={excluir}>
            <Trash2 size={11} /> Excluir teste
          </Button>
        </div>
      )}
      {dialog}
    </Card>
  );
}
