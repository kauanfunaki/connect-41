"use client";

import { useActionState } from "react";
import { Copy } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { PipelineState } from "@/app/(app)/kanban/actions";

type EntityOption = { id: string; name: string };

type Props = {
  action: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
  entities: EntityOption[];
  entityLabel: string; // "Empresa" ou "Pessoa"
  defaultName: string;
};

// Duplica o Pipeline inteiro (estágios + tarefas + subtarefas + checklist)
// pra outra empresa/pessoa — usado pra transformar um kanban template (ex.
// "Implantação - Cliente Novo") num processo real por cliente, sem recriar
// tudo manualmente a cada novo cliente.
export function DuplicatePipelineButton({ action, entities, entityLabel, defaultName }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <Dropdown
      align="right"
      width={280}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border text-[13px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors"
        >
          <Copy size={14} /> Duplicar
        </button>
      )}
    >
      <form action={formAction} className="space-y-3">
        <p className="text-[12px] text-fg-muted">
          Cria um kanban novo com os mesmos estágios, tarefas, subtarefas e checklist — prazos e responsáveis ficam em branco.
        </p>
        <CampoForm label="Nome do novo kanban" htmlFor="dup-name" required>
          <Input id="dup-name" name="name" required defaultValue={defaultName} />
        </CampoForm>
        <CampoForm label={entityLabel} htmlFor="dup-entity" required>
          <Select id="dup-entity" name="entityId" required defaultValue="">
            <option value="" disabled>Selecione…</option>
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </Select>
        </CampoForm>
        {state?.error && <p className="text-[12px] text-danger">{state.error}</p>}
        <button
          type="submit"
          disabled={isPending}
          className="w-full h-9 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Duplicando…" : "Duplicar"}
        </button>
      </form>
    </Dropdown>
  );
}
