"use client";

import { useActionState, useId, useState } from "react";
import { ChevronDown, FolderPlus, ListPlus, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Popover, ItemDoMenu } from "@/components/ui/Popover";
import { Modal } from "@/components/ui/Modal";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FormFooter } from "@/components/ui/FormFooter";
import type { PipelineState } from "@/app/(app)/kanban/actions";

export type EspacoParaCriar = {
  id: string;
  name: string;
  /** Quem pode criar lista neste espaço (a permissão `editar`). */
  podeCriarLista: boolean;
  /** Quem pode criar pasta neste espaço (a permissão `criarPasta`). */
  podeCriarPasta: boolean;
  pastas: { id: string; name: string }[];
};

type Acao = (prev: PipelineState, form: FormData) => Promise<PipelineState>;

/**
 * O "+ Criar" da tela de Quadros (05/11/2026, como no ClickUp): cria lista ou
 * pasta sem entrar no espaço antes. A janela pede o nome e onde fica — só os
 * espaços em que quem está criando tem permissão aparecem.
 */
export function CriarNosQuadros({
  espacos,
  criarLista,
  criarPasta,
}: {
  espacos: EspacoParaCriar[];
  criarLista: Acao;
  criarPasta: Acao;
}) {
  const [janela, setJanela] = useState<"lista" | "pasta" | null>(null);
  const paraLista = espacos.filter((e) => e.podeCriarLista);
  const paraPasta = espacos.filter((e) => e.podeCriarPasta);
  if (paraLista.length === 0 && paraPasta.length === 0) return null;

  return (
    <>
      <Popover
        aria-label="Criar"
        align="right"
        width={280}
        trigger={({ open, toggle }) => (
          <Button type="button" variant="secondary" onClick={toggle} aria-expanded={open}>
            <Plus size={14} /> Criar <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </Button>
        )}
      >
        {({ close }) => (
          <div className="p-1.5">
            {paraLista.length > 0 && (
              <ItemDoMenu
                icone={<ListPlus />}
                descricao="Tarefas com colunas, num espaço ou numa pasta."
                onClick={() => {
                  close();
                  setJanela("lista");
                }}
              >
                Lista
              </ItemDoMenu>
            )}
            {paraPasta.length > 0 && (
              <ItemDoMenu
                icone={<FolderPlus />}
                descricao="Agrupa listas dentro de um espaço."
                onClick={() => {
                  close();
                  setJanela("pasta");
                }}
              >
                Pasta
              </ItemDoMenu>
            )}
          </div>
        )}
      </Popover>

      <Modal open={janela === "lista"} onClose={() => setJanela(null)} title="Criar lista">
        {janela === "lista" && <FormularioDaLista espacos={paraLista} action={criarLista} onCancelar={() => setJanela(null)} />}
      </Modal>
      <Modal open={janela === "pasta"} onClose={() => setJanela(null)} title="Criar pasta">
        {janela === "pasta" && <FormularioDaPasta espacos={paraPasta} action={criarPasta} onCancelar={() => setJanela(null)} />}
      </Modal>
    </>
  );
}

// As duas janelas levam à lista ou à pasta criada (redirect na ação), então só
// o erro volta para cá.

function FormularioDaLista({ espacos, action, onCancelar }: { espacos: EspacoParaCriar[]; action: Acao; onCancelar: () => void }) {
  const id = useId();
  const [state, formAction, isPending] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-4">
      <CampoForm label="Nome" htmlFor={`${id}nome`} required>
        <Input id={`${id}nome`} name="name" required autoFocus maxLength={120} placeholder="ex.: Apuração de impostos" />
      </CampoForm>
      <CampoForm
        label="Localização"
        htmlFor={`${id}local`}
        required
        helper="Num espaço ou numa pasta dele. A lista nasce com as colunas A fazer, Em andamento, Aguardando cliente e Concluído."
      >
        <Select id={`${id}local`} name="local" required defaultValue={espacos[0]?.id}>
          {espacos.map((e) =>
            e.pastas.length === 0 ? (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ) : (
              <optgroup key={e.id} label={e.name}>
                <option value={e.id}>{e.name} (fora das pastas)</option>
                {e.pastas.map((p) => (
                  <option key={p.id} value={`${e.id}/${p.id}`}>
                    {e.name} › {p.name}
                  </option>
                ))}
              </optgroup>
            ),
          )}
        </Select>
      </CampoForm>
      {state?.error && (
        <p role="alert" className="text-helper font-medium text-danger">
          {state.error}
        </p>
      )}
      <FormFooter pending={isPending} pendingLabel="Criando…" submitLabel="Criar lista" onCancel={onCancelar} />
    </form>
  );
}

function FormularioDaPasta({ espacos, action, onCancelar }: { espacos: EspacoParaCriar[]; action: Acao; onCancelar: () => void }) {
  const id = useId();
  const [state, formAction, isPending] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-4">
      <CampoForm label="Nome" htmlFor={`${id}nome`} required>
        <Input id={`${id}nome`} name="name" required autoFocus maxLength={80} placeholder="ex.: Clientes do Simples" />
      </CampoForm>
      <CampoForm label="Espaço" htmlFor={`${id}espaco`} required>
        <Select id={`${id}espaco`} name="spaceId" required defaultValue={espacos[0]?.id}>
          {espacos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </Select>
      </CampoForm>
      {state?.error && (
        <p role="alert" className="text-helper font-medium text-danger">
          {state.error}
        </p>
      )}
      <FormFooter pending={isPending} pendingLabel="Criando…" submitLabel="Criar pasta" onCancel={onCancelar} />
    </form>
  );
}
