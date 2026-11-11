"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { FormFooter } from "@/components/ui/FormFooter";
import { useToast } from "@/components/ui/Toast";
import { Textarea } from "@/components/ui/Textarea";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoDeAnexos } from "./CampoDeAnexos";

type RespostaDaAcao = { error: string } | { ok: true; aviso?: string | null };

/**
 * Caixa de resposta, igual para a equipe e para o cliente — muda só a action.
 *
 * A action chega por prop, e não por import, para o portal não carregar a
 * action interna (nem o contrário) para dentro da própria árvore.
 *
 * `alvo` é o que a action precisa saber para gravar, e `campo` é o nome com que
 * ele viaja: `requestId` na pendência, `companyId` na conversa livre. Uma caixa
 * de escrever mensagem só, para as duas telas não divergirem em tamanho de
 * arquivo, contagem de anexos e estado de envio.
 */
export function ResponderPendencia({
  alvo,
  campo = "requestId",
  acao,
  rotulo = "Responder",
  dica,
  extras,
}: {
  alvo: string;
  campo?: string;
  acao: (formData: FormData) => Promise<RespostaDaAcao>;
  rotulo?: string;
  dica?: string;
  /** Campos a mais, que viajam no mesmo formulário (a solicitação usa para a situação depois de enviar). */
  extras?: React.ReactNode;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Trocar a chave remonta o formulário: limpa texto e arquivos escolhidos
  // sem controlar input de arquivo por estado, que o navegador não deixa.
  const [versao, setVersao] = useState(0);
  const [pendente, startTransition] = useTransition();
  const toast = useToast();
  const noPortal = usePathname().startsWith("/portal");
  // No formulário, que remonta a cada envio: o efeito roda depois da troca e
  // já pega o novo.
  const caixa = useRef<HTMLFormElement>(null);

  // Depois de enviar (11/11/2026, P08): o campo só esvaziava, sem dizer nada,
  // e a mensagem nova entrava acima da caixa, fora da tela no celular — a
  // pessoa não sabia se tinha ido. Agora a tela rola até ela. A conversa é a
  // lista (`<ol>`, a `ConversaDaPendencia`) logo antes desta caixa, nas quatro
  // telas que a usam (pendência, solicitação, processo e conversa); sem
  // lista, a caixa fica onde está.
  useEffect(() => {
    if (versao === 0 || !caixa.current) return;
    const quadro = requestAnimationFrame(() => {
      if (caixa.current) rolarAteAMensagemNova(caixa.current);
    });
    return () => cancelAnimationFrame(quadro);
  }, [versao]);

  return (
    <form
      ref={caixa}
      key={versao}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        setErro(null);
        setAviso(null);
        startTransition(async () => {
          const r = await acao(dados);
          if ("error" in r) {
            setErro(r.error);
            return;
          }
          setVersao((v) => v + 1);
          if (r.aviso) setAviso(r.aviso);
          // "A equipe foi avisada" só no portal e só quando o aviso saiu: com
          // `aviso`, algo do envio falhou e a nota diz o quê.
          toast.success(noPortal && !r.aviso ? "Mensagem enviada. A equipe foi avisada." : "Mensagem enviada.");
        });
      }}
    >
      <input type="hidden" name={campo} value={alvo} />
      <CampoForm label="Mensagem" htmlFor={`resposta-${alvo}`} helper={dica}>
        <Textarea id={`resposta-${alvo}`} name="body" rows={4} maxLength={5000} />
      </CampoForm>
      {/* Com rótulo, como na abertura da pendência — sem ele, as faixas de
          arquivo pareciam soltas embaixo da mensagem. */}
      <CampoForm label="Anexos" htmlFor={`anexo-${alvo}-0`}>
        <CampoDeAnexos idBase={`anexo-${alvo}`} />
      </CampoForm>
      {extras}
      {/* O rodapé padrão (08/10/2026), sem a divisória: a mensagem e os
          anexos já fecham o bloco. O aviso de envio (e-mail que não saiu)
          entra como nota, no lugar do erro. */}
      <FormFooter
        pending={pendente}
        submitLabel={rotulo}
        pendingLabel="Enviando…"
        erro={erro}
        nota={aviso && <span className="text-warning-fg">{aviso}</span>}
        semDivisoria
      />
    </form>
  );
}

/**
 * Rola até a última mensagem da conversa que fica antes da caixa de resposta —
 * a que acabou de entrar. A conversa é o `<ol>` mais próximo antes da caixa.
 */
function rolarAteAMensagemNova(caixa: HTMLElement) {
  const antes = Array.from(document.querySelectorAll("ol")).filter(
    (ol) => !ol.contains(caixa) && ol.compareDocumentPosition(caixa) & Node.DOCUMENT_POSITION_FOLLOWING
  );
  const nova = antes.at(-1)?.lastElementChild;
  if (!(nova instanceof HTMLElement)) return;
  const suave = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  nova.scrollIntoView({ block: "center", behavior: suave ? "smooth" : "auto" });
}
