"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { ChevronRight, ChevronDown, Plus, Repeat } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { prazoDaTarefa } from "@/lib/kanbanPrazo";
import { formatCalendarDate } from "@/lib/format";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { StageDot, type StageDotType } from "@/components/kanban/StageDot";
import { darkenUntilReadableOnWhiteText } from "@/lib/color";
import { RowActionsMenu } from "@/components/kanban/RowActionsMenu";
import { Button } from "@/components/ui/Button";
import { TabelaFiltravel, FiltroDaColuna } from "@/components/shared/FiltroDeColunas";
import { EtiquetaColorida } from "@/components/ui/EtiquetaColorida";
import { useToast } from "@/components/ui/Toast";
import { NovaTarefaEmLinha, useNovaTarefaDoTopo } from "@/components/kanban/NovaTarefaEmLinha";
import { useConcluirComSubatividades } from "@/components/kanban/useConcluirComSubatividades";
import { aceitaSubatividade } from "@/lib/kanban/subatividades";

export type AssigneeRow = { id: string; name: string; priority: number };
/** A subatividade, em qualquer nível — com as filhas dela em `subtasks` (06/11/2026). */
export type SubtaskRow = {
  id: string; stageId: string; entityName: string; stageName: string; isTerminal: boolean; priority: number;
  assignees?: AssigneeRow[]; dueDate?: string | null; tags?: { id: string; name: string; color: string }[]; recurring?: boolean;
  subtasks?: SubtaskRow[];
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
  moveAction: (itemId: string, newStageId: string) => Promise<{ error: string } | void>;
  /** Soltar uma linha em cima de outra do mesmo nível: ela vai para o lugar da outra. */
  repositionAction: (itemId: string, alvoId: string) => Promise<{ error: string } | void>;
  /** `{ error }` quando o servidor recusa — o cartão de uma solicitação (09/11/2026). */
  concluirAction: (pipelineId: string, itemId: string, comSubatividades?: boolean) => Promise<{ error: string } | void>;
  reabrirAction: (pipelineId: string, itemId: string) => Promise<{ error: string } | void>;
  /** O "+ Adicionar subatividade" de cada nível. Ausente = sem criar (quem só vê ou comenta). */
  createSubtaskAction?: (parentItemId: string, title: string) => Promise<{ error: string } | void>;
  /** Exclui a tarefa (ou subtarefa — subtarefa cai em cascata pelo parentItemId).
   * Ausente = sem opção de excluir, para quem não administra o setor. */
  deleteAction?: (itemId: string) => Promise<void>;
};

/** O que toda linha da árvore usa igual, em qualquer nível. */
type Comum = {
  basePath: string;
  pipelineId: string;
  canAct: boolean;
  stages: StageOption[];
  priorityAction: Props["priorityAction"];
  /** Reabre e avisa quando o servidor recusa (o `reabrirAction` com o aviso já embutido). */
  reabrirAction: (pipelineId: string, itemId: string) => Promise<void>;
  /** Conclui pela pergunta das subatividades abertas (`useConcluirComSubatividades`). */
  concluir: (item: TaskRow | SubtaskRow) => void;
  createSubtaskAction?: Props["createSubtaskAction"];
  deleteAction?: Props["deleteAction"];
};

/** As subatividades abaixo, em todos os níveis — o "vão junto" de excluir. */
function contarAbaixo(item: TaskRow | SubtaskRow): number {
  return (item.subtasks ?? []).reduce((n, s) => n + 1 + contarAbaixo(s), 0);
}

/** As abertas abaixo, em todos os níveis — a pergunta de concluir. */
function abertasAbaixo(item: TaskRow | SubtaskRow): number {
  return (item.subtasks ?? []).reduce((n, s) => n + (s.isTerminal ? 0 : 1) + abertasAbaixo(s), 0);
}

/**
 * O "0/1" ao lado do nome: as filhas diretas concluídas sobre o total, em
 * cada nível (a neta conta no nível dela). O leitor de tela ouve por extenso.
 */
