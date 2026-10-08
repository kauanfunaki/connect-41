"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { ScorecardState } from "@/app/(app)/vagas/[id]/candidaturas/[candidaturaId]/actions";
import { CRITERIA } from "@/lib/scorecard";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";

type Defaults = {
  comunicacao: number | null;
  tecnico: number | null;
  fitCultural: number | null;
  experiencia: number | null;
  recommendation: string;
  notes: string | null;
};

type Props = {
  action: (prev: ScorecardState, form: FormData) => Promise<ScorecardState>;
  defaults?: Defaults;
};

const SCORE_OPTIONS = [1, 2, 3, 4, 5];

// As quatro notas numa linha só no desktop, e a recomendação na mesma
// grade, embaixo da primeira: um select de 1 a 5 não precisa de meia tela.
export function ScorecardForm({ action, defaults }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
      <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-4">
        {CRITERIA.map((c) => (
          <CampoForm key={c.key} label={c.label} htmlFor={c.key}>
            <Select id={c.key} name={c.key} defaultValue={defaults?.[c.key]?.toString() ?? ""}>
              <option value="">Não avaliar</option>
              {SCORE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
          </CampoForm>
        ))}
        <CampoForm label="Recomendação" htmlFor="recommendation" required>
          <Select id="recommendation" name="recommendation" defaultValue={defaults?.recommendation ?? "TALVEZ"}>
            <option value="AVANCAR">Avançar</option>
            <option value="TALVEZ">Talvez</option>
            <option value="REPROVAR">Reprovar</option>
          </Select>
        </CampoForm>
      </FieldGrid>

      <CampoForm label="Observações" htmlFor="notes">
        <Textarea id="notes" name="notes" rows={3} defaultValue={defaults?.notes ?? ""} placeholder="Pontos fortes, ressalvas, contexto da entrevista…" />
      </CampoForm>

      {state?.error && <p className="text-[length:var(--fs-ui)] text-danger">{state.error}</p>}

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Salvando…" : defaults ? "Atualizar meu parecer" : "Salvar parecer"}
        </Button>
      </div>
    </form>
  );
}
