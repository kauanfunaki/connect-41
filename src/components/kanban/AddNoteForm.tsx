"use client";

import { useActionState, useRef } from "react";
import type { PipelineState } from "@/app/(app)/kanban/actions";
import { Textarea } from "@/components/ui/Textarea";

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
      <button
        type="submit"
        disabled={isPending}
        className="h-8 px-3 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
      >
        {isPending ? "Salvando…" : "Adicionar nota"}
      </button>
    </form>
  );
}
