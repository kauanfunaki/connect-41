"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { atualizarProposta } from "@/app/(app)/valora/actions";

type Proposta = {
  id: string;
  status: string;
  motivo: string | null;
  precoOferecido: number | null;
  precoConcorrente: number | null;
};

const texto = (n: number | null) => (n === null ? "" : n.toFixed(2).replace(".", ","));

/** Fechou ou perdeu, por quê e por quanto — é o registro que vira comparação com o mercado. */
export function EditarProposta({ proposta }: { proposta: Proposta }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  if (!aberto) {
    return (
      <Button variant="linkMuted" size="xs" className="text-[11px]" onClick={() => setAberto(true)}>
        Registrar retorno
      </Button>
    );
  }

  return (
    <form
      className="flex flex-col gap-2 min-w-[240px]"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setErro(null);
        startTransition(async () => {
          const r = await atualizarProposta({
            id: proposta.id,
            status: f.get("status"),
            motivo: f.get("motivo"),
            precoOferecido: f.get("precoOferecido"),
            precoConcorrente: f.get("precoConcorrente"),
          });
          if ("error" in r) setErro(r.error);
          else setAberto(false);
        });
      }}
    >
      <Select compact name="status" defaultValue={proposta.status}>
        <option value="ABERTA">Em aberto</option>
        <option value="GANHA">Ganha</option>
        <option value="PERDIDA">Perdida</option>
      </Select>
      <Input compact name="precoOferecido" prefix="R$" inputMode="decimal" defaultValue={texto(proposta.precoOferecido)} placeholder="Oferecido" />
      <Input compact name="precoConcorrente" prefix="R$" inputMode="decimal" defaultValue={texto(proposta.precoConcorrente)} placeholder="Preço do concorrente" />
      <Input compact name="motivo" maxLength={500} defaultValue={proposta.motivo ?? ""} placeholder="Motivo (fechou por…, perdeu para…)" />
      <div className="flex items-center gap-2">
        <Button type="submit" size="xs" disabled={pendente}>
          Salvar
        </Button>
        <Button variant="linkMuted" size="xs" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
      {erro && <span className="text-[12px] text-danger">{erro}</span>}
    </form>
  );
}
