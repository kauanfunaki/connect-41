"use client";

import { useState, useTransition } from "react";
import { Textarea } from "@/components/ui/Textarea";
import type { PipelineState } from "@/app/(app)/kanban/actions";

type Props = {
  canAct: boolean;
  description: string | null;
  action: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
};

// Seção "Descrição / Detalhes" da coluna esquerda — clique para editar,
// estado vazio com call-to-action quando o card ainda não tem descrição.
export function DescriptionEditor({ canAct, description, action }: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openEditing() {
    setValue(description ?? "");
    setError(null);
    setEditing(true);
  }

  function save() {
    setError(null);
    const form = new FormData();
    form.set("description", value);
    startTransition(async () => {
      const res = await action(null, form);
      if (res?.error) setError(res.error);
      else setEditing(false);
    });
  }

  if (!canAct) {
    return (
      <div className="bg-surface border border-border rounded-lg p-5">
        <h2 className="text-[13px] font-semibold text-fg mb-3">Descrição</h2>
        {description ? (
          <p className="text-[length:var(--fs-body)] text-fg-secondary whitespace-pre-wrap">{description}</p>
        ) : (
          <p className="text-[length:var(--fs-body)] text-fg-muted italic">Nenhuma descrição adicionada.</p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[13px] font-semibold text-fg">Descrição</h2>
        {!editing && (
          <button
            type="button"
            onClick={openEditing}
            className="h-7 px-2.5 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors"
          >
            Editar
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          {error && <p className="text-[12px] text-danger">{error}</p>}
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={5}
            placeholder="Adicione uma descrição para este card..."
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="h-8 px-3 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
            >
              {isPending ? "Salvando…" : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={isPending}
              className="h-8 px-3 rounded-md border border-border text-[12px] text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : description ? (
        <p
          onClick={openEditing}
          className="text-[length:var(--fs-body)] text-fg-secondary whitespace-pre-wrap cursor-text hover:bg-surface-hover rounded-md -mx-1 px-1 py-0.5 transition-colors"
        >
          {description}
        </p>
      ) : (
        <button
          type="button"
          onClick={openEditing}
          className="text-[length:var(--fs-body)] text-fg-muted italic hover:text-fg-secondary transition-colors"
        >
          Adicionar uma descrição...
        </button>
      )}
    </div>
  );
}
