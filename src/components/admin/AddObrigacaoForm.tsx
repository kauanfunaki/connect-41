"use client";

import { useActionState, useState } from "react";
import type { ObligationState } from "@/app/(app)/admin/obrigacoes/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export type PipelineOption = { id: string; name: string; sectorCode: string; sectorLabel: string };

type Props = {
  action: (prev: ObligationState, form: FormData) => Promise<ObligationState>;
  companies: { id: string; name: string }[];
  pipelines: PipelineOption[];
  users: { id: string; name: string }[];
};

const WEEKDAYS = [
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
  { value: 7, label: "Domingo" },
];

type Frequency = "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY";

const FREQUENCY_HINTS: Record<Frequency, string> = {
  DAILY: "Gera 1 item por dia útil.",
  WEEKLY: "Gera 1 item por semana, no dia da semana escolhido.",
  BIWEEKLY: "Gera 1 item a cada 2 semanas, no dia da semana escolhido.",
  MONTHLY: "Gera 1 item por mês, no dia escolhido; vencimento prorroga para o próximo dia útil.",
};

export function AddObrigacaoForm({ action, companies, pipelines, users }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [pipelineId, setPipelineId] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("MONTHLY");
  const selected = pipelines.find((p) => p.id === pipelineId);

  return (
    <form action={formAction} className="bg-surface border border-border rounded-lg p-4 mb-6 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <CampoForm label="Empresa" htmlFor="companyId" required>
          <Select id="companyId" name="companyId" required defaultValue="">
            <option value="" disabled>Selecione…</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Kanban de destino" htmlFor="pipelineId" required>
          <Select
            id="pipelineId"
            name="pipelineId"
            required
            value={pipelineId}
            onChange={(e) => setPipelineId(e.target.value)}
          >
            <option value="" disabled>Selecione…</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>{p.sectorLabel} — {p.name}</option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Frequência" htmlFor="frequency" required>
          <Select
            id="frequency"
            name="frequency"
            required
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as Frequency)}
          >
            <option value="MONTHLY">Mensal</option>
            <option value="WEEKLY">Semanal</option>
            <option value="BIWEEKLY">Quinzenal</option>
            <option value="DAILY">Diária</option>
          </Select>
        </CampoForm>
        {frequency === "MONTHLY" && (
          <CampoForm label="Dia do mês" htmlFor="dayOfMonth" required>
            <Input id="dayOfMonth" name="dayOfMonth" type="number" min={1} max={31} required placeholder="ex: 20" />
          </CampoForm>
        )}
        {(frequency === "WEEKLY" || frequency === "BIWEEKLY") && (
          <CampoForm label="Dia da semana" htmlFor="dayOfWeek" required>
            <Select id="dayOfWeek" name="dayOfWeek" required defaultValue="">
              <option value="" disabled>Selecione…</option>
              {WEEKDAYS.map((w) => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </Select>
          </CampoForm>
        )}
        <CampoForm label="Responsável (opcional)" htmlFor="responsibleId">
          <Select id="responsibleId" name="responsibleId" defaultValue="">
            <option value="">— Notificar o setor —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </Select>
        </CampoForm>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CampoForm label="Título da obrigação" htmlFor="title" required>
          <Input id="title" name="title" type="text" required placeholder="ex: DAS — Simples Nacional" maxLength={160} />
        </CampoForm>
        <CampoForm label="Instruções (opcional)" htmlFor="description">
          <Input id="description" name="description" type="text" placeholder="entram na descrição do item do kanban" />
        </CampoForm>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] text-fg-muted">
          {FREQUENCY_HINTS[frequency]}
          {selected ? ` Kanban: "${selected.name}" (${selected.sectorLabel}).` : ""}
        </p>
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors flex-shrink-0"
        >
          {isPending ? "Cadastrando…" : "Cadastrar Obrigação"}
        </button>
      </div>
      {state?.error && <p className="text-[13px] text-danger">{state.error}</p>}
    </form>
  );
}
