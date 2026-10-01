"use client";

import { useActionState, useState } from "react";
import type { PipelineState } from "@/app/(app)/kanban/actions";
import { CampoForm as Field } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { normalizeAccentColor } from "@/lib/color";
import { Button } from "@/components/ui/Button";

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
        <p className="text-[length:var(--fs-helper)] font-medium text-danger bg-danger-bg border border-danger/30 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      {/* Os três dados numa linha (30/09): o tipo de entidade ficava sozinho
          numa linha de largura inteira embaixo do par nome/setor. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
        <Field label="Tipo de Entidade" htmlFor="entityType" required>
          <Select id="entityType" name="entityType" required defaultValue="COMPANY">
            <option value="COMPANY">Empresas</option>
            <option value="PERSON">Pessoas</option>
          </Select>
        </Field>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          {/* Título do grupo no estilo do rótulo de campo (era 11px caixa-alta). */}
          <h3 className="text-[length:var(--fs-label)] font-medium text-fg">Estágios</h3>
          {/* Era link azul (30/09): ação é botão. */}
          <Button variant="secondary" size="xs" type="button" onClick={addStage}>
            + Adicionar estágio
          </Button>
        </div>

        <div className="space-y-2">
          {stages.map((stage, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="color"
                name="stageColor"
                value={stage.color}
                onChange={(e) => updateStage(i, "color", normalizeAccentColor(e.target.value))}
                aria-label={`Cor do estágio ${i + 1}`}
                className="w-9 h-9 rounded-md border border-border-strong bg-canvas cursor-pointer flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <Input
                  type="text"
                  aria-label={`Nome do estágio ${i + 1}`}
                  name="stageName"
                  value={stage.name}
                  onChange={(e) => updateStage(i, "name", e.target.value)}
                  placeholder={`Estágio ${i + 1}`}
                />
              </div>
              {stages.length > 1 && (
                <Button
                  variant="secondary"
                  size="md"
                  // Neutro em repouso, vermelho só no hover: numa lista de
                  // estágios, um "Remover" vermelho por estágio pintaria o
                  // formulário inteiro de alerta.
                  className="text-fg-muted hover:text-danger hover:border-danger/30 flex-shrink-0"
                  onClick={() => removeStage(i)}
                >
                  Remover
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Rodapé no padrão dos formulários (30/09): Cancelar à esquerda do
          primário, os dois à direita, com o divisor em cima. Estava ao
          contrário e alinhado à esquerda. */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
        <Button href="/kanban" variant="secondary">
          Cancelar
        </Button>
        <Button variant="primary" type="submit" disabled={isPending}>
          {isPending ? "Criando…" : "Criar Kanban"}
        </Button>
      </div>
    </form>
  );
}
