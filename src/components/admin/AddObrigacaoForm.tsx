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

export function AddObrigacaoForm({ action, companies, pipelines, users }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [pipelineId, setPipelineId] = useState("");
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
        <CampoForm label="Dia do mês" htmlFor="dayOfMonth" required>
          <Input id="dayOfMonth" name="dayOfMonth" type="number" min={1} max={31} required placeholder="ex: 20" />
        </CampoForm>
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
          {selected
            ? `Todo mês nasce um item no kanban "${selected.name}" (${selected.sectorLabel}); vencimento cai no próximo dia útil quando o dia bate em fim de semana ou feriado.`
            : "Todo mês nasce um item no kanban escolhido; vencimento prorroga para o próximo dia útil."}
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