function ContadorDeFilhas({ filhas }: { filhas: SubtaskRow[] }) {
  const feitas = filhas.filter((f) => f.isTerminal).length;
  const extenso = `${feitas} de ${filhas.length} ${filhas.length === 1 ? "subatividade concluída" : "subatividades concluídas"}`;
  return (
    <span className="text-fs-1 text-fg-muted flex-shrink-0 tnum" data-dica={extenso}>
      <span aria-hidden>
        {feitas}/{filhas.length}
      </span>
      <span className="sr-only">{extenso}</span>
    </span>
  );
}

// Escala de indentação da árvore. Antes só existia `depth * 20` aplicado aos
// itens, o que deixava três problemas: o cabeçalho de status nascia no mesmo
// x dos itens (nada indicava que um está dentro do outro), a coluna de 56px
// não comportava o recuo do primeiro nível de subtarefa — que ficava espremido
// contra a bolinha — e cada nível novo herdava esse aperto.
const ITEM_INDENT = 16; // item de 1º nível, medido a partir do cabeçalho de status
const DEPTH_STEP = 20; // cada nível de subtarefa
// Coluna da bolinha: o recuo + chevron + bolinha da atividade de cima, mais
// os 8px da borda, que eram padding do casco até o polimento de 30/09 e agora
// são da própria célula (o cabeçalho com fundo precisa encostar na borda).
const DOT_COL = "w-[104px]";
// Alinha "Adicionar atividade" e o alvo de soltar com o texto dos itens.
const CONTENT_OFFSET = 104;
// Com subatividade em vários níveis (06/11/2026), seta, bolinha e nome descem
// juntos a cada nível, como no ClickUp: a linha ocupa as duas primeiras colunas
// (colSpan 2), e o "calço" da seta e da bolinha cresce DEPTH_STEP por nível.
// Era a bolinha que andava dentro da coluna de 104px, com o nome parado no
// mesmo x — dois níveis cabiam, o quinto não. O calço da atividade de cima é a
// coluna menos o pl-4 da célula, e o nome dela continua em 104px.
const CALCO = CONTENT_OFFSET - 16;

const PRIORITY_LABEL: Record<number, string> = { 0: "Normal", 1: "Alta", 2: "Urgente" };
const PRIORITY_COLOR: Record<number, string> = {
  0: "var(--c41-fg-muted)",
  1: "var(--c41-warning)",
  2: "var(--c41-danger)",
};


