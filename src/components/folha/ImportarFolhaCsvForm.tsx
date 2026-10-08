"use client";

import { useActionState } from "react";
import { Download } from "lucide-react";
import { FileDropzoneField } from "@/components/ui/FileDropzoneField";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import type { ImportPayrollCsvState } from "@/app/(app)/empresas/[id]/folha/[competencyId]/actions";
import { Aviso } from "@/components/ui/Aviso";

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
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-ui font-medium text-fg">Importar via CSV</h3>
        {/* Revisão de 05/10: botão não é link — baixar o modelo é ação, não navegação. */}
        <Button variant="secondary" size="xs" href={TEMPLATE_URL} download="modelo-folha.csv">
          <Download size={13} />
          Baixar modelo
        </Button>
      </div>
      <p className="text-fs-2 text-fg-muted mb-3">
        Colunas obrigatórias: <strong>CPF</strong> e <strong>Salário Bruto</strong>. As demais são opcionais.
        O CPF é usado para casar cada linha com um colaborador já cadastrado nesta empresa.
      </p>
      {/* A área alta de arquivo ia lado a lado com o botão, que caía no pé
          dela (até 30/09). Agora o campo ocupa a linha, na faixa de uma
          linha, e o botão vai para o rodapé, como no "Lançar Evento". */}
      <form action={formAction} className="space-y-4">
        <CampoForm label="Arquivo CSV" htmlFor="folha-csv-file" required>
          <FileDropzoneField id="folha-csv-file" name="file" accept=".csv" maxSizeMb={10} required compacto />
        </CampoForm>
        <div className="flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Importando…" : "Importar"}
          </Button>
        </div>
      </form>

      {state && "error" in state && (
        <Aviso className="mt-3">
          {state.error}
        </Aviso>
      )}

      {state && "success" in state && (
        <div className="mt-3 bg-surface-2 border border-border rounded-md px-3 py-2">
          <p className="text-ui text-fg">
            {state.imported} lançamento{state.imported !== 1 ? "s" : ""} importado{state.imported !== 1 ? "s" : ""}
            {state.skipped.length > 0 && `, ${state.skipped.length} ignorado${state.skipped.length !== 1 ? "s" : ""}`}.
          </p>
          {state.skipped.length > 0 && (
            <ul className="mt-2 space-y-1">
              {state.skipped.map((s, idx) => (
                <li key={idx} className="text-fs-2 text-fg-muted">
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
