"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import type { PipelineState } from "@/app/(app)/kanban/actions";
import { FormFooter } from "@/components/ui/FormFooter";

type Props = {
  action: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
  label?: string;
};

// O "+" vem do ícone <Plus>, nunca do texto — o label default carregava um
// "+ " que somava com o ícone e renderizava "＋ + Novo Espaço".
export function NewSpaceButton({ action, label = "Novo Espaço" }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(action, null);
  const submitted = useRef(false);

  useEffect(() => {
    if (submitted.current && !isPending && !state?.error) {
      submitted.current = false;
      setOpen(false);
    }
  }, [isPending, state]);

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        variant="primary"
      >
        <Plus size={14} /> {label}
     </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={label}>
        <form
          action={(form) => {
            submitted.current = true;
            formAction(form);
          }}
          className="space-y-4"
        >
          <CampoForm label="Nome" htmlFor="space-name" required>
            <Input id="space-name" name="name" required autoFocus placeholder="ex: BLD" />
          </CampoForm>
          {state?.error && <p className="text-[length:var(--fs-helper)] font-medium text-danger">{state.error}</p>}
          {/* Rodapé de modal no padrão (30/09): Cancelar e Criar à direita,
              com divisor — era um "Criar" de largura inteira, sem Cancelar. */}
          <FormFooter
            pending={isPending}
            pendingLabel="Criando…"
            submitLabel="Criar"
            onCancel={() => setOpen(false)}
          />
        </form>
      </Modal>
    </>
  );
}
