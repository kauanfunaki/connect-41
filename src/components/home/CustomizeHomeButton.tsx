"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, SlidersHorizontal } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
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
  paineis: "Painéis",
  "abaixo-dos-paineis": "Abaixo dos painéis",
  main: "Coluna principal",
  side: "Coluna lateral",
};

// A ordem da tela, de cima para baixo (os Indicadores descem para depois dos
// painéis em 08/10 — escolha 7A do Kauan).
const SLOT_ORDER: HomeWidgetSlot[] = ["top", "paineis", "abaixo-dos-paineis", "main", "side"];

type Entry = { key: HomeWidgetKey; visible: boolean };

type Props = {
  /** Widgets visíveis, na ordem escolhida pelo usuário. */
  selected: HomeWidgetKey[];
  /**
   * Os blocos que este usuário pode ligar: tira os restritos (visão de
   * workspace) de quem não tem, e os painéis dos setores que ele não enxerga.
   */
  disponiveis: HomeWidgetKey[];
  saveAction: (keys: HomeWidgetKey[], ocultos: HomeWidgetKey[]) => Promise<ActionState>;
  resetAction: () => Promise<ActionState>;
};

// Monta a lista editável: primeiro os visíveis na ordem salva, depois os
// ocultos na ordem do catálogo.
function buildEntries(selected: HomeWidgetKey[], disponiveis: HomeWidgetKey[]): Entry[] {
  const available = HOME_WIDGETS.filter((w) => disponiveis.includes(w.key));
  const visible = selected.filter((key) => available.some((w) => w.key === key));
  const hidden = available.filter((w) => !visible.includes(w.key)).map((w) => w.key);
  return [
    ...visible.map((key) => ({ key, visible: true })),
    ...hidden.map((key) => ({ key, visible: false })),
  ];
}

export function CustomizeHomeButton({ selected, disponiveis, saveAction, resetAction }: Props) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>(() => buildEntries(selected, disponiveis));
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  function openModal() {
    // Reabrir depois de cancelar não pode manter o rascunho descartado.
    setEntries(buildEntries(selected, disponiveis));
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
    const ocultos = entries.filter((e) => !e.visible).map((e) => e.key);
    startTransition(async () => {
      const result = await saveAction(keys, ocultos);
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
      <Button
        variant="secondary"
        size="md"
        className="bg-surface-hover hover:border-brand"
        onClick={openModal}
        title="Personalizar Home"
        aria-label="Personalizar Home"
      >
        <SlidersHorizontal size={14} />
        <span className="hidden sm:inline">Personalizar</span>
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Personalizar Home" maxWidth="max-w-lg">
        <p className="text-helper text-fg-muted mb-4">
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
                <p className="text-fs-1 font-semibold text-fg-muted uppercase tracking-wider mb-2">
                  {SLOT_LABEL[slot]}
                </p>
                <div className="border border-border rounded-lg divide-y divide-border overflow-hidden">
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
                          <span className="block text-fs-3 font-medium text-fg truncate">{def.label}</span>
                          <span className="block text-micro text-fg-muted truncate">{def.description}</span>
                        </label>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {/* Setas de ordem: botão de ícone do app (30/09), e não texto com caixa emprestada. */}
                          <IconButton
                            size="sm"
                            className="disabled:hover:bg-transparent disabled:hover:text-fg-muted"
                            onClick={() => move(entry.key, -1)}
                            disabled={index === 0}
                            aria-label={`Mover ${def.label} para cima`}
                          >
                            <ArrowUp size={14} />
                          </IconButton>
                          <IconButton
                            size="sm"
                            className="disabled:hover:bg-transparent disabled:hover:text-fg-muted"
                            onClick={() => move(entry.key, 1)}
                            disabled={index === slotEntries.length - 1}
                            aria-label={`Mover ${def.label} para baixo`}
                          >
                            <ArrowDown size={14} />
                          </IconButton>
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
