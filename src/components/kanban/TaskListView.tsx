"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, ChevronDown, Plus, Repeat } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { formatCalendarDate } from "@/lib/format";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { StageDot, type StageDotType } from "@/components/kanban/StageDot";
import { darkenUntilReadableOnWhiteText } from "@/lib/color";
import { RowActionsMenu } from "@/components/kanban/RowActionsMenu";
import { Button } from "@/components/ui/Button";
import { TabelaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { EtiquetaColorida } from "@/components/ui/EtiquetaColorida";

export type AssigneeRow = { id: string; name: string; priority: number };
export type SubtaskRow = {
  id: string; stageId: string; entityName: string; stageName: string; isTerminal: boolean; priority: number;
  assignees?: AssigneeRow[]; dueDate?: string | null; tags?: { id: string; name: string; color: string }[]; recurring?: boolean;
};
export type TaskRow = {
  id: string;
  stageId: string;
  entityName: string;
  priority: number;
  dueDate: string | null;
  recurring?: boolean;
  tags?: { id: string; name: string; color: string }[];
  assignees?: AssigneeRow[];
  subtasks?: SubtaskRow[];
};
export type StageOption = { id: string; name: string; color: string | null; isTerminal?: boolean; type?: StageDotType };

// Estágios ainda não migrados (type nulo/undefined) caem no fallback derivado
// do isTerminal binário antigo — evita quebrar boards criados antes do campo existir.
function resolveStageType(isTerminal: boolean, type?: StageDotType): StageDotType {
  return type ?? (isTerminal ? "DONE" : "NOT_STARTED");
}

type Props = {
  basePath: string;
  pipelineId: string;
  stages: StageOption[];
  items: TaskRow[];
  canAct: boolean;
  renameStageAction: (stageId: string, name: string) => Promise<void>;
  createTaskAction: (stageId: string, title: string) => Promise<void>;
  priorityAction: (itemId: string, userId: string, priority: number) => Promise<void>;
  moveAction: (itemId: string, newStageId: string) => Promise<void>;
  reorderAction: (itemId: string, direction: "up" | "down") => Promise<void>;
  concluirAction: (pipelineId: string, itemId: string) => Promise<void>;
  reabrirAction: (pipelineId: string, itemId: string) => Promise<void>;
  /** Exclui a tarefa (ou subtarefa — subtarefa cai em cascata pelo parentItemId).
   * Ausente = sem opção de excluir, para quem não administra o setor. */
  deleteAction?: (itemId: string) => Promise<void>;
};

// Escala de indentação da árvore. Antes só existia `depth * 20` aplicado aos
// itens, o que deixava três problemas: o cabeçalho de status nascia no mesmo
// x dos itens (nada indicava que um está dentro do outro), a coluna de 56px
// não comportava o recuo do primeiro nível de subtarefa — que ficava espremido
// contra a bolinha — e cada nível novo herdava esse aperto.
const ITEM_INDENT = 16; // item de 1º nível, medido a partir do cabeçalho de status
const DEPTH_STEP = 20; // cada nível de subtarefa
// Coluna da bolinha: precisa comportar recuo + chevron + bolinha no nível mais
// fundo que a tela usa na prática (2). 96px cobre com folga — mais os 8px da
// borda, que eram padding do casco até o polimento de 30/09 e agora são da
// própria célula (o cabeçalho com fundo precisa encostar na borda).
const DOT_COL = "w-[104px]";
// Alinha "Adicionar tarefa" e o alvo de soltar com o texto dos itens.
const CONTENT_OFFSET = 104;

const PRIORITY_LABEL: Record<number, string> = { 0: "Normal", 1: "Alta", 2: "Urgente" };
const PRIORITY_COLOR: Record<number, string> = {
  0: "var(--c41-fg-muted)",
  1: "var(--c41-warning)",
  2: "var(--c41-danger)",
};

function isOverdue(dueDate: string | null | undefined): boolean {
  return !!dueDate && new Date(dueDate).getTime() < Date.now();
}

function AssigneeAvatar({ a, itemId, canAct, priorityAction }: { a: AssigneeRow; itemId: string; canAct: boolean; priorityAction: Props["priorityAction"] }) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <span className="relative">
      <button
        type="button"
        data-dica={`${a.name} · ${PRIORITY_LABEL[a.priority] ?? "Normal"}`} aria-label={`${a.name} · ${PRIORITY_LABEL[a.priority] ?? "Normal"}`}
        onClick={(e) => {
          if (!canAct) return;
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        // 24px (07/10/2026): as iniciais saíram de 9px para os 11px da escala,
        // e não cabiam duas letras dentro da borda de prioridade num círculo de 20px.
        className="w-6 h-6 rounded-full bg-surface-hover border-2 flex items-center justify-center text-micro font-medium text-fg-secondary"
        style={{ borderColor: PRIORITY_COLOR[a.priority] ?? PRIORITY_COLOR[0] }}
      >
        {a.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute z-20 top-full right-0 mt-1 bg-surface-elevated border border-border-strong rounded-lg shadow-[var(--c41-shadow-lg)] p-1 w-32"
        >
          {[0, 1, 2].map((p) => (
            <button
              key={p}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                startTransition(() => priorityAction(itemId, a.id, p));
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-fs-2 text-fg-secondary hover:bg-surface-hover hover:text-fg transition-colors"
            >
              <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: PRIORITY_COLOR[p] }} />
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function Row({
  item, basePath, depth = 0, canAct, priorityAction, pipelineId, concluirAction, reabrirAction, stages, deleteAction, dragId, onDragStartRow, onDragEndRow, onDropOnRow,
}: {
  item: TaskRow | SubtaskRow;
  basePath: string;
  depth?: number;
  canAct: boolean;
  priorityAction: Props["priorityAction"];
  pipelineId: string;
  concluirAction: Props["concluirAction"];
  reabrirAction: Props["reabrirAction"];
  stages: StageOption[];
  deleteAction?: Props["deleteAction"];
  dragId: string | null;
  onDragStartRow: (id: string) => void;
  onDragEndRow: () => void;
  onDropOnRow?: (targetId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [, startTransition] = useTransition();
  const hasSubtasks = "subtasks" in item && item.subtasks && item.subtasks.length > 0;
  const dueDate = item.dueDate;
  const assignees = item.assignees ?? [];
  const stage = stages.find((s) => s.id === item.stageId);
  const isTerminal = "isTerminal" in item ? item.isTerminal : (stage?.isTerminal ?? false);
  const stageColor = stage?.color ?? "var(--c41-fg-muted)";
  const stageType = resolveStageType(isTerminal, stage?.type);
  const tags = item.tags ?? [];
  const dragging = dragId === item.id;

  return (
    <>
      <tr
        draggable={canAct}
        onDragStart={() => onDragStartRow(item.id)}
        onDragEnd={onDragEndRow}
        onDragOver={onDropOnRow ? (e) => { e.preventDefault(); e.stopPropagation(); } : undefined}
        onDrop={onDropOnRow ? (e) => { e.preventDefault(); e.stopPropagation(); onDropOnRow(item.id); } : undefined}
        // A linha divisória vive nos <td>, não no <tr>: com `border-collapse`
        // a borda declarada na linha não pinta de forma confiável.
        className={`c41-linha group hover:bg-surface-hover transition-colors [&>td]:border-b [&>td]:border-border/50 ${dragging ? "opacity-40" : ""} ${canAct ? "cursor-grab active:cursor-grabbing" : ""}`}
      >
        <td className={`py-2 pl-4 pr-1 ${DOT_COL}`}>
          <div className="flex items-center gap-1" style={{ paddingLeft: `${ITEM_INDENT + depth * DEPTH_STEP}px` }}>
            {hasSubtasks ? (
              <IconButton
                type="button"
                size="sm"
                onClick={() => setExpanded((v) => !v)}
                className="flex-shrink-0"
                aria-label={expanded ? "Recolher subtarefas" : "Expandir subtarefas"}
              >
                <ChevronRight size={14} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
              </IconButton>
            ) : (
              // Mesma largura do botão de expandir (IconButton `sm`, 28px): com
              // 14px, o título da tarefa sem subtarefas começava 14px antes do
              // da tarefa com subtarefas logo acima.
              <span className="w-7 flex-shrink-0" />
            )}

            <button
              type="button"
              disabled={!canAct}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                startTransition(() =>
                  isTerminal ? reabrirAction(pipelineId, item.id) : concluirAction(pipelineId, item.id)
                );
              }}
              aria-label={isTerminal ? "Reabrir tarefa" : "Concluir tarefa"}
              title={stage?.name ?? ""}
              className="group/dot flex-shrink-0 transition-transform hover:scale-125 disabled:cursor-default disabled:hover:scale-100"
            >
              <StageDot color={stageColor} type={stageType} showCheckOnHover />
            </button>
          </div>
        </td>

        <td className="py-2 pr-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href={`${basePath}/itens/${item.id}`}
              className={`text-fs-3 text-fg group-hover:text-brand transition-colors truncate min-w-0 ${isTerminal ? "text-fg-muted" : ""}`}
            >
              {item.entityName}
            </Link>
            {hasSubtasks && (
              <span className="text-fs-1 text-fg-muted flex-shrink-0 tnum">
                {(item as TaskRow).subtasks!.filter((s) => s.isTerminal).length}/{(item as TaskRow).subtasks!.length}
              </span>
            )}
          </div>
        </td>

        {/* Uma tag só + contador. Antes eram duas com `flex-wrap`, e a segunda
            caía pra linha de baixo dentro de uma coluna de 176px — a linha
            inteira crescia de altura só por causa disso, quebrando o ritmo da
            lista. O contador guarda o resto sem custar altura nenhuma. */}
        <td className="py-2 pr-2 w-44">
          {tags.length > 0 && (
            <div className="flex items-center gap-1 min-w-0">
              <EtiquetaColorida cor={tags[0].color} className="min-w-0">
                {tags[0].name}
              </EtiquetaColorida>
              {tags.length > 1 && (
                <span
                  className="inline-flex items-center flex-shrink-0 text-micro font-medium px-1.5 py-0.5 rounded-full bg-surface-hover text-fg-muted tnum"
                  title={tags.slice(1).map((t) => t.name).join(", ")}
                >
                  +{tags.length - 1}
                </span>
              )}
            </div>
          )}
        </td>

        <td className="py-2 pr-2 w-24">
          {assignees.length > 0 && (
            <div className="flex items-center -space-x-1.5">
              {assignees.slice(0, 3).map((a) => (
                <AssigneeAvatar key={a.id} a={a} itemId={item.id} canAct={canAct} priorityAction={priorityAction} />
              ))}
            </div>
          )}
        </td>

        {/* Prazo e menu dividem a última célula de propósito: as tabelas desta
            tela declaram colSpan={5} em vários pontos (cabeçalho de status,
            alvo de soltar, "Adicionar tarefa"), e uma 6ª coluna obrigaria a
            revisar todos eles para ganhar 24px. */}
        <td className="py-2 pr-4 w-[120px] text-right">
          <div className="flex items-center justify-end gap-1">
            {dueDate && (
              <span className={`inline-flex items-center gap-1 text-fs-1 tnum ${isOverdue(dueDate) ? "text-danger font-semibold" : "text-fg-muted"}`}>
                {item.recurring && <Repeat size={10} />}
                {formatCalendarDate(new Date(dueDate), { day: "2-digit", month: "short" })}
              </span>
            )}
            {canAct && deleteAction && (
              <RowActionsMenu name={item.entityName} onDelete={() => deleteAction(item.id)} />
            )}
          </div>
        </td>
      </tr>

      {expanded && hasSubtasks && (item as TaskRow).subtasks!.map((s) => (
        <Row
          key={s.id}
          item={s}
          basePath={basePath}
          depth={depth + 1}
          canAct={canAct}
          priorityAction={priorityAction}
          pipelineId={pipelineId}
          concluirAction={concluirAction}
          reabrirAction={reabrirAction}
          stages={stages}
          deleteAction={deleteAction}
          dragId={dragId}
          onDragStartRow={onDragStartRow}
          onDragEndRow={onDragEndRow}
        />
      ))}
    </>
  );
}

// Card equivalente a <Row>, usado no lugar da tabela em telas estreitas: as
// mesmas informações empilhadas, sem colunas fixas que espremiam título e
// responsáveis a poucos pixels. Arrastar não é opção no toque (HTML5 drag não
// dispara em touch), então mover de estágio aqui é um select — é o que
// substitui o drag-and-drop da tabela, não um extra.
function TaskCard({
  item, basePath, depth = 0, canAct, priorityAction, pipelineId, concluirAction, reabrirAction, stages, moveAction, deleteAction,
}: {
  item: TaskRow | SubtaskRow;
  basePath: string;
  depth?: number;
  canAct: boolean;
  priorityAction: Props["priorityAction"];
  pipelineId: string;
  concluirAction: Props["concluirAction"];
  reabrirAction: Props["reabrirAction"];
  stages: StageOption[];
  moveAction: Props["moveAction"];
  deleteAction?: Props["deleteAction"];
}) {
  const [expanded, setExpanded] = useState(false);
  const [, startTransition] = useTransition();
  const hasSubtasks = "subtasks" in item && item.subtasks && item.subtasks.length > 0;
  const dueDate = item.dueDate;
  const assignees = item.assignees ?? [];
  const stage = stages.find((s) => s.id === item.stageId);
  const isTerminal = "isTerminal" in item ? item.isTerminal : (stage?.isTerminal ?? false);
  const stageColor = stage?.color ?? "var(--c41-fg-muted)";
  const stageType = resolveStageType(isTerminal, stage?.type);
  const tags = item.tags ?? [];

  return (
    <>
      <div
        style={depth > 0 ? { marginLeft: depth * 14 } : undefined}
        className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] px-3 py-2.5 space-y-2"
      >
        <div className="flex items-start gap-2">
          <button
            type="button"
            disabled={!canAct}
            onClick={() =>
              startTransition(() =>
                isTerminal ? reabrirAction(pipelineId, item.id) : concluirAction(pipelineId, item.id)
              )
            }
            aria-label={isTerminal ? "Reabrir tarefa" : "Concluir tarefa"}
            title={stage?.name ?? ""}
            className="group/dot flex-shrink-0 mt-0.5 disabled:cursor-default"
          >
            <StageDot color={stageColor} type={stageType} showCheckOnHover />
          </button>

          <Link
            href={`${basePath}/itens/${item.id}`}
            className={`flex-1 min-w-0 text-fs-3 leading-snug ${isTerminal ? "text-fg-muted" : "text-fg"}`}
          >
            {item.entityName}
          </Link>

          {hasSubtasks && (
            <Button
              variant="ghost"
              size="xs"
              className="flex-shrink-0 px-1.5"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Recolher subtarefas" : "Expandir subtarefas"}
            >
              <span className="text-fs-1 tnum">
                {(item as TaskRow).subtasks!.filter((s) => s.isTerminal).length}/{(item as TaskRow).subtasks!.length}
              </span>
              <ChevronRight size={14} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
            </Button>
          )}

          {canAct && deleteAction && (
            <RowActionsMenu name={item.entityName} onDelete={() => deleteAction(item.id)} />
          )}
        </div>

        {tags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {tags.map((t) => (
              <EtiquetaColorida key={t.id} cor={t.color}>
                {t.name}
              </EtiquetaColorida>
            ))}
          </div>
        )}

        {(assignees.length > 0 || dueDate) && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center -space-x-1.5">
              {assignees.slice(0, 4).map((a) => (
                <AssigneeAvatar key={a.id} a={a} itemId={item.id} canAct={canAct} priorityAction={priorityAction} />
              ))}
            </div>
            {dueDate && (
              <span className={`inline-flex items-center gap-1 text-fs-1 tnum ${isOverdue(dueDate) ? "text-danger font-semibold" : "text-fg-muted"}`}>
                {item.recurring && <Repeat size={10} />}
                {formatCalendarDate(new Date(dueDate), { day: "2-digit", month: "short" })}
              </span>
            )}
          </div>
        )}

        {canAct && (
          <Select
            aria-label="Mover para outro status"
            value={item.stageId}
            onChange={(e) => {
              const newStageId = e.target.value;
              if (newStageId !== item.stageId) startTransition(() => moveAction(item.id, newStageId));
            }}
            className="w-full"
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        )}
      </div>

      {expanded && hasSubtasks && (item as TaskRow).subtasks!.map((s) => (
        <TaskCard
          key={s.id}
          item={s}
          basePath={basePath}
          depth={depth + 1}
          canAct={canAct}
          priorityAction={priorityAction}
          pipelineId={pipelineId}
          concluirAction={concluirAction}
          reabrirAction={reabrirAction}
          stages={stages}
          moveAction={moveAction}
          deleteAction={deleteAction}
        />
      ))}
    </>
  );
}

// Cabeçalho do grupo (colapsar, bolinha, nome renomeável inline, contagem) —
// idêntico na tabela e nos cards, então mora aqui em vez de duplicado nos dois.
function StageGroupHeader({
  stage, count, collapsed, onToggleCollapsed, canAct, renameStageAction,
}: {
  stage: StageOption;
  count: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  canAct: boolean;
  renameStageAction: Props["renameStageAction"];
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(stage.name);
  const [, startTransition] = useTransition();

  function saveName() {
    setEditingName(false);
    if (nameValue.trim() && nameValue.trim() !== stage.name) {
      startTransition(() => renameStageAction(stage.id, nameValue.trim()));
    } else {
      setNameValue(stage.name);
    }
  }

  // O status vira um badge preenchido com a própria cor, no padrão do ClickUp.
  // Antes era uma bolinha de 7px + texto cinza: a cor escolhida pro status mal
  // aparecia e os itens abaixo pesavam mais na tela do que o agrupamento que os
  // contém.
  //
  // A fonte é SEMPRE branca e o fundo é que se ajusta. Escolher a cor do texto
  // pelo contraste (readableTextOn) dava letra preta em status claros —
  // "A FAZER" cinza e "AGUARDANDO CLIENTE" âmbar saíam de letra preta no meio
  // de vizinhos de letra branca, e a lista ficava remendada. Fixar o branco e
  // fechar o tom do fundo mantém o conjunto uniforme sem perder a cor.
  const badgeColor = darkenUntilReadableOnWhiteText(stage.color ?? "#586577");

  return (
    <div className="flex items-center gap-2">
      <IconButton type="button" size="sm" onClick={onToggleCollapsed} aria-label={collapsed ? "Expandir lista" : "Recolher lista"} aria-expanded={!collapsed} className="flex-shrink-0">
        <ChevronDown size={13} className={`transition-transform ${collapsed ? "-rotate-90" : ""}`} />
      </IconButton>
      {editingName && canAct ? (
        <Input
          value={nameValue}
          onChange={(e) => setNameValue(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveName();
            if (e.key === "Escape") { setNameValue(stage.name); setEditingName(false); }
          }}
          autoFocus
          compact
          aria-label="Nome do status"
          className="w-40"
        />
      ) : (
        <h3
          onClick={() => canAct && setEditingName(true)}
          style={{ background: badgeColor, color: "#FFFFFF" }}
          className={`inline-flex items-center h-[22px] px-2 rounded-md text-fs-1 font-semibold uppercase tracking-wide ${canAct ? "cursor-text" : ""}`}
        >
          {stage.name}
        </h3>
      )}
      <span className="text-fs-1 text-fg-muted tnum">{count}</span>
    </div>
  );
}

// Criação rápida por status — mesmo comportamento nas duas visões.
function AddTaskInline({ stageId, createTaskAction }: { stageId: string; createTaskAction: Props["createTaskAction"] }) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [, startTransition] = useTransition();

  function addTask() {
    const title = newTitle.trim();
    if (!title) { setAdding(false); return; }
    startTransition(() => createTaskAction(stageId, title));
    setNewTitle("");
  }

  if (adding) {
    return (
      <Input
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") addTask();
          if (e.key === "Escape") { setAdding(false); setNewTitle(""); }
        }}
        onBlur={() => { if (!newTitle.trim()) setAdding(false); }}
        autoFocus
        compact
        aria-label="Nome da nova tarefa"
        placeholder="Nome da tarefa…"
        className="max-w-xs"
      />
    );
  }

  return (
    // Era texto solto (linkMuted) até 30/09: é ação, então é botão — fantasma,
    // para não pesar em cada grupo, e com o texto alinhado ao título dos itens.
    <Button variant="ghost" size="xs" type="button" onClick={() => setAdding(true)} className="-ml-2.5">
      <Plus size={11} /> Adicionar tarefa
    </Button>
  );
}

