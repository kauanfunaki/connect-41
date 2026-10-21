"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { ItemDoMenu } from "@/components/ui/Popover";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { cancelarEmissaoAction } from "@/app/(app)/emitir-nfse/actions";

/**
 * Cancelar pelo Omie (`CancelarOS`). Na nota autorizada, o Omie pede o
 * cancelamento à prefeitura; na OS que ficou no Omie sem nota (recusada no
 * faturamento), só a OS sai. O erro do Omie — prazo da prefeitura vencido, por
 * exemplo — aparece no próprio diálogo, como veio.
 */
export function CancelarEmissao({ emissaoId, naPrefeitura, rotulo }: { emissaoId: string; naPrefeitura: boolean; rotulo: string }) {
  const router = useRouter();
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function confirmar() {
    setErro(null);
    startTransition(async () => {
      const r = await cancelarEmissaoAction(emissaoId);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setAberto(false);
      toast.success(naPrefeitura ? "Cancelamento pedido à prefeitura pelo Omie." : "OS cancelada no Omie.");
      router.refresh();
    });
  }

  return (
    <>
      {/* No "⋯", em vermelho (11A, 15/10/2026): era um botão vermelho à vista
          em toda linha. Cancelar encerra a nota, e fica no menu mesmo sendo a
          única ação. */}
      <MenuDeMaisAcoes rotulo={`Mais ações da ${rotulo}`} align="right" width={200}>
        {({ close }) => (
          <ItemDoMenu
            icone={<Ban />}
            danger
            onClick={() => {
              close();
              setErro(null);
              setAberto(true);
            }}
          >
            {naPrefeitura ? "Cancelar a nota" : "Cancelar a OS"}
          </ItemDoMenu>
        )}
      </MenuDeMaisAcoes>
      <ConfirmDialog
        open={aberto}
        title={naPrefeitura ? `Cancelar a ${rotulo}?` : `Cancelar a ${rotulo} no Omie?`}
        description={
          naPrefeitura
            ? "Isto pede à prefeitura, pelo Omie, o cancelamento da nota de verdade. A prefeitura tem prazo e regras para aceitar; carta de correção não existe pela API — fica na tela do Omie."
            : "A OS ficou no Omie sem nota (o faturamento foi recusado). Isto cancela só a OS; nada foi emitido na prefeitura."
        }
        confirmLabel={naPrefeitura ? "Cancelar a nota" : "Cancelar a OS"}
        pendingLabel="Pedindo ao Omie…"
        destructive
        pending={pendente}
        error={erro}
        onConfirm={confirmar}
        onCancel={() => setAberto(false)}
      />
    </>
  );
}
