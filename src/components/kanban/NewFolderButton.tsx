"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FolderPlus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import type { PipelineState } from "@/app/(app)/kanban/actions";
import { Button } from "@/components/ui/Button";

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
      <Button
        variant="secondary"
        type="button"
        onClick={() => setOpen(true)}
      >
        <FolderPlus size={14} /> Nova pasta
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Nova pasta">
        <form action={(form) => { submitted.current = true; formAction(form); }} className="space-y-3">
          <CampoForm label="Nome" htmlFor="folder-name" required>
            <Input id="folder-name" name="name" required autoFocus placeholder="ex: Financeiro" />
          </CampoForm>
          {state?.error && <p className="text-[12px] text-danger">{state.error}</p>}
          <Button
            variant="primary"
            type="submit"
            disabled={isPending}
            className="w-full"
          >
            {isPending ? "Criando…" : "Criar"}
          </Button>
        </form>
      </Modal>
    </>
  );
}
