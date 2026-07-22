"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FolderPlus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import type { PipelineState } from "@/app/(app)/kanban/actions";

type Props = {
  action: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
};

export function NewFolderButton({ action }: Props) {
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
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border text-[13px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors"
      >
        <FolderPlus size={14} /> Nova pasta
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nova pasta">
        <form action={(form) => { submitted.current = true; formAction(form); }} className="space-y-3">
          <CampoForm label="Nome" htmlFor="folder-name" required>
            <Input id="folder-name" name="name" required autoFocus placeholder="ex: Financeiro" />
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