function StageGroup({
  stage, items, basePath, canAct, renameStageAction, createTaskAction, priorityAction, pipelineId, concluirAction, reabrirAction, stages, deleteAction,
  dragId, onDragStartRow, onDragEndRow, onDropStage, onDropOnRow,
}: {
  stage: StageOption;
  items: TaskRow[];
  basePath: string;
  canAct: boolean;
  renameStageAction: Props["renameStageAction"];
  createTaskAction: Props["createTaskAction"];
  priorityAction: Props["priorityAction"];
  pipelineId: string;
  concluirAction: Props["concluirAction"];
  reabrirAction: Props["reabrirAction"];
  stages: StageOption[];
  deleteAction?: Props["deleteAction"];
  dragId: string | null;
  onDragStartRow: (id: string) => void;
  onDragEndRow: () => void;
  onDropStage: (stageId: string) => void;
  onDropOnRow: (targetId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  return (
    <tbody
      className={dragOver ? "bg-brand/[0.05]" : undefined}
      onDragOver={(e) => { if (dragId) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (dragId) onDropStage(stage.id);
      }}
    >
      <tr className="border-t border-border first:border-t-0">
        <td colSpan={5} className="pt-3 pb-1.5 px-4">
          <StageGroupHeader
            stage={stage}
            count={items.length}
            collapsed={collapsed}
            onToggleCollapsed={() => setCollapsed((v) => !v)}
            canAct={canAct}
            renameStageAction={renameStageAction}
          />
        </td>
      </tr>

      {!collapsed && (
        <>
          {items.map((item) => (
            <Row
              key={item.id}
              item={item}
              basePath={basePath}
              canAct={canAct}
              priorityAction={priorityAction}
              pipelineId={pipelineId}
              concluirAction={concluirAction}
              reabrirAction={reabrirAction}
              stages={stages}
              deleteAction={deleteAction}
              dragId={dragId}
              onDragStartRow={onDragStartRow}
              onDragEndRow={onDragEndRow}
              onDropOnRow={onDropOnRow}
            />
          ))}

          {items.length === 0 && dragId && (
            <tr>
              <td colSpan={5} className="h-8" style={{ paddingLeft: CONTENT_OFFSET }}>
                <p className="text-fs-1 text-fg-muted">Solte aqui para mover</p>
              </td>
            </tr>
          )}

          {canAct && (
            <tr>
              <td colSpan={5} className="py-1.5" style={{ paddingLeft: CONTENT_OFFSET }}>
                <AddTaskInline stageId={stage.id} createTaskAction={createTaskAction} />
              </td>
            </tr>
          )}
        </>
      )}
    </tbody>
  );
}

function StageGroupCards({
  stage, items, basePath, canAct, renameStageAction, createTaskAction, priorityAction, pipelineId, concluirAction, reabrirAction, stages, moveAction, deleteAction,
}: {
  stage: StageOption;
  items: TaskRow[];
  basePath: string;
  canAct: boolean;
  renameStageAction: Props["renameStageAction"];
  createTaskAction: Props["createTaskAction"];
  priorityAction: Props["priorityAction"];
  pipelineId: string;
  concluirAction: Props["concluirAction"];
  reabrirAction: Props["reabrirAction"];
  stages: StageOption[];
  moveAction: Props["moveAction"];
  deleteAction?: Props["deleteAction"];
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="pt-3 first:pt-0">
      <div className="px-1 pb-2">
        <StageGroupHeader
          stage={stage}
          count={items.length}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((v) => !v)}
          canAct={canAct}
          renameStageAction={renameStageAction}
        />
      </div>

      {!collapsed && (
        <div className="space-y-2">
          {items.map((item) => (
            <TaskCard
              key={item.id}
              item={item}
              basePath={basePath}
              canAct={canAct}
              priorityAction={priorityAction}
              pipelineId={pipelineId}
              concluirAction={concluirAction}
              reabrirAction={reabrirAction}
              stages={stages}
              moveAction={moveAction}
              deleteAction={deleteAction}
            />
          ))}

          {canAct && (
            <div className="px-1 pt-0.5">
              <AddTaskInline stageId={stage.id} createTaskAction={createTaskAction} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Distância da borda (px) que já dispara o auto-scroll, e velocidade máxima.
const EDGE_ZONE = 80;
const MAX_SCROLL_SPEED = 18;

// Visão alternativa ao Kanban: mesmas tarefas, agrupadas por status (stage) em
// vez de colunas, numa tabela real (colunas fixas: Tarefa/Tags/Responsáveis/
// Prazo, header sticky) — status renomeável inline, grupos colapsáveis,
// criação rápida por status. Mudar o status de uma tarefa é feito arrastando
// a linha pra outro grupo (mesma linguagem do quadro Kanban); soltar em cima
// de outra tarefa do MESMO grupo reordena (troca adjacente, igual ao checklist).
//
// Abaixo de md a tabela vira lista de cards (StageGroupCards): as 5 colunas
// fixas somavam ~340px de largura reservada e esmagavam o título no celular.
// Os cards perdem o drag-and-drop — que já não funcionava no toque — e ganham
// um select de status no lugar.
export function TaskListView({ basePath, pipelineId, stages, items, canAct, renameStageAction, createTaskAction, priorityAction, moveAction, reorderAction, concluirAction, reabrirAction, deleteAction }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollSpeedRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // As tarefas que o funil das colunas deixa à vista, avisadas pela
  // TabelaFiltravel; `null` até o primeiro aviso (tudo à vista).
  const [naTela, setNaTela] = useState<Set<string> | null>(null);

  const byStage = stages.map((stage) => ({
    stage,
    items: items.filter((i) => i.stageId === stage.id),
  }));

  // Funil por coluna (02/10/2026). A linha aqui não é a `LinhaFiltravel` — ela
  // arrasta, tem subtarefas e vive em <tbody> por status —, então o filtro
  // entra dentro de cada grupo, que continua com o cabeçalho mesmo vazio (dá
  // para soltar nele). Filtra só a tarefa; a subtarefa vem com a mãe. Os
  // cartões do celular, sem funil, seguem com a lista inteira.
  const byStageNaTabela = naTela
    ? byStage.map((g) => ({ ...g, items: g.items.filter((i) => naTela.has(i.id)) }))
    : byStage;
  const porNome = (a: string, b: string) => a.localeCompare(b, "pt-BR");
  const linhasDoFunil = items.map((i) => ({
    id: i.id,
    valores: {
      tarefa: i.entityName,
      tags: (i.tags ?? []).map((t) => t.name).sort(porNome).join(", "),
      responsaveis: (i.assignees ?? []).map((a) => a.name).sort(porNome).join(", "),
      prazo: i.dueDate ? i.dueDate.slice(0, 10) : "",
    },
  }));

  function handleDropStage(stageId: string) {
    const id = dragId;
    setDragId(null);
    if (!id) return;
    startTransition(() => moveAction(id, stageId));
  }

  function handleDropOnRow(targetId: string) {
    const id = dragId;
    setDragId(null);
    if (!id || id === targetId) return;
    const source = items.find((i) => i.id === id);
    const target = items.find((i) => i.id === targetId);
    if (!source || !target) return;
    if (source.stageId !== target.stageId) {
      startTransition(() => moveAction(id, target.stageId));
      return;
    }
    const siblings = items.filter((i) => i.stageId === target.stageId);
    const fromIndex = siblings.findIndex((i) => i.id === id);
    const toIndex = siblings.findIndex((i) => i.id === targetId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
    const direction = toIndex > fromIndex ? "down" : "up";
    const steps = Math.abs(toIndex - fromIndex);
    startTransition(async () => {
      for (let i = 0; i < steps; i++) await reorderAction(id, direction);
    });
  }

  // Auto-scroll ao arrastar perto das bordas — ouve dragover no documento
  // inteiro (não só no container) pra não depender de qual linha específica
  // está sob o cursor no momento.
  useEffect(() => {
    if (!dragId) return;

    function stop() {
      scrollSpeedRef.current = 0;
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }

    function tick() {
      const el = scrollRef.current;
      if (el && scrollSpeedRef.current !== 0) {
        el.scrollTop += scrollSpeedRef.current;
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    }

    function onDocDragOver(e: DragEvent) {
      const el = scrollRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const y = e.clientY;
      let speed = 0;
      if (y >= rect.top && y < rect.top + EDGE_ZONE) {
        speed = -MAX_SCROLL_SPEED * (1 - (y - rect.top) / EDGE_ZONE);
      } else if (y <= rect.bottom && y > rect.bottom - EDGE_ZONE) {
        speed = MAX_SCROLL_SPEED * (1 - (rect.bottom - y) / EDGE_ZONE);
      }
      scrollSpeedRef.current = speed;
      if (speed !== 0 && rafRef.current == null) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }

    document.addEventListener("dragover", onDocDragOver);
    document.addEventListener("dragend", stop);
    document.addEventListener("drop", stop);
    return () => {
      document.removeEventListener("dragover", onDocDragOver);
      document.removeEventListener("dragend", stop);
      document.removeEventListener("drop", stop);
      stop();
    };
  }, [dragId]);

  return (
    // A raiz virou coluna (02/10/2026) para a faixa "Filtro nas colunas" da
    // TabelaFiltravel caber acima do casco; a rolagem continua no casco.
    <div className="h-full flex flex-col min-h-0">
      <TabelaFiltravel linhas={linhasDoFunil} onLinhasVisiveis={setNaTela}>
        <div
          ref={scrollRef}
          // Sem padding no topo: o padding do container ficava ACIMA do <thead>
          // sticky, então as linhas rolavam por dentro dessa faixa de 8px e
          // apareciam recortadas por cima do cabeçalho. Agora o respiro superior
          // vive no próprio <th> (pt-2), que gruda junto. Sem padding dos lados
          // também (30/09): o cabeçalho com fundo encosta na borda, como na tabela
          // padrão, e o respiro de 8px passou para a primeira e a última célula.
          className="scroll-y bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] pb-2 flex-1 min-h-0 overflow-y-auto"
        >
          <div className="md:hidden px-2 pt-2">
            {byStage.map(({ stage, items: stageItems }) => (
              <StageGroupCards
                key={stage.id}
                stage={stage}
                items={stageItems}
                basePath={basePath}
                canAct={canAct}
                renameStageAction={renameStageAction}
                createTaskAction={createTaskAction}
                priorityAction={priorityAction}
                pipelineId={pipelineId}
                concluirAction={concluirAction}
                reabrirAction={reabrirAction}
                stages={stages}
                moveAction={moveAction}
                deleteAction={deleteAction}
              />
            ))}
          </div>

          <table className="hidden md:table w-full border-collapse text-ui">
            {/* O fundo precisa estar em cada <th>, não no <thead>: background em
                thead/tr não pinta de forma confiável com position:sticky, e as
                linhas apareciam por trás do cabeçalho ao rolar. A borda inferior
                fecha visualmente a faixa fixa. */}
            {/* Casco padrão sem a `.c41-tabela` (30/09): ela centraliza tudo, e
                aqui a primeira coluna é uma árvore — tarefa e subtarefas se leem
                pelo recuo à esquerda — com cabeçalhos de grupo em colSpan. Fica o
                resto do padrão: cabeçalho com fundo, borda e fio azul no hover
                (`c41-linha`). */}
            <thead className="sticky top-0 z-10">
              <tr className="text-left">
                <th className={`${DOT_COL} bg-table-header-bg pt-2.5 pb-2 border-b border-border`} />
                <th className="text-fs-1 font-semibold text-fg-muted uppercase tracking-wide bg-table-header-bg pt-2.5 pb-2 px-2 border-b border-border">
                  <FiltroDaColuna rotulo="Tarefa" chave="tarefa" />
                </th>
                <th className="text-fs-1 font-semibold text-fg-muted uppercase tracking-wide bg-table-header-bg pt-2.5 pb-2 px-2 w-44 border-b border-border">
                  <FiltroDaColuna rotulo="Tags" chave="tags" />
                </th>
                <th className="text-fs-1 font-semibold text-fg-muted uppercase tracking-wide bg-table-header-bg pt-2.5 pb-2 px-2 w-24 border-b border-border">
                  <FiltroDaColuna rotulo="Responsáveis" chave="responsaveis" align="right" />
                </th>
                <th className="text-fs-1 font-semibold text-fg-muted uppercase tracking-wide bg-table-header-bg pt-2.5 pb-2 pl-2 pr-4 w-[120px] text-right border-b border-border">
                  <FiltroDaColuna rotulo="Prazo" chave="prazo" tipo="data" align="right" />
                </th>
              </tr>
            </thead>
            {byStageNaTabela.map(({ stage, items: stageItems }) => (
              <StageGroup
                key={stage.id}
                stage={stage}
                items={stageItems}
                basePath={basePath}
                canAct={canAct}
                renameStageAction={renameStageAction}
                createTaskAction={createTaskAction}
                priorityAction={priorityAction}
                pipelineId={pipelineId}
                concluirAction={concluirAction}
                reabrirAction={reabrirAction}
                stages={stages}
                deleteAction={deleteAction}
                dragId={dragId}
                onDragStartRow={setDragId}
                onDragEndRow={() => setDragId(null)}
                onDropStage={handleDropStage}
                onDropOnRow={handleDropOnRow}
              />
            ))}
          </table>
        </div>
      </TabelaFiltravel>
    </div>
  );
}
