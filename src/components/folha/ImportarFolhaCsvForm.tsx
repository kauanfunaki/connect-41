"use client";

import { useActionState } from "react";
import type { ImportPayrollCsvState } from "@/app/(app)/empresas/[id]/folha/[competencyId]/actions";

type Props = {
  action: (prev: ImportPayrollCsvState, form: FormData) => Promise<ImportPayrollCsvState>;
};

const TEMPLATE_HEADERS = [
  "CPF",
  "Salário Bruto",
  "Dias Trabalhados",
  "Faltas",
  "Dias de Afastamento",
  "Dias de Férias",
  "Horas Extras",
  "13º Salário",
  "Salário Família",
  "Adicional Noturno",
  "Periculosidade",
  "Insalubridade",
  "Benefícios",
  "Descontos",
  "Observações",
];

const TEMPLATE_URL = `data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_HEADERS.join(";") + "\n")}`;

export function ImportarFolhaCsvForm({ action }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <div className="border-t border-border pt-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[13px] font-medium text-fg">Importar via CSV</h3>
        <a
          href={TEMPLATE_URL}
          download="modelo-folha.csv"
          className="text-[12px] text-brand hover:underline"
        >
          Baixar modelo
        </a>
      </div>
      <p className="text-[12px] text-fg-muted mb-3">
        Colunas obrigatórias: <strong>CPF</strong> e <strong>Salário Bruto</strong>. As demais são opcionais.
        O CPF é usado para casar cada linha com um colaborador já cadastrado nesta empresa.
      </p>
      <form action={formAction} className="flex items-end gap-3 flex-wrap">
        <div className="space-y-1.5">
          <label htmlFor="folha-csv-file" className="block text-[length:var(--fs-label)] font-medium text-fg">
            Arquivo CSV
          </label>
          <input
            id="folha-csv-file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="text-[12px] text-fg file:mr-3 file:h-9 file:px-3 file:rounded-[10px] file:border file:border-border-strong file:bg-surface-hover file:text-fg file:text-[12px] file:font-medium file:cursor-pointer file:border-solid hover:file:border-brand file:transition-colors"
          />
        </div>
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Importando…" : "Importar"}
        </button>
      </form>

      {state && "error" in state && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2 mt-3">
          {state.error}
        </p>
      )}

      {state && "success" in state && (
        <div className="mt-3 bg-surface-2 border border-border rounded-md px-3 py-2">
          <p className="text-[13px] text-fg">
            {state.imported} lançamento{state.imported !== 1 ? "s" : ""} importado{state.imported !== 1 ? "s" : ""}
            {state.skipped.length > 0 && `, ${state.skipped.length} ignorado${state.skipped.length !== 1 ? "s" : ""}`}.
          </p>
          {state.skipped.length > 0 && (
            <ul className="mt-2 space-y-1">
              {state.skipped.map((s, idx) => (
                <li key={idx} className="text-[12px] text-fg-muted">
                  Linha {s.row}: {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
