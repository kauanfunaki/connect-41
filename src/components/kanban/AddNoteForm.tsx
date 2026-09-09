"use client";

import { useActionState, useRef } from "react";
import type { PipelineState } from "@/app/(app)/kanban/actions";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";

type Props = {
  action: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
};

export function AddNoteForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(form) => {
        formAction(form);
        formRef.current?.reset();
      }}
      className="space-y-2"
    >
      {state?.error && (
        <p className="text-[12px] text-danger">{state.error}</p>
      )}
      <Textarea
        name="content"
        required
        rows={2}
        placeholder="Adicionar uma nota…"
      />
      <Button
        variant="primary"
        size="sm"
        type="submit"
        disabled={isPending}
      >
        {isPending ? "Salvando…" : "Adicionar nota"}
      </Button>
    </form>
  );
}
