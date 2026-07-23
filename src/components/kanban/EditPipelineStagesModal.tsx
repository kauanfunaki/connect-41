"use client";

import { useState, useTransition } from "react";
import { Pencil, GripVertical, Trash2, Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { StageDot, type StageDotType } from "@/components/kanban/StageDot";
import type { EditStagesState, StageInput } from "@/app/(app)/kanban/actions";

const DEFAULT_COLORS = ["#586577", "#2E6FB8", "#C8860D", "#1E8E5A", "#C5374B"];
const TYPE_LABEL: Record<StageDotType, string> = {
  NOT_STARTED: "Não iniciado",
  IN_PROGRESS: "Em andamento",
  PENDING: "Pendente",
  DONE: "Concluído",
};

type Row = { id?: string; name: string; color: string; type: StageDotType };

type Props = {
  initialStages: { id: string; name: string; color: string; type: StageDotType }[];
  action: (stages: StageInput[]) => Promise<EditStagesState>;
};

// Botão "Editar lista" — CRUD completo de estágios (nome, cor, tipo/bolinha,
// ordem, exclusão) num modal só, reconciliado de uma vez pela action
// atualizarEstagios ao salvar.
export function EditPipelineStagesModal({ initialStages, action }: Props) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>(initialStages);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openModal() {
    setRows(initialStages);
    setError(null);
    setOpen(true);
  }

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { name: "", color: DEFAULT_COLORS[prev.length % DEFAULT_COLORS.length], type: "NOT_STARTED" }]);
  }

  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  function move(i: number, direction: "up" | "down") {
    setRows((prev) => {
      const j = direction === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function save() {
    setError(null);
    const stages: StageInput[] = rows.map((r) => ({ id: r.id, name: r.name, color: r.color, type: r.type }));
    startTransition(async () => {
      const res = await action(stages);
      if (res?.error) setError(res.error);
      else setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border text-[13px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors"
      >
        <Pencil size={14} /> Editar lista
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Editar lista" maxWidth="max-w-lg">
        <div className="space-y-3">
          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            {rows.map((row, i) => (
              <div key={row.id ?? `new-${i}`} className="flex items-center gap-2">
                <div className="flex flex-col flex-shrink-0">
                  <button type="button" disabled={i === 0} onClick={() => move(i, "up")} className="text-fg-muted hover:text-fg disabled:opacity-30 disabled:hover:text-fg-muted">
                    <GripVertical size={13} />
                  </button>
                </div>
                <input
                  type="color"
                  value={row.color}
                  onChange={(e) => update(i, { color: e.target.value })}
                  className="w-9 h-9 rounded-md border border-border bg-canvas cursor-pointer flex-shrink-0"
                />
                <Input
                  value={row.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder={`Estágio ${i + 1}`}
                  className="flex-1 min-w-0"
                />
                <Select
                  value={row.type}
                  onChange={(e) => update(i, { type: e.target.value as StageDotType })}
                  className="w-[150px] flex-shrink-0"
                >
                  {(Object.keys(TYPE_LABEL) as StageDotType[]).map((t) => (
                    <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                  ))}
                </Select>
                <StageDot color={row.color} type={row.type} />
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="text-fg-muted hover:text-danger p-1.5 flex-shrink-0"
                    aria-label="Excluir estágio"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 text-[12px] text-brand hover:underline"
          >
            <Plus size={13} /> Adicionar estágio
          </button>

          {error && <p className="text-[12px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">{error}</p>}

          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={save}
              disabled={isPending}
              className="h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
            >
              {isPending ? "Salvando…" : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-9 px-4 rounded-md border border-border text-[13px] text-fg-muted hover:text-fg transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
