"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
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

  return (
    <form
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
      <div className="flex flex-wrap items-center justify-end gap-3">
        {erro && <span className="mr-auto text-[12px] text-danger">{erro}</span>}
        <Button type="submit" disabled={pendente}>
          <Send size={14} /> {pendente ? "Enviando…" : rotulo}
        </Button>
      </div>
      {aviso && <p className="text-[12px] text-warning">{aviso}</p>}
    </form>
  );
}
