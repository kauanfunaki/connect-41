"use client";

import { useId, useState, useTransition } from "react";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { AvatarImage } from "@/components/shared/AvatarImage";
import { MentionTextarea, type MentionUser } from "@/components/transferencias/MentionTextarea";
import { comentarNaTransferencia } from "@/app/(app)/transferencias/actions";
import { COMENTARIO_MAXIMO } from "@/lib/handoffTransicoes";

type Props = {
  handoffId: string;
  eu: { nome: string; foto: string | null };
  /** Quem pode ser chamado com @ — os ativos do escritório, como na nova transferência. */
  pessoas: MentionUser[];
};

/**
 * A caixa de comentário da Atividade (10/11/2026, pedido do Kauan): a dúvida
 * sobre a transferência fica nela, e não no WhatsApp. "@" chama alguém (com a
 * mesma lista de nomes da nova transferência), Ctrl+Enter envia, como nos
 * Chamados.
 */
export function ComentarNaTransferencia({ handoffId, eu, pessoas }: Props) {
  const toast = useToast();
  const id = useId();
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function enviar() {
    if (pendente) return;
    if (!texto.trim()) {
      setErro("Escreva o comentário.");
      return;
    }
    setErro(null);
    iniciar(async () => {
      const r = await comentarNaTransferencia(handoffId, texto);
      if (r.ok) {
        setTexto("");
        toast.success("Comentário publicado.");
      } else setErro(r.erro);
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        enviar();
      }}
      className="flex items-start gap-2.5"
    >
      <span className="mt-1 hidden sm:inline-flex">
        <AvatarImage src={eu.foto} name={eu.nome} size={28} fontSize={10} />
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <MentionTextarea
          id={id}
          rows={3}
          crescer
          value={texto}
          onChange={(v) => {
            setTexto(v);
            if (erro) setErro(null);
          }}
          users={pessoas}
          disabled={pendente}
          maxLength={COMENTARIO_MAXIMO}
          onCtrlEnter={enviar}
          placeholder="Escreva para os setores desta transferência. Use @ para chamar alguém."
          aria-label="Comentário"
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? `${id}-erro` : undefined}
        />
        {erro && (
          <p id={`${id}-erro`} role="alert" className="text-helper font-medium text-danger">
            {erro}
          </p>
        )}
        <div className="flex items-center justify-end gap-3">
          <span className="hidden text-micro text-fg-muted sm:inline">Ctrl+Enter envia</span>
          <Button type="submit" size="sm" className="max-sm:h-11" disabled={!texto.trim()} loading={pendente} loadingLabel="Enviando…">
            <SendHorizontal size={14} aria-hidden />
            Comentar
          </Button>
        </div>
      </div>
    </form>
  );
}
