"use client";

import { useId, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Checkbox } from "@/components/ui/Checkbox";
import { useToast } from "@/components/ui/Toast";

type Pedido = {
  nome: string;
  /** As subatividades abertas abaixo, em todos os níveis. */
  abertas: number;
  /** `{ error }` quando o servidor recusa — o cartão de uma solicitação que a pessoa não pode concluir (09/11/2026). */
  concluir: (comSubatividades: boolean) => Promise<{ error: string } | void>;
};

/**
 * Concluir uma atividade com subatividades abertas pergunta antes (06/11/2026,
 * com a subatividade em vários níveis): "Concluir também as 3 subatividades
 * abertas", já marcado — o pai pronto costuma querer dizer as partes prontas,
 * mas quem conclui decide. Sem subatividade aberta, conclui no clique, como
 * sempre foi: a pergunta só aparece quando há o que decidir.
 *
 * Uso: `const { dialog, concluir } = useConcluirComSubatividades();`, chame
 * `concluir({ nome, abertas, concluir })` no clique e ponha `{dialog}` na tela.
 */
export function useConcluirComSubatividades() {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [junto, setJunto] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const toast = useToast();
  const id = useId();

  function concluir(p: Pedido) {
    if (p.abertas === 0) {
      startTransition(async () => {
        try {
          const r = await p.concluir(false);
          if (r && "error" in r) toast.error(r.error);
        } catch {
          toast.error("Não deu para falar com o servidor. A atividade não foi concluída.");
        }
      });
      return;
    }
    setJunto(true);
    setErro(null);
    setPedido(p);
  }

  function confirmar() {
    if (!pedido) return;
    const p = pedido;
    startTransition(async () => {
      try {
        const r = await p.concluir(junto);
        if (r && "error" in r) setErro(r.error);
        else setPedido(null);
      } catch {
        setErro("Não deu para falar com o servidor. Nada foi concluído.");
      }
    });
  }

  const abertas = pedido?.abertas ?? 0;
  const dialog = (
    <ConfirmDialog
      open={pedido !== null}
      title={`Concluir "${pedido?.nome ?? ""}"?`}
      confirmLabel="Concluir"
      pendingLabel="Concluindo…"
      pending={pendente}
      error={erro}
      onConfirm={confirmar}
      onCancel={() => setPedido(null)}
    >
      <Checkbox
        id={`${id}-junto`}
        checked={junto}
        onChange={(e) => setJunto(e.target.checked)}
        label={abertas === 1 ? "Concluir também a subatividade aberta" : `Concluir também as ${abertas} subatividades abertas`}
        helper="De todos os níveis abaixo dela. Sem marcar, elas continuam abertas."
      />
    </ConfirmDialog>
  );

  return { dialog, concluir, pendente };
}
