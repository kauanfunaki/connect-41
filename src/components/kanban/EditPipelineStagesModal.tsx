"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Pencil, GripVertical, Trash2, Plus } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SeletorDeCor } from "@/components/ui/SeletorDeCor";
import { StageDot, type StageDotType } from "@/components/kanban/StageDot";
import { isUsableAccent, normalizeAccentColor } from "@/lib/color";
import type { EditStagesState, StageInput } from "@/app/(app)/kanban/actions";
import { Aviso } from "@/components/ui/Aviso";

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
  const [colorAdjusted, setColorAdjusted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function openModal() {
    setRows(initialStages);
    setError(null);
    setColorAdjusted(false);
    setOpen(true);
  }

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  // A bolinha do estágio é desenhada direto sobre a superfície da lista, sem
  // pílula por trás — cor quase preta some no tema escuro, quase branca some no
  // claro. Em vez de recusar (o usuário está arrastando o cursor no seletor,
  // um erro no meio do arrasto só atrapalha), puxa pro tom legível mais
  // próximo e avisa o que aconteceu.
  function updateColor(i: number, picked: string) {
    const safe = normalizeAccentColor(picked);
    if (!isUsableAccent(picked)) setColorAdjusted(true);
    update(i, { color: safe });
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
      <Button type="button" variant="secondary" onClick={openModal}>
        <Pencil size={14} /> Editar lista
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title="Editar lista" maxWidth="max-w-lg">
        <div className="space-y-3">
          {/* Cabeçalho — sem isso "Título do estágio" (nome livre) e "Status
              da bolinha" (tipo que rege a cor/estado do StageDot) pareciam o
              mesmo tipo de campo, confundindo o usuário. */}
          {/* Os espaçadores têm a largura exata de cada peça da linha (o botão
              de arrastar e o de excluir são IconButton `sm`, 28px): com 13px e
              27px, "Título do estágio" ficava 15px à esquerda do campo. */}
          <div className="flex items-center gap-2 px-0.5">
            <span className="w-7 flex-shrink-0" />
            <span className="w-9 flex-shrink-0" />
            <span className="flex-1 min-w-0 text-fs-1 font-medium text-fg-muted">Título do estágio</span>
            <span className="w-[150px] flex-shrink-0 text-fs-1 font-medium text-fg-muted">Status da bolinha</span>
            <span className="w-3.5 flex-shrink-0" />
            {rows.length > 1 && <span className="w-7 flex-shrink-0" />}
          </div>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            {rows.map((row, i) => (
              <div key={row.id ?? `new-${i}`} className="flex items-center gap-2">
                <div className="flex flex-col flex-shrink-0">
                  <IconButton type="button" size="sm" disabled={i === 0} onClick={() => move(i, "up")} aria-label="Mover estágio para cima">
                    <GripVertical size={13} />
                  </IconButton>
                </div>
                <SeletorDeCor
                  modo="botao"
                  valor={row.color}
                  onChange={(cor) => updateColor(i, cor)}
                  aria-label={`Cor do estágio ${i + 1}`}
                />
                <Input
                  aria-label={`Título do estágio ${i + 1}`}
                  value={row.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder={`Estágio ${i + 1}`}
                  className="flex-1 min-w-0"
                />
                <Select
                  aria-label={`Status da bolinha do estágio ${i + 1}`}
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
                  <IconButton
                    type="button"
                    size="sm"
                    onClick={() => removeRow(i)}
                    className="flex-shrink-0"
                    aria-label="Excluir estágio"
                  >
                    <Trash2 size={14} />
                  </IconButton>
                )}
              </div>
            ))}
          </div>

          {/* Era link azul (30/09): ação é botão. */}
          <Button variant="secondary" size="xs" type="button" onClick={addRow} className="self-start">
            <Plus size={12} /> Adicionar estágio
          </Button>

          {colorAdjusted && (
            <Aviso tom="neutro">
              A cor escolhida foi ajustada para o tom legível mais próximo — cores
              quase pretas somem no tema escuro e quase brancas somem no claro.
            </Aviso>
          )}

          {error && <Aviso>{error}</Aviso>}

          {/* Rodapé de modal no padrão (30/09): Cancelar à esquerda do
              primário, os dois à direita, com divisor. */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={save} disabled={isPending} variant="primary">
              {isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
