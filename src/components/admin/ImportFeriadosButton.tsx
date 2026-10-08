"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { Select } from "@/components/ui/Select";
import { AlinhadoAoCampo, CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import type { ImportFeriadosResult } from "@/app/(app)/admin/feriados/actions";
import { Button } from "@/components/ui/Button";

type Props = {
  action: (year: number) => Promise<ImportFeriadosResult>;
};

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

// Importa só feriados nacionais (via BrasilAPI, gratuita) — estaduais/municipais
// continuam cadastrados um a um, no "+ Novo feriado" do cabeçalho.
export function ImportFeriadosButton({ action }: Props) {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function handleImport() {
    startTransition(async () => {
      const result = await action(year);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.imported > 0
          ? `${result.imported} feriado${result.imported !== 1 ? "s" : ""} importado${result.imported !== 1 ? "s" : ""}.`
          : "Nenhum feriado novo — já estavam todos cadastrados."
      );
    });
  }

  // Com rótulo, como os outros campos do Connect: o ano era um select sem
  // nome, um pouco acima da linha dos outros campos.
  return (
    <FieldGrid columns="sm:grid-cols-[7rem_auto]" className="sm:justify-start">
      <CampoForm label="Ano" htmlFor="ano-dos-feriados">
        <Select
          id="ano-dos-feriados"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          disabled={pending}
        >
          {YEAR_OPTIONS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </Select>
      </CampoForm>
      <AlinhadoAoCampo>
        <Button variant="secondary" onClick={handleImport} disabled={pending}>
          <RefreshCw size={14} className={pending ? "animate-spin" : ""} />
          {pending ? "Importando…" : "Importar feriados nacionais"}
        </Button>
      </AlinhadoAoCampo>
    </FieldGrid>
  );
}
