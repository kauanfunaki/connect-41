"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { atualizarDadosDoProcesso, type ProcessoState } from "@/app/(app)/processos/actions";
import { CamposDoProcesso, type ValoresDoProcesso } from "./CamposDoProcesso";

type Props = {
  processoId: string;
  responsaveis: { id: string; name: string }[];
  valores: ValoresDoProcesso;
};

export function EditarDadosDoProcesso({ processoId, responsaveis, valores }: Props) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setAberto(true)}>
        <Pencil size={13} /> Editar dados
      </Button>
      <Modal open={aberto} onClose={() => setAberto(false)} title="Dados do processo" maxWidth="max-w-lg">
        {/* Montado só quando aberto, para o formulário refletir o que está gravado agora. */}
        {aberto && (
          <Formulario
            processoId={processoId}
            responsaveis={responsaveis}
            valores={valores}
            onFechar={() => setAberto(false)}
          />
        )}
      </Modal>
    </>
  );
}

function Formulario({ processoId, responsaveis, valores, onFechar }: Props & { onFechar: () => void }) {
  const [estado, action, isPending] = useActionState(async (prev: ProcessoState, form: FormData) => {
    const r = await atualizarDadosDoProcesso(prev, form);
    if (r === null) onFechar();
    return r;
  }, null);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="processId" value={processoId} />
      <CamposDoProcesso prefixo={`editar-${processoId}`} responsaveis={responsaveis} valores={valores} />

      {estado?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{estado.error}</p>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" type="button" onClick={onFechar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </form>
  );
}
