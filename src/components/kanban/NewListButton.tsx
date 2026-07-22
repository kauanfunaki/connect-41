"use client";

import { useActionState, useState } from "react";
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
      >
        <Plus size={14} /> Nova lista
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nova lista">
        <form action={formAction} className="space-y-3">
          <CampoForm label="Nome" htmlFor="list-name" required>
            <Input id="list-name" name="name" required autoFocus placeholder="ex: Empresa X" />
          </CampoForm>
          {showDescription ? (
            <CampoForm label="Descrição" htmlFor="list-description">
              <Textarea id="list-description" name="description" rows={3} placeholder="Opcional" autoFocus />
            </CampoForm>
          ) : (
            <button
              type="button"
              onClick={() => setShowDescription(true)}
              className="text-[12px] text-fg-muted hover:text-fg transition-colors"
            >
              + descrição
            </button>
          )}
          {state?.error && <p className="text-[12px] text-danger">{state.error}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="w-full h-9 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
          >
            {isPending ? "Criando…" : "Criar"}
          </button>
        </form>
      </Modal>
    </>
  );
}
