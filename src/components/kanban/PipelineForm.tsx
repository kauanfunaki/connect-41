"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { PipelineState } from "@/app/(app)/kanban/actions";
import { CampoForm as Field } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

const DEFAULT_COLORS = ["#586577", "#2E6FB8", "#C8860D", "#1E8E5A", "#C5374B"];

type Stage = { name: string; color: string };

type Props = {
  action: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
  sectorOptions: { value: string; label: string }[];
};

export function PipelineForm({ action, sectorOptions }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [stages, setStages] = useState<Stage[]>([
    { name: "", color: DEFAULT_COLORS[0] },
    { name: "", color: DEFAULT_COLORS[1] },
  ]);

  function updateStage(i: number, field: keyof Stage, value: string) {
    setStages((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  }

  function addStage() {
    setStages((prev) => [
      ...prev,
      { name: "", color: DEFAULT_COLORS[prev.length % DEFAULT_COLORS.length] },
    ]);
  }

  function removeStage(i: number) {
    setStages((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <form action={formAction} className="space-y-6">
      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Nome do Kanban" htmlFor="name" required>
          <Input
            id="name"
            name="name"
            type="text"
            required
            placeholder="Ex: Funil de Vagas"
          />
        </Field>
        <Field label="Setor" htmlFor="sectorCode" required>
          <Select id="sectorCode" name="sectorCode" required>
            <option value="">Selecionar…</option>
            {sectorOptions.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Tipo de Entidade" htmlFor="entityType" required>
        <Select id="entityType" name="entityType" required defaultValue="COMPANY">
          <option value="COMPANY">Empresas</option>
          <option value="PERSON">Pessoas</option>
        </Select>
      </Field>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider">
            Estágios
          </h3>
          <button
            type="button"
            onClick={addStage}
            className="text-[12px] text-brand hover:underline"
          >
            + Adicionar estágio
          </button>
        </div>

        <div className="space-y-2">
          {stages.map((stage, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="color"
                name="stageColor"
                value={stage.color}
                onChange={(e) => updateStage(i, "color", e.target.value)}
                className="w-9 h-9 rounded-md border border-border bg-canvas cursor-pointer flex-shrink-0"
              />
              <div className="flex-1">
                <Input
                  type="text"
                  name="stageName"
                  value={stage.name}
                  onChange={(e) => updateStage(i, "name", e.target.value)}
                  placeholder={`Estágio ${i + 1}`}
                />
              </div>
              {stages.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeStage(i)}
                  className="h-9 px-3 rounded-md border border-border text-[12px] text-fg-muted hover:text-danger hover:border-danger/30 transition-colors flex-shrink-0"
                >
                  Remover
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-5 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Criando…" : "Criar Kanban"}
        </button>
        <Link
          href="/kanban"
          className="h-9 px-4 rounded-md border border-border text-[13px] text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors inline-flex items-center"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
