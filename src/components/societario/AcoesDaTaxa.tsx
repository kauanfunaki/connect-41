"use client";

import { useTransition } from "react";
import { CircleCheck, RotateCcw, Trash2 } from "lucide-react";
import { ItemDoMenu } from "@/components/ui/Popover";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { useConfirm } from "@/components/ui/useConfirm";
import { useToast } from "@/components/ui/Toast";
import { excluirTaxa, marcarTaxaComoPaga } from "@/app/(app)/processos/actions";

/**
 * O ⋯ de cada taxa (30/10/2026): marcar como paga hoje (ou desfazer) e excluir
 * a lançada por engano. A paga não se exclui — é o custo do processo.
 */
export function AcoesDaTaxa({ taxaId, descricao, paga, podeExcluir }: { taxaId: string; descricao: string; paga: boolean; podeExcluir: boolean }) {
  const { dialog, requestConfirm } = useConfirm();
  const toast = useToast();
  const [pendente, iniciar] = useTransition();

  function alternarPagamento() {
    iniciar(async () => {
      const r = await marcarTaxaComoPaga(taxaId, !paga);
      if (r) toast.error(r.error);
    });
  }

  function excluir() {
    requestConfirm(
      { title: "Excluir esta taxa?", description: `"${descricao}" sai do processo e do custo dele.`, confirmLabel: "Excluir", destructive: true },
      async () => {
        const r = await excluirTaxa(taxaId);
        if (r) throw new Error(r.error);
      }
    );
  }

  return (
    <>
      <MenuDeMaisAcoes align="right" width={210} aria-label={`Mais ações da taxa ${descricao}`}>
        {({ close }) => (
          <>
            <ItemDoMenu
              icone={paga ? <RotateCcw /> : <CircleCheck />}
              disabled={pendente}
              onClick={() => {
                close();
                alternarPagamento();
              }}
            >
              {paga ? "Desmarcar pagamento" : "Marcar como paga hoje"}
            </ItemDoMenu>
            {podeExcluir && !paga && (
              <ItemDoMenu
                icone={<Trash2 />}
                danger
                onClick={() => {
                  close();
                  excluir();
                }}
              >
                Excluir
              </ItemDoMenu>
            )}
          </>
        )}
      </MenuDeMaisAcoes>
      {dialog}
    </>
  );
}
