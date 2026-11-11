"use client";

import { useState, useTransition } from "react";
import { PartyPopper } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { mandarParabensAction } from "@/app/(app)/academia/actions";

/** O que a linha precisa saber para mostrar o "Parabéns" (Fase 2). */
export type ParabensDaLinha = { mes: string; tipo: string; podeMandar: boolean; enviados: readonly string[] };

/**
 * "Parabéns" para um colega no Hall ou no ranking (Fase 2, 11/11/2026): um por
 * pessoa, mês e tipo. Depois de mandar, o botão vira "Parabéns enviado" e não
 * volta. Quem recebe é avisado no sino.
 */
export function BotaoDeParabens({ paraUserId, nome, parabens }: { paraUserId: string; nome: string; parabens: ParabensDaLinha }) {
  const [enviado, setEnviado] = useState(parabens.enviados.includes(paraUserId));
  const [mandando, iniciar] = useTransition();
  const toast = useToast();
  if (!parabens.podeMandar) return null;

  function mandar() {
    iniciar(async () => {
      const r = await mandarParabensAction({ paraUserId, mes: parabens.mes, tipo: parabens.tipo });
      if ("erro" in r) {
        toast.error(r.erro);
        return;
      }
      setEnviado(true);
      toast.success(`Parabéns enviado para ${nome}.`);
    });
  }

  const classe =
    "inline-flex min-h-8 flex-shrink-0 items-center gap-1 rounded-md px-2 text-micro font-semibold [@media(pointer:coarse)]:min-h-11";
  if (enviado) {
    return (
      <span className={`${classe} text-fg-muted`}>
        <PartyPopper size={13} aria-hidden />{" "}
        <span aria-hidden className="hidden sm:inline">
          Enviado
        </span>
        <span className="sr-only">Parabéns enviado para {nome}</span>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={mandar}
      disabled={mandando}
      aria-label={`Dar parabéns para ${nome}`}
      className={`${classe} border border-border text-brand hover:bg-brand-subtle disabled:opacity-[var(--c41-disabled-op)]`}
    >
      <PartyPopper size={13} aria-hidden /> <span className="hidden sm:inline">{mandando ? "Enviando…" : "Parabéns"}</span>
    </button>
  );
}
