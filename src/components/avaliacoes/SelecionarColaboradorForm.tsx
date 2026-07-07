"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
      <div className="space-y-1.5 flex-1">
        <label htmlFor="personId" className="block text-[12px] font-medium text-fg">Colaborador</label>
        <select
          id="personId"
          value={personId}
          onChange={(e) => setPersonId(e.target.value)}
          className="w-full h-9 px-3 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition-colors"
        >
          <option value="">Selecione</option>
          {colaboradores.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
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
