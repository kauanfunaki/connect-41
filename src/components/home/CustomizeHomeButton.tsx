"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, SlidersHorizontal } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { useToast } from "@/components/ui/Toast";
import {
  HOME_WIDGETS,
  type HomeWidgetKey,
  type HomeWidgetSlot,
} from "@/lib/homeWidgets";
import type { ActionState } from "@/lib/actionState";

const SLOT_LABEL: Record<HomeWidgetSlot, string> = {
  top: "Topo",
  main: "Coluna principal",
  side: "Coluna lateral",
};

const SLOT_ORDER: HomeWidgetSlot[] = ["top", "main", "side"];

type Entry = { key: HomeWidgetKey; visible: boolean };

type Props = {
  /** Widgets visíveis, na ordem escolhida pelo usuário. */
  selected: HomeWidgetKey[];
  /** Se o usuário enxerga os blocos restritos (visão de workspace). */
  showRestricted: boolean;
  saveAction: (keys: HomeWidgetKey[]) => Promise<ActionState>;
  resetAction: () => Promise<ActionState>;
};

// Monta a lista editável: primeiro os visíveis na ordem salva, depois os
// ocultos na ordem do catálogo (é onde um widget novo aparece pra quem já
// personalizou — desmarcado, mas visível na tela de personalização).
function buildEntries(selected: HomeWidgetKey[], showRestricted: boolean): Entry[] {
  const available = HOME_WIDGETS.filter((w) => !w.restricted || showRestricted);
  const visible = selected.filter((key) => available.some((w) => w.key === key));
  const hidden = available.filter((w) => !visible.includes(w.key)).map((w) => w.key);
  return [
    ...visible.map((key) => ({ key, visible: true })),
    ...hidden.map((key) => ({ key, visible: false })),
  ];
}

export function CustomizeHomeButton({ selected, showRestricted, saveAction, resetAction }: Props) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>(() => buildEntries(selected, showRestricted));
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  function openModal() {
    // Reabrir depois de cancelar não pode manter o rascunho descartado.
    setEntries(buildEntries(selected, showRestricted));
    setOpen(true);
  }

  function toggle(key: HomeWidgetKey) {
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, visible: !e.visible } : e)));
  }

  // Reordena dentro da própria faixa: troca com o vizinho de mesmo slot, não
  // com o vizinho na lista completa (que pode estar em outra coluna).
  function move(key: HomeWidgetKey, direction: -1 | 1) {
    setEntries((prev) => {
      const slot = HOME_WIDGETS.find((w) => w.key === key)?.slot;
      if (!slot) return prev;
      const indexes = prev
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => HOME_WIDGETS.find((w) => w.key === e.key)?.slot === slot)
        .map(({ i }) => i);
      const at = indexes.findIndex((i) => prev[i].key === key);
      const target = at + direction;
      if (at === -1 || target < 0 || target >= indexes.length) return prev;
      const next = [...prev];
      const a = indexes[at];
      const b = indexes[target];
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
  }

  function save() {
    const keys = entries.filter((e) => e.visible).map((e) => e.key);
    startTransition(async () => {
      const result = await saveAction(keys);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success("Home personalizada.");
    });
  }

  function reset() {
    startTransition(async () => {
      const result = await resetAction();
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      toast.success("Home restaurada ao padrão.");
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title="Personalizar Home"
        aria-label="Personalizar Home"
        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-[10px] border border-border-strong bg-surface-hover text-fg-secondary text-[13px] font-medium hover:text-fg hover:border-brand transition-colors"
      >
        <SlidersHorizontal size={14} />
        <span className="hidden sm:inline">Personalizar</span>
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Personalizar Home" maxWidth="max-w-lg">
        <p className="text-[length:var(--fs-helper)] text-fg-muted mb-4">
          Escolha o que aparece na sua Home e em que ordem. Vale só pra você.
        </p>

        <div className="space-y-5">
          {SLOT_ORDER.map((slot) => {
            const slotEntries = entries.filter(
              (e) => HOME_WIDGETS.find((w) => w.key === e.key)?.slot === slot
            );
            if (slotEntries.length === 0) return null;

            return (
              <div key={slot}>
                <p className="text-[11px] font-semibold text-fg-muted uppercase tracking-wider mb-2">
                  {SLOT_LABEL[slot]}
                </p>
                <div className="border border-border rounded-xl divide-y divide-border overflow-hidden">
                  {slotEntries.map((entry, index) => {
                    const def = HOME_WIDGETS.find((w) => w.key === entry.key)!;
                    return (
                      <div key={entry.key} className="flex items-center gap-3 px-3 py-2.5 bg-surface">
                        <Checkbox
                          id={`widget-${entry.key}`}
                          checked={entry.visible}
                          onChange={() => toggle(entry.key)}
                        />
                        <label htmlFor={`widget-${entry.key}`} className="flex-1 min-w-0 cursor-pointer">
                          <span className="block text-[13px] font-medium text-fg truncate">{def.label}</span>
                          <span className="block text-[11.5px] text-fg-muted truncate">{def.description}</span>
                        </label>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => move(entry.key, -1)}
                            disabled={index === 0}
                            aria-label={`Mover ${def.label} para cima`}
                            className="w-7 h-7 inline-flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors disabled:opacity-[var(--c41-disabled-op)] disabled:hover:bg-transparent disabled:hover:text-fg-muted"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => move(entry.key, 1)}
                            disabled={index === slotEntries.length - 1}
                            aria-label={`Mover ${def.label} para baixo`}
                            className="w-7 h-7 inline-flex items-center justify-center rounded-md text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors disabled:opacity-[var(--c41-disabled-op)] disabled:hover:bg-transparent disabled:hover:text-fg-muted"
                          >
                            <ArrowDown size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

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
