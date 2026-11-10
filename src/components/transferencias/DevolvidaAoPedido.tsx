"use client";

import { useId, useState, useTransition } from "react";
import { CornerUpLeft, SendHorizontal } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { mudarAParte } from "@/app/(app)/transferencias/actions";
import { MOTIVO_MAXIMO, avisoDaAcao, peloSetor } from "@/lib/handoffTransicoes";

type Props = {
  parteId: string;
  setor: string;
  origem: string;
  /** O motivo inteiro da última devolução, com quem e quando. */
  motivo: string | null;
  quem: string | null;
  quando: string | null;
};

/**
 * "Devolvida pelo {setor}" (10/11/2026, pedido do Kauan): o cartão de quem
 * pediu — ou da coordenação do setor de origem — quando um setor devolve a
 * parte dele. Mostra o motivo e pede a resposta; "Responder e reenviar" grava
 * a resposta na Atividade e a parte volta a ser nova para o setor.
 */
export function DevolvidaAoPedido({ parteId, setor, origem, motivo, quem, quando }: Props) {
  const toast = useToast();
  const idDoTitulo = useId();
  const idDaResposta = useId();
  const [resposta, setResposta] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function reenviar(e: React.FormEvent) {
    e.preventDefault();
    const texto = resposta.trim();
    if (!texto) {
      setErro("Escreva a resposta antes de reenviar.");
      return;
    }
    setErro(null);
    iniciar(async () => {
      const r = await mudarAParte(parteId, "reenviar", texto);
      if (r.ok) {
        setResposta("");
        toast.success(avisoDaAcao("reenviar", { parte: setor, origem }));
      } else setErro(r.erro);
    });
  }

  return (
    <Card as="section" aria-labelledby={idDoTitulo} className="p-5 space-y-4 border-danger/40!">
      <h2 id={idDoTitulo} className="text-section font-semibold text-fg flex items-center gap-2">
        <CornerUpLeft size={16} aria-hidden className="text-danger shrink-0" />
        Devolvida {peloSetor(setor)}
      </h2>
      <div className="space-y-1">
        {(quem || quando) && (
          <p className="text-helper text-fg-muted">
            {quem}
            {quem && quando ? " · " : ""}
            {quando}
          </p>
        )}
        <p className="text-ui text-fg whitespace-pre-wrap break-words">{motivo ?? "Sem motivo registrado."}</p>
      </div>

      <form onSubmit={reenviar} className="space-y-2">
        <label htmlFor={idDaResposta} className="text-label font-medium leading-5 text-fg">
          Sua resposta<span className="text-danger"> *</span>
        </label>
        <Textarea
          id={idDaResposta}
          rows={3}
          maxLength={MOTIVO_MAXIMO}
          value={resposta}
          disabled={pendente}
          onChange={(e) => setResposta(e.target.value)}
          placeholder="O que foi resolvido, ou onde está o que o setor pediu."
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? `${idDaResposta}-erro` : undefined}
        />
        {erro && (
          <p id={`${idDaResposta}-erro`} role="alert" className="text-helper font-medium text-danger">
            {erro}
          </p>
        )}
        <Button type="submit" className="w-full max-sm:h-11" disabled={!resposta.trim()} loading={pendente} loadingLabel="Reenviando…">
          <SendHorizontal size={14} aria-hidden />
          Responder e reenviar
        </Button>
      </form>
    </Card>
  );
}
