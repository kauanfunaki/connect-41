"use client";

import { useActionState } from "react";
import { Textarea } from "@/components/ui/Textarea";
import { CampoForm as Field } from "@/components/ui/CampoForm";
import { CampoData } from "@/components/ui/CampoData";
import { AttendeePicker } from "@/components/shared/AttendeePicker";
import { Select } from "@/components/ui/Select";
import type { PipelineState } from "@/app/(app)/kanban/actions";
import type { PipelineEntityType } from "@/generated/prisma/enums";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";

type EntityOption = { id: string; name: string };
type TagOption = { id: string; name: string; color: string };
type UserOption = { id: string; name: string };

type Props = {
  action: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
  pipelineId: string;
  entityType: PipelineEntityType;
  entities: EntityOption[];
  tags?: TagOption[];
  sectorUsers?: UserOption[];
  cancelHref: string;
};

export function ItemForm({ action, pipelineId, entityType, entities, tags = [], sectorUsers = [], cancelHref }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="pipelineId" value={pipelineId} />
      <input type="hidden" name="entityType" value={entityType} />

      {state?.error && (
        <Aviso>
          {state.error}
        </Aviso>
      )}

      <Field label={entityType === "COMPANY" ? "Empresa" : "Pessoa"} htmlFor="entityId" required>
        <Select id="entityId" name="entityId" required>
          <option value="">Selecionar…</option>
          {entities.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Prazo" htmlFor="dueDate">
          <CampoData id="dueDate" name="dueDate" />
        </Field>
        <Field label="Prioridade" htmlFor="priority">
          <Select id="priority" name="priority" defaultValue="0">
            <option value="0">Normal</option>
            <option value="1">Alta</option>
            <option value="2">Urgente</option>
          </Select>
        </Field>
      </div>

      <Field label="Descrição" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          rows={3}
          placeholder="Adicione uma descrição para este card..."
        />
      </Field>

      {tags.length > 0 && (
        // Grupo com título no estilo do rótulo de campo (era um <p> de 12px).
        <fieldset className="min-w-0">
          <legend className="text-[length:var(--fs-label)] font-medium text-fg mb-1.5">Tags</legend>
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <label
                key={t.id}
                className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-border text-[12px] text-fg-secondary has-checked:border-transparent has-checked:text-fg transition-colors"
                style={{ background: "transparent" }}
              >
                <input type="checkbox" name="tags" value={t.id} className="sr-only peer" />
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: t.color }}
                />
                {t.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {/* Pesquisável, e não uma parede de checkbox: com centenas de pessoas na
          plataforma, achar uma no meio da lista deixa de ser possível. O painel
          de detalhe da tarefa já resolvia isto com busca; criar a tarefa —
          que é o caminho mais percorrido — tinha ficado para trás.

          `AttendeePicker` emite um `<input type="hidden" name="assignees">` por
          escolhido, então a action segue lendo `form.getAll("assignees")` sem
          saber que o controle mudou. */}
      {sectorUsers.length > 0 && (
        <AttendeePicker users={sectorUsers} name="assignees" label="Responsáveis" />
      )}

      {/* Rodapé no padrão dos formulários (30/09): Cancelar à esquerda do
          primário, os dois à direita, com o divisor em cima. Estava ao
          contrário e alinhado à esquerda. */}
      <FormFooter
        pending={isPending}
        pendingLabel="Adicionando…"
        submitLabel="Adicionar"
        cancelHref={cancelHref}
      />
    </form>
  );
}
