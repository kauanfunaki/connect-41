"use client";

import { useRef, useState, useTransition } from "react";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import type { PipelineState } from "@/app/(app)/kanban/actions";

type Props = {
  canAct: boolean;
  description: string | null;
  action: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
};

// Mesma classe usada dentro do RichTextEditor (src/components/ui/RichTextEditor.tsx)
// pra renderização e edição terem a mesma tipografia de listas/títulos.
const RICH_TEXT_CLASS =
  "text-[length:var(--fs-body)] text-fg-secondary [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_h2]:text-[15px] [&_h2]:font-semibold [&_h2]:mt-2 [&_p]:my-1";

// Seção "Descrição / Detalhes" da coluna esquerda — clique para editar, com
// formatação rica (negrito, títulos, listas) via Tiptap. O HTML é sanitizado
// no servidor (src/lib/clientDocuments.ts, mesma allowlist do módulo de
// Documentos para Cliente) antes de ser persistido.
export function DescriptionEditor({ canAct, description, action }: Props) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function openEditing() {
    setError(null);
    setEditing(true);
  }

  function save() {
    if (!formRef.current) return;
    setError(null);
    const form = new FormData(formRef.current);
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
          <div className={RICH_TEXT_CLASS} dangerouslySetInnerHTML={{ __html: description }} />
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
        <form ref={formRef} className="space-y-2">
          {error && <p className="text-[12px] text-danger">{error}</p>}
          <RichTextEditor name="description" defaultValue={description ?? ""} />
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
        </form>
      ) : description ? (
        <div
          onClick={openEditing}
          className={`${RICH_TEXT_CLASS} cursor-text hover:bg-surface-hover rounded-md -mx-1 px-1 py-0.5 transition-colors`}
          dangerouslySetInnerHTML={{ __html: description }}
        />
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
