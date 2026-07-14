"use client";

import { useState } from "react";
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
      <button
        type="button"
        disabled={!personId}
        onClick={() => router.push(`/avaliacoes/${cycleId}/avaliar/${personId}`)}
        className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
      >
        Avaliar Colaborador
      </button>
    </div>
  );
}
