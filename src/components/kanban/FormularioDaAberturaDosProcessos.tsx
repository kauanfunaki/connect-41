"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { VALOR_DA_LISTA_PADRAO } from "@/lib/kanban/aberturaAutomatica";
import type { EstadoDaAbertura } from "@/app/(app)/setor/[code]/abertura-automatica/actions";

type Grupo = { espaco: string; listas: { id: string; nome: string }[] };

/**
 * O liga/desliga e a lista dos processos societários (27/11/2026,
 * funcionalidade-872). A lista fica escolhível com a abertura desligada: ao
 * religar, ela volta como estava.
 */
export function FormularioDaAberturaDosProcessos({
  action,
  ligada,
  pipelineId,
  grupos,
  nomeDaPadrao,
}: {
  action: (prev: EstadoDaAbertura, form: FormData) => Promise<EstadoDaAbertura>;
  ligada: boolean;
  pipelineId: string | null;
  grupos: Grupo[];
  nomeDaPadrao: string;
}) {
  const [estado, enviar, salvando] = useActionState(action, null);
  const [ativo, setAtivo] = useState(ligada);
  const [lista, setLista] = useState(pipelineId ?? VALOR_DA_LISTA_PADRAO);
  const toast = useToast();
  const mudou = ativo !== ligada || lista !== (pipelineId ?? VALOR_DA_LISTA_PADRAO);

  useEffect(() => {
    if (estado && "ok" in estado) toast.success("Abertura automática salva.");
    if (estado && "error" in estado) toast.error(estado.error);
    // `toast` muda a cada render do provedor; o efeito é do estado novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  return (
    <form action={enviar} className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="flex h-9 items-center">
        <Switch name="ativo" value="1" checked={ativo} onCheckedChange={setAtivo} rotulo={ativo ? "Ligada" : "Desligada"} />
      </div>
      <CampoForm label="Lista onde o processo vira cartão" htmlFor="lista-dos-processos" className="min-w-[16rem] flex-1 basis-72">
        <Select id="lista-dos-processos" name="lista" value={lista} onChange={(e) => setLista(e.target.value)}>
          <option value={VALOR_DA_LISTA_PADRAO}>{nomeDaPadrao} (criada pelo sistema)</option>
          {grupos.map((g) => (
            <optgroup key={g.espaco} label={g.espaco}>
              {g.listas.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </CampoForm>
      <Button type="submit" disabled={salvando || !mudou}>
        {salvando ? "Salvando…" : "Salvar"}
      </Button>
    </form>
  );
}
