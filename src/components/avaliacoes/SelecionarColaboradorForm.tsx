"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useRouter } from "next/navigation";
import { CampoForm, AlinhadoAoCampo } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { SearchableSelect } from "@/components/shared/SearchableSelect";

type PersonOption = { id: string; name: string };

type Props = {
  cycleId: string;
  colaboradores: PersonOption[];
};

export function SelecionarColaboradorForm({ cycleId, colaboradores }: Props) {
  const router = useRouter();
  const [personId, setPersonId] = useState("");

  return (
    <div className="border-t border-border pt-4 space-y-3">
      {/* Bloco do "novo" com nome, acima do campo (5A, 08/10/2026). */}
      <h3 className="c41-rotulo">Nova avaliação</h3>
      {/* Era um flex sem quebra: no celular o botão espremia a busca. */}
      <FieldGrid columns="sm:grid-cols-[minmax(0,1fr)_auto]" className="max-w-xl">
        <CampoForm label="Colaborador" htmlFor="personId">
          <SearchableSelect
            id="personId"
            name="personId"
            defaultValue={personId}
            onChange={setPersonId}
            options={colaboradores.map((p) => ({ value: p.id, label: p.name }))}
            placeholder="Buscar colaborador…"
          />
        </CampoForm>
        <AlinhadoAoCampo>
          <Button
            type="button"
            disabled={!personId}
            onClick={() => router.push(`/avaliacoes/${cycleId}/avaliar/${personId}`)}
          >
            Avaliar Colaborador
          </Button>
        </AlinhadoAoCampo>
      </FieldGrid>
    </div>
  );
}
