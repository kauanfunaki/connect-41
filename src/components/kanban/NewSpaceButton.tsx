"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import type { PipelineState } from "@/app/(app)/kanban/actions";

type Props = {
  action: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
  label?: string;
};

export function NewSpaceButton({ action, label = "+ Novo Espaço" }: Props) {
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
      >
        <Plus size={14} /> {label}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={label.replace("+ ", "")}>
        <form
          action={(form) => {
            submitted.current = true;
            formAction(form);
          }}
          className="space-y-3"
        >
          <CampoForm label="Nome" htmlFor="space-name" required>
            <Input id="space-name" name="name" required autoFocus placeholder="ex: BLD" />
          </CampoForm>
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