function AssigneeAvatar({ a, itemId, canAct, priorityAction }: { a: AssigneeRow; itemId: string; canAct: boolean; priorityAction: Props["priorityAction"] }) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const menuRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const fora = (e: PointerEvent) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla);
    return () => { document.removeEventListener("pointerdown", fora); document.removeEventListener("keydown", tecla); };
  }, [open]);

  return (
    <span ref={menuRef} className="relative">
      <button
        type="button"
        // A dica diz o que o clique faz: sem ela, ninguém sabia que o avatar
        // abre a prioridade do responsável (Ajustes de 27/10/2026).
        data-dica={`${a.name} · prioridade ${(PRIORITY_LABEL[a.priority] ?? "Normal").toLowerCase()}${canAct ? " · clique para mudar" : ""}`}
        aria-label={`${a.name} · prioridade ${(PRIORITY_LABEL[a.priority] ?? "Normal").toLowerCase()}`}
        aria-haspopup={canAct ? "menu" : undefined}
        aria-expanded={canAct ? open : undefined}
        onClick={(e) => {
          if (!canAct) return;
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        // 24px (07/10/2026): as iniciais saíram de 9px para os 11px da escala,
        // e não cabiam duas letras dentro da borda de prioridade num círculo de 20px.
        // Clicável, ganha o realce de botão no hover/foco e sobe sobre os vizinhos.
        className={`relative w-6 h-6 rounded-full bg-surface-hover border-2 flex items-center justify-center text-micro font-medium text-fg-secondary transition-[box-shadow,transform] ${
          canAct
            ? "cursor-pointer hover:z-10 hover:scale-110 hover:shadow-[0_0_0_2px_var(--c41-surface),0_0_0_4px_var(--c41-brand)] focus-visible:z-10 focus-visible:shadow-[0_0_0_2px_var(--c41-surface),0_0_0_4px_var(--c41-brand)] focus-visible:outline-none"
            : "cursor-default"
        }`}
        style={{ borderColor: PRIORITY_COLOR[a.priority] ?? PRIORITY_COLOR[0] }}
      >
        {a.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()}
      </button>
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          role="menu"
          className="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 bg-surface-elevated border border-border-strong rounded-lg shadow-[var(--c41-shadow-lg)] p-1 w-36"
        >
          <p className="c41-rotulo px-2 pt-1 pb-1.5 text-left">Prioridade</p>
          {[0, 1, 2].map((p) => (
            <button
              key={p}
              type="button"
              role="menuitem"
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
  item, comum, depth = 0, dragId, onDragStartRow, onDragEndRow, onDropOnRow,
}: {
  item: TaskRow | SubtaskRow;
  comum: Comum;
  depth?: number;
  dragId: string | null;
  onDragStartRow: (id: string) => void;
  onDragEndRow: () => void;
  onDropOnRow: (targetId: string) => void;
}) {
  const { basePath, canAct, priorityAction, pipelineId, reabrirAction, concluir, stages, deleteAction, createSubtaskAction } = comum;
  // Recolhível começa fechado (08/10/2026), em todo nível.
  const [expanded, setExpanded] = useState(false);
  // Cada clique no "+" monta o campo de novo, já aberto; 0 = o botão fechado.
  const [pedidoDeNova, setPedidoDeNova] = useState(0);
  const [, startTransition] = useTransition();
  const idDoMais = useId();
  const filhas = item.subtasks ?? [];
  const hasSubtasks = filhas.length > 0;
  const podeAdicionar = canAct && !!createSubtaskAction && aceitaSubatividade(depth);
  const dueDate = item.dueDate;
  const assignees = item.assignees ?? [];
  const stage = stages.find((s) => s.id === item.stageId);
  const isTerminal = "isTerminal" in item ? item.isTerminal : (stage?.isTerminal ?? false);
  const stageColor = stage?.color ?? "var(--c41-fg-muted)";
  const stageType = resolveStageType(isTerminal, stage?.type);
  const tags = item.tags ?? [];
  const dragging = dragId === item.id;
  const recuo = depth * DEPTH_STEP;
  // O campo fechou vazio. Na linha sem filhas, aberta só para ele, a linha
  // fecha — e, no Esc, o foco volta ao "+" que o abriu, em vez de cair no
  // começo da página.
  function aoFecharANova(motivo: "esc" | "fora") {
    setPedidoDeNova(0);
    if (hasSubtasks) return;
    setExpanded(false);
    if (motivo === "esc") requestAnimationFrame(() => document.getElementById(idDoMais)?.focus());
  }

  return (
    <>
      <tr
        draggable={canAct}
        onDragStart={() => onDragStartRow(item.id)}
        onDragEnd={onDragEndRow}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDropOnRow(item.id); }}
        // A linha divisória vive nos <td>, não no <tr>: com `border-collapse`
        // a borda declarada na linha não pinta de forma confiável.
        className={`c41-linha group hover:bg-surface-hover transition-colors [&>td]:border-b [&>td]:border-border/50 ${dragging ? "opacity-40" : ""} ${canAct ? "cursor-grab active:cursor-grabbing" : ""}`}
      >
        <td colSpan={2} className="py-2 pl-4 pr-2 min-w-0">
          <div className="flex items-center min-w-0">
            <div
              className="flex items-center gap-1 flex-shrink-0"
              style={{ width: `${CALCO + recuo}px`, paddingLeft: `${ITEM_INDENT + recuo}px` }}
            >
              {hasSubtasks ? (
                <IconButton
                  type="button"
                  size="sm"
                  onClick={() => {
                    setExpanded((v) => !v);
                    setPedidoDeNova(0);
                  }}
                  className="flex-shrink-0"
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "Recolher" : "Abrir"} as subatividades de ${item.entityName}`}
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
                  if (isTerminal) startTransition(() => reabrirAction(pipelineId, item.id));
                  else concluir(item);
                }}
                aria-label={isTerminal ? "Reabrir atividade" : "Concluir atividade"}
                title={stage?.name ?? ""}
                className="group/dot flex-shrink-0 transition-transform hover:scale-125 disabled:cursor-default disabled:hover:scale-100"
              >
                <StageDot color={stageColor} type={stageType} showCheckOnHover />
              </button>
            </div>

            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Link
                href={`${basePath}/itens/${item.id}`}
                // Cortado, o nome inteiro sai na dica (o `DicaFlutuante` cuida do
                // `.truncate` em tabela) — no 5º nível o recuo já come 100px dele.
                className={`text-fs-3 text-fg group-hover:text-brand transition-colors truncate min-w-0 ${isTerminal ? "text-fg-muted" : ""}`}
              >
                {item.entityName}
              </Link>
              {hasSubtasks && <ContadorDeFilhas filhas={filhas} />}
              {podeAdicionar && (
                // Aparece ao passar o mouse na linha, como no ClickUp — e fica à
                // vista no foco do teclado e em tela de toque, onde não há hover.
                <IconButton
                  id={idDoMais}
                  type="button"
                  size="sm"
                  draggable={false}
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpanded(true);
                    setPedidoDeNova((n) => n + 1);
                  }}
                  aria-label={`Adicionar subatividade em ${item.entityName}`}
                  data-dica="Adicionar subatividade"
                  className="flex-shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100"
                >
                  <Plus size={13} />
                </IconButton>
              )}
            </div>
          </div>
        </td>

        {/* Uma tag só + contador. Antes eram duas com `flex-wrap`, e a segunda
            caía pra linha de baixo dentro de uma coluna de 176px — a linha
            inteira crescia de altura só por causa disso, quebrando o ritmo da
            lista. O contador guarda o resto sem custar altura nenhuma. */}
        {/* Tags, Responsáveis e Prazo centralizados, como as tabelas do casco
            padrão (`.c41-tabela`); só a Atividade, que é árvore, fica à esquerda.
            Cada coluna seguia um lado (Ajustes de 27/10/2026). */}
        <td className="py-2 px-2 w-44">
          {tags.length > 0 && (
            <div className="flex items-center justify-center gap-1 min-w-0">
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

        <td className="py-2 px-2 w-32">
          {assignees.length > 0 && (
            <div className="flex items-center justify-center -space-x-1.5">
              {assignees.slice(0, 3).map((a) => (
                <AssigneeAvatar key={a.id} a={a} itemId={item.id} canAct={canAct} priorityAction={priorityAction} />
              ))}
            </div>
          )}
        </td>

        {/* Prazo e menu dividem a última célula de propósito: as tabelas desta
            tela declaram colSpan={5} em vários pontos (cabeçalho de status,
            alvo de soltar, "Adicionar atividade"), e uma 6ª coluna obrigaria a
            revisar todos eles para ganhar 24px. */}
        {/* O prazo no centro da coluna e o menu encostado na direita: a
            primeira trilha do grid, vazia, tem a largura da última (o menu),
            e o prazo fica no eixo do cabeçalho. */}
        <td className="py-2 pl-2 pr-4 w-[300px]">
          <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_1.75rem] items-center gap-1">
            <span aria-hidden />
            <span className="flex justify-center min-w-0">
              {dueDate && (
                <span className={`inline-flex items-center gap-1 text-ui font-medium tnum whitespace-nowrap ${prazoDaTarefa(dueDate, isTerminal).classe}`}>
                  {item.recurring && <Repeat size={10} />}
                  {formatCalendarDate(new Date(dueDate))} · {prazoDaTarefa(dueDate, isTerminal).rotulo}
                </span>
              )}
            </span>
            <span className="flex justify-end">
              {canAct && deleteAction && (
                <RowActionsMenu name={item.entityName} subatividades={contarAbaixo(item)} onDelete={() => deleteAction(item.id)} />
              )}
            </span>
          </div>
        </td>
      </tr>

      {expanded && filhas.map((s) => (
        <Row
          key={s.id}
          item={s}
          comum={comum}
          depth={depth + 1}
          dragId={dragId}
          onDragStartRow={onDragStartRow}
          onDragEndRow={onDragEndRow}
          onDropOnRow={onDropOnRow}
        />
      ))}

      {/* O "+ Adicionar subatividade" de cada nível, no recuo das filhas — o
          "Adicionar Tarefa" do ClickUp embaixo de cada pai aberto. */}
      {expanded && podeAdicionar && createSubtaskAction && (
        <tr>
          <td colSpan={5} className="py-1.5" style={{ paddingLeft: CONTENT_OFFSET + recuo + DEPTH_STEP }}>
            <NovaTarefaEmLinha
              key={pedidoDeNova}
              stageId={item.id}
              nomeDaColuna={item.entityName}
              criar={createSubtaskAction}
              abertoAoMontar={pedidoDeNova > 0}
              aoFechar={aoFecharANova}
              rotulo="Adicionar subatividade"
              placeholder="Nome da subatividade"
              rotuloDoCampo={`Nome da subatividade nova em ${item.entityName}`}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// Card equivalente a <Row>, usado no lugar da tabela em telas estreitas: as
// mesmas informações empilhadas, sem colunas fixas que espremiam título e
// responsáveis a poucos pixels. Arrastar não é opção no toque (HTML5 drag não
// dispara em touch), então mover de estágio aqui é um select — é o que
// substitui o drag-and-drop da tabela, não um extra.
function TaskCard({
  item, comum, depth = 0, moveAction,
}: {
  item: TaskRow | SubtaskRow;
  comum: Comum;
  depth?: number;
  moveAction: Props["moveAction"];
}) {
  const { basePath, canAct, priorityAction, pipelineId, reabrirAction, concluir, stages, deleteAction, createSubtaskAction } = comum;
  const [expanded, setExpanded] = useState(false);
  const [pedidoDeNova, setPedidoDeNova] = useState(0);
  const [, startTransition] = useTransition();
  const idDoMais = useId();
  const filhas = item.subtasks ?? [];
  const hasSubtasks = filhas.length > 0;
  const podeAdicionar = canAct && !!createSubtaskAction && aceitaSubatividade(depth);
  const dueDate = item.dueDate;
  const assignees = item.assignees ?? [];
  const stage = stages.find((s) => s.id === item.stageId);
  const isTerminal = "isTerminal" in item ? item.isTerminal : (stage?.isTerminal ?? false);
  const stageColor = stage?.color ?? "var(--c41-fg-muted)";
  const stageType = resolveStageType(isTerminal, stage?.type);
  const tags = item.tags ?? [];
  // Como na linha da tabela: no Esc, o foco volta ao "+".
  function aoFecharANova(motivo: "esc" | "fora") {
    setPedidoDeNova(0);
    if (hasSubtasks) return;
    setExpanded(false);
    if (motivo === "esc") requestAnimationFrame(() => document.getElementById(idDoMais)?.focus());
  }

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
            onClick={() => {
              if (isTerminal) startTransition(() => reabrirAction(pipelineId, item.id));
              else concluir(item);
            }}
            aria-label={isTerminal ? "Reabrir atividade" : "Concluir atividade"}
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
              onClick={() => {
                setExpanded((v) => !v);
                setPedidoDeNova(0);
              }}
              aria-expanded={expanded}
              aria-label={`${expanded ? "Recolher" : "Abrir"} as subatividades de ${item.entityName}`}
            >
              <span className="text-fs-1 tnum">
                {filhas.filter((s) => s.isTerminal).length}/{filhas.length}
              </span>
              <ChevronRight size={14} className={`transition-transform ${expanded ? "rotate-90" : ""}`} />
            </Button>
          )}

          {/* No toque não há hover: o "+" do cartão fica sempre à vista. */}
          {podeAdicionar && (
            <IconButton
              id={idDoMais}
              type="button"
              size="sm"
              onClick={() => {
                setExpanded(true);
                setPedidoDeNova((n) => n + 1);
              }}
              aria-label={`Adicionar subatividade em ${item.entityName}`}
              data-dica="Adicionar subatividade"
            >
              <Plus size={13} />
            </IconButton>
          )}

          {canAct && deleteAction && (
            <RowActionsMenu name={item.entityName} subatividades={contarAbaixo(item)} onDelete={() => deleteAction(item.id)} />
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
              <span className={`inline-flex items-center gap-1 text-ui font-medium tnum whitespace-nowrap ${prazoDaTarefa(dueDate, isTerminal).classe}`}>
                {item.recurring && <Repeat size={10} />}
                {formatCalendarDate(new Date(dueDate))} · {prazoDaTarefa(dueDate, isTerminal).rotulo}
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
              if (newStageId !== item.stageId) {
                startTransition(async () => {
                  await moveAction(item.id, newStageId);
                });
              }
            }}
            className="w-full"
          >
            {stages.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        )}
      </div>

      {expanded && filhas.map((s) => (
        <TaskCard key={s.id} item={s} comum={comum} depth={depth + 1} moveAction={moveAction} />
      ))}

      {expanded && podeAdicionar && createSubtaskAction && (
        <div className="px-1" style={{ marginLeft: (depth + 1) * 14 }}>
          <NovaTarefaEmLinha
            key={pedidoDeNova}
            stageId={item.id}
            nomeDaColuna={item.entityName}
            criar={createSubtaskAction}
            abertoAoMontar={pedidoDeNova > 0}
            aoFechar={aoFecharANova}
            rotulo="Adicionar subatividade"
            placeholder="Nome da subatividade"
            rotuloDoCampo={`Nome da subatividade nova em ${item.entityName}`}
          />
        </div>
      )}
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
      <IconButton type="button" size="sm" onClick={onToggleCollapsed} aria-label={collapsed ? "Expandir o estágio" : "Recolher o estágio"} aria-expanded={!collapsed} className="flex-shrink-0">
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

// Criação em linha, só com o nome (05/11/2026, como no ClickUp) — era um link
// para o formulário em janela. O formulário segue no link do próprio campo,
// para a atividade de uma empresa ou pessoa.
function AddTaskInline({
  stage, basePath, createTaskAction, sinalParaAbrir,
}: { stage: StageOption; basePath: string; createTaskAction: Props["createTaskAction"]; sinalParaAbrir: number }) {
  return (
    <NovaTarefaEmLinha
      stageId={stage.id}
      nomeDaColuna={stage.name}
      criar={createTaskAction}
      hrefDoFormulario={`${basePath}/novo-item?estagio=${encodeURIComponent(stage.id)}`}
      sinalParaAbrir={sinalParaAbrir}
    />
  );
}

function StageGroup({
  stage, items, comum, renameStageAction, createTaskAction,
  dragId, onDragStartRow, onDragEndRow, onDropStage, onDropOnRow, primeiro = false,
}: {
  stage: StageOption;
  items: TaskRow[];
  comum: Comum;
  renameStageAction: Props["renameStageAction"];
  createTaskAction: Props["createTaskAction"];
  dragId: string | null;
  onDragStartRow: (id: string) => void;
  onDragEndRow: () => void;
  onDropStage: (stageId: string) => void;
  onDropOnRow: (targetId: string) => void;
  /** O primeiro grupo atende ao "+ Nova tarefa" do topo. */
  primeiro?: boolean;
}) {
  const { basePath, canAct } = comum;
  const [collapsed, setCollapsed] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const sinalDoTopo = useNovaTarefaDoTopo(primeiro && canAct, () => setCollapsed(false));

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
              comum={comum}
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
                <AddTaskInline stage={stage} basePath={basePath} createTaskAction={createTaskAction} sinalParaAbrir={sinalDoTopo} />
              </td>
            </tr>
          )}
        </>
      )}
    </tbody>
  );
}

function StageGroupCards({
  stage, items, comum, renameStageAction, createTaskAction, moveAction,
  primeiro = false,
}: {
  stage: StageOption;
  items: TaskRow[];
  comum: Comum;
  renameStageAction: Props["renameStageAction"];
  createTaskAction: Props["createTaskAction"];
  moveAction: Props["moveAction"];
  primeiro?: boolean;
}) {
  const { basePath, canAct } = comum;
  const [collapsed, setCollapsed] = useState(false);
  const sinalDoTopo = useNovaTarefaDoTopo(primeiro && canAct, () => setCollapsed(false));

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
            <TaskCard key={item.id} item={item} comum={comum} moveAction={moveAction} />
          ))}

          {canAct && (
            <div className="px-1 pt-0.5">
              <AddTaskInline stage={stage} basePath={basePath} createTaskAction={createTaskAction} sinalParaAbrir={sinalDoTopo} />
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
// de outra do mesmo grupo — ou, na subatividade, do mesmo pai — muda o lugar
// dela (ver `handleDropOnRow`). Cada atividade abre as subatividades dela,
// nível a nível, até o limite de `src/lib/kanban/subatividades.ts`.
//
// Abaixo de md a tabela vira lista de cards (StageGroupCards): as 5 colunas
// fixas somavam ~340px de largura reservada e esmagavam o título no celular.
// Os cards perdem o drag-and-drop — que já não funcionava no toque — e ganham
// um select de status no lugar.
export function TaskListView({ basePath, pipelineId, stages, items, canAct, renameStageAction, createTaskAction, createSubtaskAction, priorityAction, moveAction: moverNoServidor, repositionAction, concluirAction, reabrirAction, deleteAction }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const toast = useToast();
  const { dialog: perguntaDeConcluir, concluir: concluirPerguntando } = useConcluirComSubatividades();

  const comum: Comum = {
    basePath,
    pipelineId,
    canAct,
    stages,
    priorityAction,
    // O cartão de uma solicitação encerrada não reabre (09/11/2026): a recusa vira aviso.
    reabrirAction: async (pipeline, itemId) => {
      try {
        const r = await reabrirAction(pipeline, itemId);
        if (r && "error" in r) toast.error(r.error);
      } catch {
        toast.error("Não deu para falar com o servidor. A atividade não foi reaberta.");
      }
    },
    createSubtaskAction,
    deleteAction,
    concluir: (item) =>
      concluirPerguntando({
        nome: item.entityName,
        abertas: abertasAbaixo(item),
        concluir: (comSubatividades) => concluirAction(pipelineId, item.id, comSubatividades),
      }),
  };

  // Cada linha, de qualquer nível, com o pai e a atividade de cima dela — o
  // arrastar decide por aqui o que soltar em cima de outra linha quer dizer.
  const posicao = useMemo(() => {
    const mapa = new Map<string, { pai: string | null; raiz: string; stageId: string }>();
    const percorrer = (lista: SubtaskRow[], pai: string, raiz: string) => {
      for (const s of lista) {
        mapa.set(s.id, { pai, raiz, stageId: s.stageId });
        percorrer(s.subtasks ?? [], s.id, raiz);
      }
    };
    for (const i of items) {
      mapa.set(i.id, { pai: null, raiz: i.id, stageId: i.stageId });
      percorrer(i.subtasks ?? [], i.id, i.id);
    }
    return mapa;
  }, [items]);

  // Toda troca de situação da lista passa por aqui — arrastar, soltar na linha,
  // o seletor do cartão — e avisa quando o servidor recusa ou falha
  // (auditoria de UX, 30/10/2026). Antes era "dispara e esquece": a tarefa
  // ficava onde estava sem ninguém saber por quê.
  async function moveAction(itemId: string, newStageId: string) {
    try {
      const r = await moverNoServidor(itemId, newStageId);
      if (r && "error" in r) toast.error(r.error);
    } catch {
      toast.error("Não deu para falar com o servidor. A tarefa continua na situação de antes.");
    }
  }
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

  // Soltar uma linha em cima de outra (06/11/2026, com a árvore):
  // - atividade de cima em outra de cima: outra coluna muda a situação; a
  //   mesma, troca de lugar — como sempre foi;
  // - atividade de cima numa subatividade: vale a atividade de cima dela (a
  //   linha do grupo em que caiu);
  // - subatividade em outra do mesmo pai: troca de lugar entre as irmãs, de
  //   qualquer coluna. De outro pai, não muda de pai: avisa.
  function handleDropOnRow(targetId: string) {
    const id = dragId;
    setDragId(null);
    if (!id || id === targetId) return;
    const source = posicao.get(id);
    const target = posicao.get(targetId);
    if (!source || !target) return;

    let alvo = targetId;
    if (source.pai === null) {
      const raiz = posicao.get(target.raiz);
      if (!raiz || raiz.stageId !== source.stageId) {
        if (raiz) startTransition(() => moveAction(id, raiz.stageId));
        return;
      }
      alvo = target.raiz;
      if (alvo === id) return;
    } else if (source.pai !== target.pai) {
      toast.error("Arrastando, a subatividade muda de lugar só entre as do mesmo nível, embaixo do mesmo pai.");
      return;
    }

    startTransition(async () => {
      try {
        const r = await repositionAction(id, alvo);
        if (r && "error" in r) toast.error(r.error);
      } catch {
        toast.error("Não deu para falar com o servidor. A ordem não mudou.");
      }
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
            {byStage.map(({ stage, items: stageItems }, i) => (
              <StageGroupCards
                key={stage.id}
                primeiro={i === 0}
                stage={stage}
                items={stageItems}
                comum={comum}
                renameStageAction={renameStageAction}
                createTaskAction={createTaskAction}
                moveAction={moveAction}
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
                (`c41-linha`), e o cabeçalho padrão pela `c41-cabecalho-dividido`
                (14/10/2026): o fio entre as colunas e o funil na borda direita
                da coluna, fora do rótulo. O rótulo segue o lado das células —
                à esquerda (`c41-a-esquerda`) na Atividade e no centro nas
                outras (27/10/2026). */}
            <thead className="c41-cabecalho-dividido sticky top-0 z-10">
              <tr className="text-left">
                <th className={`${DOT_COL} bg-table-header-bg pt-2.5 pb-2 border-b border-border`} />
                <th className="c41-a-esquerda text-fs-1 font-semibold text-fg-muted uppercase tracking-wide bg-table-header-bg pt-2.5 pb-2 px-2 border-b border-border">
                  <FiltroDaColuna rotulo="Atividade" chave="tarefa" />
                </th>
                <th className="text-center text-fs-1 font-semibold text-fg-muted uppercase tracking-wide bg-table-header-bg pt-2.5 pb-2 px-2 w-44 border-b border-border">
                  <FiltroDaColuna rotulo="Tags" chave="tags" />
                </th>
                <th className="text-center text-fs-1 font-semibold text-fg-muted uppercase tracking-wide bg-table-header-bg pt-2.5 pb-2 px-2 w-32 border-b border-border">
                  <FiltroDaColuna rotulo="Responsáveis" chave="responsaveis" align="right" />
                </th>
                <th className="text-center text-fs-1 font-semibold text-fg-muted uppercase tracking-wide bg-table-header-bg pt-2.5 pb-2 pl-2 pr-4 w-[300px] border-b border-border">
                  <FiltroDaColuna rotulo="Prazo" chave="prazo" tipo="data" align="right" />
                </th>
              </tr>
            </thead>
            {byStageNaTabela.map(({ stage, items: stageItems }, i) => (
              <StageGroup
                key={stage.id}
                primeiro={i === 0}
                stage={stage}
                items={stageItems}
                comum={comum}
                renameStageAction={renameStageAction}
                createTaskAction={createTaskAction}
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
      {perguntaDeConcluir}
    </div>
  );
}
