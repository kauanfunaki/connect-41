"use client";

import { useActionState, useState } from "react";
import { Copy } from "lucide-react";
import { Dropdown } from "@/components/ui/Dropdown";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";
import type { PipelineState } from "@/app/(app)/kanban/actions";
import { Button } from "@/components/ui/Button";

type Tipo = "COMPANY" | "PERSON";

type Props = {
  action: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
  /** De que tipo é a entidade do quadro; a busca é nesse tipo. */
  entityType: Tipo;
  /**
   * A busca no servidor (13/11/2026, melhoria-662): era um `<select>` com
   * todas as empresas ou pessoas do escritório no HTML de todo quadro.
   */
  buscar: (tipo: Tipo, termo: string, incluir: string[]) => Promise<{ opcoes: Opcao[]; incluidas: Opcao[] }>;
  entityLabel: string; // "Empresa" ou "Pessoa"
  defaultName: string;
};

// Duplica o Pipeline inteiro (estágios + tarefas + subtarefas + checklist)
// pra outra empresa/pessoa — usado pra transformar um kanban template (ex.
// "Implantação - Cliente Novo") num processo real por cliente, sem recriar
// tudo manualmente a cada novo cliente.
export function DuplicatePipelineButton({ action, entityType, buscar, entityLabel, defaultName }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  // O botão espera a escolha: o campo de busca não é um <select required>.
  const [entityId, setEntityId] = useState("");

  return (
    <Dropdown
      align="right"
      width={280}
      trigger={({ open, toggle }) => (
        <Button
          variant="secondary"
          type="button"
          onClick={toggle}
          aria-expanded={open}
        >
          <Copy size={14} /> Duplicar
        </Button>
      )}
    >
      <form action={formAction} className="space-y-3">
        <p className="text-helper text-fg-muted">
          Cria uma tarefa nova com os mesmos estágios, atividades, subatividades e checklist — prazos e responsáveis ficam em branco.
        </p>
        <CampoForm label="Nome da nova tarefa" htmlFor="dup-name" required>
          <Input id="dup-name" name="name" required defaultValue={defaultName} />
        </CampoForm>
        <CampoForm label={entityLabel} htmlFor="dup-entity" required>
          <SearchableSelect
            id="dup-entity"
            name="entityId"
            options={[]}
            buscar={(termo, incluir) => buscar(entityType, termo, incluir)}
            onChange={setEntityId}
            avatar
            textoSemValor="Selecione…"
            placeholder={entityType === "COMPANY" ? "Buscar empresa…" : "Buscar pessoa…"}
            lembrarRecentes={entityType === "COMPANY" ? "empresas" : undefined}
          />
        </CampoForm>
        {state?.error && <p className="text-helper font-medium text-danger">{state.error}</p>}
        <Button
          variant="primary"
          type="submit"
          disabled={isPending || !entityId}
          className="w-full"
        >
          {isPending ? "Duplicando…" : "Duplicar"}
        </Button>
      </form>
    </Dropdown>
  );
}
