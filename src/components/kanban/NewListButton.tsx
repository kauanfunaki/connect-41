"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import type { PipelineState } from "@/app/(app)/kanban/actions";

type Props = {
  action: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
};

// "Nova lista" — só nome é obrigatório; descrição fica escondida atrás de
// "+ descrição" (revelada sob demanda, igual ao pedido). Ação redireciona pro
// board da lista nova em caso de sucesso — não precisa fechar o modal na mão.
export function NewListButton({ action }: Props) {
  const [open, setOpen] = useState(false);
  const [showDescription, setShowDescription] = useState(false);
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        variant="primary"
      >
        <Plus size={14} /> Nova lista
     </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nova lista">
        <form action={formAction} className="space-y-4">
          <CampoForm label="Nome" htmlFor="list-name" required>
            <Input id="list-name" name="name" required autoFocus placeholder="ex: Empresa X" />
          </CampoForm>
          {showDescription ? (
            <CampoForm label="Descrição" htmlFor="list-description">
              <Textarea id="list-description" name="description" rows={3} placeholder="Opcional" autoFocus />
            </CampoForm>
          ) : (
            // Era texto solto (30/09): abre um campo, então é botão.
            <Button variant="secondary" size="xs" type="button" onClick={() => setShowDescription(true)}>
              <Plus size={12} /> descrição
            </Button>
          )}
          {state?.error && <p className="text-[length:var(--fs-helper)] font-medium text-danger">{state.error}</p>}
          {/* Rodapé de modal no padrão (30/09): Cancelar e Criar à direita,
              com divisor — era um "Criar" de largura inteira, sem Cancelar. */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" disabled={isPending}>
              {isPending ? "Criando…" : "Criar"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
