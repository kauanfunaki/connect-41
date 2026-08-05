"use client";

import { useState, useTransition } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { CampoForm } from "@/components/ui/CampoForm";
import { useToast } from "@/components/ui/Toast";
import {
  TASK_WIDGETS,
  DEFAULT_TASK_WIDGETS,
  type TaskWidgetKey,
  type TaskWidgetSlot,
} from "@/lib/taskWidgets";
import type { ActionState } from "@/lib/actionState";

const SLOT_LABEL: Record<TaskWidgetSlot, string> = {
  main: "Coluna principal",
  side: "Coluna lateral",
};

const SLOT_ORDER: TaskWidgetSlot[] = ["main", "side"];

export type SetorOption = { code: string; label: string };

type Props = {
  sectors: SetorOption[];
  /** Configuração atual por setor. Setor ausente = padrão (tudo visível). */
  configBySector: Record<string, TaskWidgetKey[]>;
  saveAction: (sectorCode: string, keys: TaskWidgetKey[]) => Promise<ActionState>;
  resetAction: (sectorCode: string) => Promise<ActionState>;
};

// Configuração da tela /tarefas, por setor. Só o SUPER_ADMIN chega aqui.
//
// Espelha o modal de personalizar a Home, com duas diferenças que vêm do fato
// de a configuração ser do workspace e não da pessoa: o seletor de setor no
// topo (a Home é sempre "a minha") e a ausência das setas de ordenar (a ordem
// é a do catálogo — com a união entre setores, duas ordens conflitantes não
// teriam desempate).
export function ConfigurarTarefasButton({ sectors, configBySector, saveAction, resetAction }: Props) {
  const [open, setOpen] = useState(false);
  const [sectorCode, setSectorCode] = useState(sectors[0]?.code ?? "");
  const [selected, setSelected] = useState<TaskWidgetKey[]>(
    () => configBySector[sectors[0]?.code] ?? DEFAULT_TASK_WIDGETS
  );
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  function loadSector(code: string) {
    setSectorCode(code);
    setSelected(configBySector[code] ?? DEFAULT_TASK_WIDGETS);
  }

  function openModal() {
    // Reabrir depois de cancelar não pode manter o rascunho descartado.
    loadSector(sectorCode || sectors[0]?.code || "");
    setOpen(true);
  }

  function toggle(key: TaskWidgetKey) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function save() {
    startTransition(async () => {
      const result = await saveAction(sectorCode, selected);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success("Tela de Tarefas configurada para este setor.");
    });
  }

  function reset() {
    startTransition(async () => {
      const result = await resetAction(sectorCode);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success("Setor restaurado ao padrão.");
    });
  }

  if (sectors.length === 0) return null;

  const sectorLabel = sectors.find((s) => s.code === sectorCode)?.label ?? sectorCode;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title="Configurar a tela de Tarefas"
        aria-label="Configurar a tela de Tarefas"
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border-strong bg-surface-hover text-fg-secondary text-[13px] font-medium hover:text-fg hover:border-brand transition-colors"
      >
        <SlidersHorizontal size={14} />
        <span className="hidden sm:inline">Configurar</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Configurar a tela de Tarefas" maxWidth="max-w-lg">
        <p className="text-[length:var(--fs-helper)] text-fg-muted mb-4">
          Escolha o que aparece em Tarefas para cada setor. Vale para todo mundo do
          setor — quem participa de mais de um vê a soma dos blocos.
        </p>

        <CampoForm label="Setor" htmlFor="tarefas-setor">
          <Select
            id="tarefas-setor"
            value={sectorCode}
            onChange={(e) => loadSector(e.target.value)}
          >
            {sectors.map((s) => (
              <option key={s.code} value={s.code}>{s.label}</option>
            ))}
          </Select>
        </CampoForm>

        <div className="space-y-5 mt-5">
          {SLOT_ORDER.map((slot) => {
            const defs = TASK_WIDGETS.filter((w) => w.slot === slot);
            if (defs.length === 0) return null;

            return (
              <div key={slot}>
                <p className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider mb-2">
                  {SLOT_LABEL[slot]}
                </p>
                <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
                  {defs.map((def) => (
                    <div key={def.key} className="flex items-center gap-3 px-3 py-2.5 bg-surface">
                      <Checkbox
                        id={`task-widget-${def.key}`}
                        checked={selected.includes(def.key)}
                        onChange={() => toggle(def.key)}
                      />
                      <label htmlFor={`task-widget-${def.key}`} className="flex-1 min-w-0 cursor-pointer">
                        <span className="block text-[13px] font-medium text-fg truncate">{def.label}</span>
                        <span className="block text-[11.5px] text-fg-muted truncate">{def.description}</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {selected.length === 0 && (
          <p className="text-[12px] text-fg-secondary bg-surface-hover border border-border rounded-md px-3 py-2 mt-4">
            Sem nenhum bloco marcado, quem é só de {sectorLabel} vai abrir Tarefas numa
            tela vazia. É uma escolha válida enquanto o setor não tiver módulos próprios —
            só não é acidente.
          </p>
        )}

        <div className="flex items-center gap-3 pt-5">
          <Button onClick={save} loading={isPending}>
            Salvar
          </Button>
          <Button variant="ghost" onClick={reset} disabled={isPending}>
            Restaurar padrão
          </Button>
        </div>
      </Modal>
    </>
  );
}
