"use client";

import { useActionState, useRef } from "react";
import type { PipelineState } from "@/app/(app)/pipelines/actions";

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
      <textarea
        name="content"
        required
        rows={2}
        placeholder="Adicionar uma nota…"
        className="w-full px-3 py-2 rounded-md border border-border bg-canvas text-[13px] text-fg placeholder:text-fg-muted outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors resize-none"
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
