"use client";

import { Ban, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Popover, ItemDoMenu } from "@/components/ui/Popover";
import { useConfirm } from "@/components/ui/useConfirm";
import { useToast } from "@/components/ui/Toast";
import { cancelarLancamentoManual, cancelarProximasDaSerie } from "@/app/(app)/lancamentos/actions";

/**
 * Botão de verdade desde a conferência de 30/09 — era texto cinza solto, que o
 * Kauan reprovou nas tabelas do BPO. A confirmação é o diálogo do Connect, não
 * o `confirm()` do navegador: cancelar só se desfaz com um lançamento novo, e o
 * erro da action aparece no próprio diálogo.
 *
 * Na série da repetição (lote D), com contas depois desta, o botão abre as
 * duas escolhas: só esta, ou esta e as próximas — as anteriores não mudam.
 */
export function CancelarLancamento({ entryId, naSerie = false }: { entryId: string; naSerie?: boolean }) {
  const { dialog, requestConfirm } = useConfirm();
  const toast = useToast();

  const soEsta = () =>
    requestConfirm(
      {
        title: "Cancelar este lançamento?",
        description: "Ele sai de todos os totais e fica no histórico de auditoria. Para desfazer, só com um lançamento novo.",
        confirmLabel: "Cancelar lançamento",
        destructive: true,
      },
      async () => {
        const r = await cancelarLancamentoManual(entryId);
        if ("error" in r) throw new Error(r.error);
      }
    );

  const estaEAsProximas = () =>
    requestConfirm(
      {
        title: "Cancelar esta e as próximas da repetição?",
        description:
          "Esta e as que vêm depois dela na série saem de todos os totais e ficam no histórico de auditoria. As anteriores não mudam, e a já paga (ou com parte paga) fica como está. Na repetição até uma data ou sem fim, nenhuma conta nova nasce depois.",
        confirmLabel: "Cancelar esta e as próximas",
        destructive: true,
      },
      async () => {
        const r = await cancelarProximasDaSerie(entryId);
        if ("error" in r) throw new Error(r.error);
        toast.success(
          `${r.canceladas} ${r.canceladas === 1 ? "conta cancelada" : "contas canceladas"}${r.ficaram > 0 ? ` — ${r.ficaram} ${r.ficaram === 1 ? "ficou" : "ficaram"} por já ter baixa ou acordo` : ""}.`
        );
      }
    );

  return (
    <>
      {naSerie ? (
        <Popover
          align="right"
          width={240}
          aria-label="Cancelar lançamento"
          trigger={({ open, toggle }) => (
            <Button variant="danger" size="xs" onClick={toggle} aria-expanded={open}>
              <Ban size={12} /> Cancelar <ChevronDown size={11} />
            </Button>
          )}
        >
          {({ close }) => (
            <div className="flex flex-col gap-0.5">
              <ItemDoMenu
                danger
                onClick={() => {
                  close();
                  soEsta();
                }}
              >
                Só esta
              </ItemDoMenu>
              <ItemDoMenu
                danger
                onClick={() => {
                  close();
                  estaEAsProximas();
                }}
              >
                Esta e as próximas da série
              </ItemDoMenu>
            </div>
          )}
        </Popover>
      ) : (
        <Button variant="danger" size="xs" onClick={soEsta}>
          <Ban size={12} /> Cancelar
        </Button>
      )}
      {dialog}
    </>
  );
}
