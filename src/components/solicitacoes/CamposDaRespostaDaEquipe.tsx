"use client";

import { useState } from "react";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { CampoForm } from "@/components/ui/CampoForm";
import { DEPOIS_DA_RESPOSTA } from "@/lib/solicitacoes/regras";

/**
 * O que a equipe decide junto da resposta: para onde a solicitação vai, ou se
 * o texto é só uma nota interna — que não muda a situação nem chega ao cliente.
 */
export function CamposDaRespostaDaEquipe({ id }: { id: string }) {
  const [interna, setInterna] = useState(false);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
      <CampoForm label="Depois de enviar" htmlFor={`depois-${id}`} helper={interna ? "Nota interna não muda a situação." : undefined}>
        <Select id={`depois-${id}`} name="depois" defaultValue="EM_ANDAMENTO" disabled={interna}>
          {DEPOIS_DA_RESPOSTA.map((d) => (
            <option key={d.valor} value={d.valor}>
              {d.rotulo}
            </option>
          ))}
        </Select>
      </CampoForm>
      <Checkbox
        id={`interna-${id}`}
        name="interna"
        value="1"
        checked={interna}
        onChange={(e) => setInterna(e.target.checked)}
        label="Nota interna — o cliente não vê"
        className="pb-2"
      />
    </div>
  );
}
