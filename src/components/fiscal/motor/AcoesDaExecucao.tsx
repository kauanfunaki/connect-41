"use client";
import { useEmpresaContabil } from "@/components/contabil/ContextoContribuicoes";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/useConfirm";
import { AcoesFiscais } from "@/components/fiscal/previa/Compartilhados";
import { cancelarExecucaoNoMotor, destravarExecucaoNoMotor } from "@/app/(app)/fiscal/motor-actions";
import { useChaveDeIdempotencia } from "./useChaveDeIdempotencia";

/**
 * Cancelar (pendente) e destravar (sem sinal do agente), com confirmação.
 * Uma chave de idempotência por ação, e o erro só no diálogo (26/10/2026):
 * as duas dividiam a chave, e o erro aparecia também ao lado dos botões.
 */
export function AcoesDaExecucao({ raiz, id, podeCancelar, podeDestravar, permiteAgir, permiteGerir, hrefDetalhe }: {
  raiz: string;
  id: number;
  podeCancelar: boolean;
  podeDestravar: boolean;
  permiteAgir: boolean;
  permiteGerir: boolean;
  hrefDetalhe: string;
}) {
  const empresaContabil = useEmpresaContabil();
  const router = useRouter();
  const [chaveCancelar, , depoisDeCancelar] = useChaveDeIdempotencia();
  const [chaveDestravar, , depoisDeDestravar] = useChaveDeIdempotencia();
  const { dialog, requestConfirm } = useConfirm();
  const agir = async (acao: typeof cancelarExecucaoNoMotor, chave: string, depoisDe: typeof depoisDeCancelar) => {
    const r = await acao({ raiz, empresaContabil, id, chave });
    depoisDe(r);
    if (!r.ok) throw new Error(r.mensagem);
    router.refresh();
  };
  return <AcoesFiscais>
    <Button size="xs" variant="ghost" href={hrefDetalhe} scroll={false}>Ver log</Button>
    {podeCancelar && <Button size="xs" variant="secondary" disabled={!permiteAgir} onClick={() => requestConfirm({ title: `Cancelar o pedido #${id}?`, description: "Só pedidos ainda na fila podem ser cancelados.", confirmLabel: "Cancelar pedido", destructive: true }, () => agir(cancelarExecucaoNoMotor, chaveCancelar, depoisDeCancelar))}>Cancelar</Button>}
    {podeDestravar && <Button size="xs" variant="danger" disabled={!permiteGerir} onClick={() => requestConfirm({ title: `Destravar a execução #${id}?`, description: "O agente parou de dar sinal. Destravar marca o item como erro e libera a fila; não encerra processo nenhum. Se o agente voltar e terminar, o resultado real prevalece.", confirmLabel: "Destravar", destructive: true }, () => agir(destravarExecucaoNoMotor, chaveDestravar, depoisDeDestravar))}>Destravar</Button>}
    {dialog}
  </AcoesFiscais>;
}
