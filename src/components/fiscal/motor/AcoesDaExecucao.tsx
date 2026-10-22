"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/useConfirm";
import { AcoesFiscais } from "@/components/fiscal/previa/Compartilhados";
import { cancelarExecucaoNoMotor, destravarExecucaoNoMotor } from "@/app/(app)/fiscal/motor-actions";
import { useChaveDeIdempotencia } from "./useChaveDeIdempotencia";

/** Cancelar (pendente) e destravar (sem sinal do agente), com confirmação. */
export function AcoesDaExecucao({ raiz, id, podeCancelar, podeDestravar, permiteAgir, permiteGerir, hrefDetalhe }: {
  raiz: string;
  id: number;
  podeCancelar: boolean;
  podeDestravar: boolean;
  permiteAgir: boolean;
  permiteGerir: boolean;
  hrefDetalhe: string;
}) {
  const router = useRouter();
  const [chave, , depoisDe] = useChaveDeIdempotencia();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const { dialog, requestConfirm } = useConfirm();
  const agir = (acao: typeof cancelarExecucaoNoMotor) => new Promise<void>((resolve, reject) => startTransition(async () => {
    const r = await acao({ raiz, id, chave });
    depoisDe(r);
    if (r.ok) { setErro(null); router.refresh(); resolve(); } else { setErro(r.mensagem); reject(new Error(r.mensagem)); }
  }));
  return <AcoesFiscais>
    <Button size="xs" variant="ghost" href={hrefDetalhe} scroll={false}>Ver log</Button>
    {podeCancelar && <Button size="xs" variant="secondary" disabled={!permiteAgir || pendente} onClick={() => requestConfirm({ title: `Cancelar o pedido #${id}?`, description: "Só pedidos ainda na fila podem ser cancelados.", confirmLabel: "Cancelar pedido", destructive: true }, () => agir(cancelarExecucaoNoMotor))}>Cancelar</Button>}
    {podeDestravar && <Button size="xs" variant="danger" disabled={!permiteGerir || pendente} onClick={() => requestConfirm({ title: `Destravar a execução #${id}?`, description: "O agente parou de dar sinal. Destravar marca o item como erro e libera a fila; não encerra processo nenhum. Se o agente voltar e terminar, o resultado real prevalece.", confirmLabel: "Destravar", destructive: true }, () => agir(destravarExecucaoNoMotor))}>Destravar</Button>}
    {erro && <span role="alert" className="text-helper text-danger">{erro}</span>}
    {dialog}
  </AcoesFiscais>;
}
