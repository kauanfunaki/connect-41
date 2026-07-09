"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { ImportFeriadosResult } from "@/app/(app)/admin/feriados/actions";

type Props = {
  action: (year: number) => Promise<ImportFeriadosResult>;
};

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = [CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1];

// Importa só feriados nacionais (via BrasilAPI, gratuita) — estaduais/municipais
// continuam cadastrados manualmente pelo formulário ao lado.
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

  return (
    <div className="flex items-center gap-2 mb-2">
      <select
        value={year}
        onChange={(e) => setYear(Number(e.target.value))}
        disabled={pending}
        className="h-9 px-2 rounded-md border border-border bg-canvas text-[12px] text-fg outline-none focus:border-brand disabled:opacity-60"
      >
        {YEAR_OPTIONS.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <button
        type="button"
        onClick={handleImport}
        disabled={pending}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border text-[12.5px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-2 disabled:opacity-60 transition-colors"
      >
        <RefreshCw size={13} className={pending ? "animate-spin" : ""} />
        {pending ? "Importando…" : "Importar feriados nacionais"}
      </button>
    </div>
  );
}
