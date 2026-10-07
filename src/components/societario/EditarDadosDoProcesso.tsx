"use client";

import { useActionState, useState } from "react";
import { Pencil } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { atualizarDadosDoProcesso, type ProcessoState } from "@/app/(app)/processos/actions";
import { CamposDoProcesso, type ValoresDoProcesso } from "./CamposDoProcesso";
import { FormFooter } from "@/components/ui/FormFooter";

type Props = {
  processoId: string;
  responsaveis: { id: string; name: string }[];
  valores: ValoresDoProcesso;
};

export function EditarDadosDoProcesso({ processoId, responsaveis, valores }: Props) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setAberto(true)}>
        <Pencil size={14} /> Editar dados
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
        <p className="text-[length:var(--fs-ui)] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{estado.error}</p>
      )}

      <FormFooter
        pending={isPending}
        onCancel={onFechar}
      />
    </form>
  );
}
