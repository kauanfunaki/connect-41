"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { TASK_WIDGETS, DEFAULT_TASK_WIDGETS, type TaskWidgetKey } from "@/lib/taskWidgets";
import type { ActionState } from "@/lib/actionState";

export type SetorOption = { code: string; label: string };

const semAssinatura = () => () => {};

/** O lugar da faixa de edição, logo abaixo do cabeçalho do Meu dia. */
export const ID_DA_FAIXA_DO_MEU_DIA = "faixa-do-meu-dia";

type Props = {
  sectors: SetorOption[];
  /** Configuração atual por setor. Setor ausente = padrão (tudo visível). */
  configBySector: Record<string, TaskWidgetKey[]>;
  saveAction: (sectorCode: string, keys: TaskWidgetKey[]) => Promise<ActionState>;
  resetAction: (sectorCode: string) => Promise<ActionState>;
};

// Configuração da tela /tarefas, por setor. Só o SUPER_ADMIN chega aqui.
//
// Na própria tela desde 20/10/2026 (escolha 11A dos Ajustes de 15/10, a mesma
// do Início): o botão abre uma faixa no topo do Meu dia, com o setor, um
// interruptor por bloco e Concluir. Era uma janela com caixas de marcar.
// Continua por setor e sem ordem — a ordem é a do catálogo: com a união entre
// setores, duas ordens conflitantes não teriam desempate.
export function ConfigurarTarefasButton({ sectors, configBySector, saveAction, resetAction }: Props) {
  const [aberto, setAberto] = useState(false);
  const [sectorCode, setSectorCode] = useState(sectors[0]?.code ?? "");
  const [selected, setSelected] = useState<TaskWidgetKey[]>(() => configBySector[sectors[0]?.code] ?? DEFAULT_TASK_WIDGETS);
  const [isPending, startTransition] = useTransition();
  const toast = useToast();

  // A faixa vai para o lugar dela na página, abaixo do cabeçalho; o botão
  // fica no cabeçalho. No servidor não há documento (o padrão do SlideOver).
  const noNavegador = useSyncExternalStore(semAssinatura, () => true, () => false);
  const alvo = noNavegador && aberto ? document.getElementById(ID_DA_FAIXA_DO_MEU_DIA) : null;

  function loadSector(code: string) {
    setSectorCode(code);
    setSelected(configBySector[code] ?? DEFAULT_TASK_WIDGETS);
  }

  function abrir() {
    // Reabrir depois de cancelar não pode manter o rascunho descartado.
    loadSector(sectorCode || sectors[0]?.code || "");
    setAberto(true);
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
      setAberto(false);
      toast.success("Meu dia configurado para este setor.");
    });
  }

  function reset() {
    startTransition(async () => {
      const result = await resetAction(sectorCode);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      setAberto(false);
      toast.success("Setor restaurado ao padrão.");
    });
  }

  if (sectors.length === 0) return null;

  const sectorLabel = sectors.find((s) => s.code === sectorCode)?.label ?? sectorCode;

  const faixa = (
    <div
      role="region"
      aria-label="Configurando o Meu dia"
      className="sticky top-2 z-20 mb-4 flex flex-col gap-3 rounded-lg border border-brand/30 bg-brand-subtle px-4 py-3 shadow-[var(--c41-shadow-sm)]"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <SlidersHorizontal size={16} className="flex-shrink-0 text-brand" aria-hidden />
        <p className="font-semibold text-fg">Configurando o Meu dia de</p>
        <Select compact value={sectorCode} onChange={(e) => loadSector(e.target.value)} aria-label="Setor" className="w-56 max-w-full">
          {sectors.map((s) => (
            <option key={s.code} value={s.code}>
              {s.label}
            </option>
          ))}
        </Select>
        <p className="min-w-0 text-fs-2 text-fg-secondary">
          Vale para todo mundo do setor — quem participa de mais de um vê a soma dos blocos.
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={reset} disabled={isPending}>
            <RotateCcw size={13} /> Restaurar padrão
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAberto(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button size="sm" onClick={save} loading={isPending} loadingLabel="Salvando…">
            <Check size={13} /> Concluir
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {TASK_WIDGETS.map((def) => (
          <span key={def.key} title={def.description} className="inline-flex">
            <Switch checked={selected.includes(def.key)} onCheckedChange={() => toggle(def.key)} rotulo={def.label} />
          </span>
        ))}
      </div>
      {selected.length === 0 && (
        <p className="text-fs-2 text-warning-fg">
          Sem nenhum bloco ligado, quem é só de {sectorLabel} vai abrir o Meu dia numa tela vazia. É uma escolha válida
          enquanto o setor não tiver módulos próprios — só não é acidente.
        </p>
      )}
    </div>
  );

  return (
    <>
      {/* Contorno sem fundo em repouso e em `sm`, a altura do "Todas as
          tarefas" ao lado (15/10/2026). */}
      <Button
        variant="secondary"
        size="sm"
        onClick={aberto ? () => setAberto(false) : abrir}
        aria-pressed={aberto}
        title="Configurar o Meu dia"
        aria-label="Configurar o Meu dia"
      >
        <SlidersHorizontal size={14} />
        <span className="hidden sm:inline">Configurar</span>
      </Button>
      {alvo && createPortal(faixa, alvo)}
    </>
  );
}
