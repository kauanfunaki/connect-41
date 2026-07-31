"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";

type PersonOption = { id: string; name: string };

type Props = {
  cycleId: string;
  colaboradores: PersonOption[];
};

export function SelecionarColaboradorForm({ cycleId, colaboradores }: Props) {
  const router = useRouter();
  const [personId, setPersonId] = useState("");

  return (
    <div className="border-t border-border pt-4 flex items-end gap-3">
      <div className="flex-1">
        <CampoForm label="Colaborador" htmlFor="personId">
          <Select
            id="personId"
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
          >
            <option value="">Selecione</option>
            {colaboradores.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </CampoForm>
      </div>
      <Button
        type="button"
        disabled={!personId}
        onClick={() => router.push(`/avaliacoes/${cycleId}/avaliar/${personId}`)}
        variant="primary" className="font-medium disabled:opacity-60"
      >
        Avaliar Colaborador
     </Button>
    </div>
  );
}
