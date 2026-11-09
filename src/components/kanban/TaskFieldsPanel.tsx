"use client";

import { useId, useState, useTransition } from "react";
import { Check, CheckCircle2, ChevronDown, Circle, Eye, Flag, Play, Plus, Square, Tag as TagIcon, Timer, Users, Calendar, Repeat } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { TempoDecorrido } from "@/components/kanban/TempoDecorrido";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { Checkbox } from "@/components/ui/Checkbox";
import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";
import { TagToggleList } from "@/components/kanban/TagToggleList";
import { AssigneeToggleList } from "@/components/kanban/AssigneeToggleList";
import type { PipelineState } from "@/app/(app)/kanban/actions";
import { EtiquetaColorida } from "@/components/ui/EtiquetaColorida";
import { Selo } from "@/components/ui/Selo";
import { useToast } from "@/components/ui/Toast";
import type { StageDotType } from "@/components/kanban/StageDot";
import { useConcluirComSubatividades } from "@/components/kanban/useConcluirComSubatividades";
import {
  CAMPOS_EXTRAS,
  OPCOES_DE_PRIORIDADE,
  ROTULO_DA_PRIORIDADE,
  ROTULO_DO_CAMPO_EXTRA,
  TOM_DA_ETAPA,
  VAZIO,
  datasNoCampo,
  extrasVisiveis,
  prioridadeNoCampo,
  type CampoExtra,
} from "@/lib/kanban/camposDaTarefa";

type StageOption = { id: string; name: string; type?: StageDotType };

type TagOption = { id: string; name: string; color: string };
type UserOption = { id: string; name: string };

const PRIORITY_COLOR: Record<number, string> = {
  0: "var(--c41-fg-muted)",
  1: "var(--c41-warning)",
  2: "var(--c41-danger)",
};
const FREQUENCY_LABEL: Record<string, string> = { DAILY: "Diária", WEEKLY: "Semanal", BIWEEKLY: "Quinzenal", MONTHLY: "Mensal" };


function FieldRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    // min-h-9: a linha tem a mesma altura com texto, selo ou botão do lado
    // direito — antes cada propriedade subia ou descia conforme o conteúdo.
    <div className="flex items-center gap-3 py-1 min-h-9">
      <div className="flex items-center gap-2 w-40 flex-shrink-0 text-fs-3 text-fg-muted">
        {icon}
        {label}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

type Props = {
  canAct: boolean;
  itemId: string;
  stages: StageOption[];
  currentStageId: string;
  moveAction: (itemId: string, newStageId: string) => Promise<{ error: string } | void>;

  /** "Marcar como concluída" ao lado da situação (05/11/2026); concluída, o aviso verde acima tem o Reabrir. */
  isCompleted?: boolean;
  concluirAction?: (comSubatividades?: boolean) => Promise<{ error: string } | void>;
  /** As subatividades abertas abaixo, em todos os níveis: com alguma, concluir pergunta antes (06/11/2026). */
  subatividadesAbertas?: number;
  /** O nome na pergunta de concluir. */
  nomeDaTarefa?: string;

  dueDate: string | null;
  startDate: string | null;
  recurring: boolean;
  recurrenceFrequency: string | null;
  priority: number;
  datesAction: (prev: PipelineState, form: FormData) => Promise<PipelineState>;

  estimateMinutes: number | null;
  estimateAction: (minutes: string) => Promise<void>;

  activeTimer: { userId: string; userName: string; startedAt: string } | null;
  currentUserId: string | null;
  startTimerAction: () => Promise<void>;
  stopTimerAction: () => Promise<void>;

  allTags: TagOption[];
  selectedTagIds: string[];
  tagToggleAction: (tagId: string, marcado: boolean) => Promise<void>;

  allUsers: UserOption[];
  selectedUserIds: string[];
  assigneeToggleAction: (userId: string, marcado: boolean) => Promise<void>;

  selectedWatcherIds: string[];
  watcherToggleAction: (userId: string, marcado: boolean) => Promise<void>;
};

export function TaskFieldsPanel({
  canAct, itemId, stages, currentStageId, moveAction,
  isCompleted = false, concluirAction, subatividadesAbertas = 0, nomeDaTarefa = "esta atividade",
  dueDate, startDate, recurring, recurrenceFrequency, priority, datesAction,
  estimateMinutes, estimateAction,
  activeTimer, currentUserId, startTimerAction, stopTimerAction,
  allTags, selectedTagIds, tagToggleAction,
  allUsers, selectedUserIds, assigneeToggleAction,
  selectedWatcherIds, watcherToggleAction,
}: Props) {
  // Os campos extras que a pessoa pediu agora em "Adicionar campo" (05/11/2026).
  const [extrasPedidos, setExtrasPedidos] = useState<CampoExtra[]>([]);
  const [mudando, startTransition] = useTransition();
  const { dialog: perguntaDeConcluir, concluir, pendente: concluindoPelaPergunta } = useConcluirComSubatividades();
  const concluindo = mudando || concluindoPelaPergunta;
  const toast = useToast();

  // Trocar a situação avisa quando não grava (auditoria de UX, 30/10/2026).
  function mudarSituacao(stageId: string) {
    startTransition(async () => {
      try {
        const r = await moveAction(itemId, stageId);
        if (r && "error" in r) toast.error(r.error);
      } catch {
        toast.error("Não deu para falar com o servidor. A situação não mudou.");
      }
    });
  }

  const currentStage = stages.find((s) => s.id === currentStageId);
  const currentStageName = currentStage?.name ?? "—";
  const tomDaSituacao = TOM_DA_ETAPA[currentStage?.type ?? "NOT_STARTED"];
  const selectedUsers = allUsers.filter((u) => selectedUserIds.includes(u.id));
  const selectedWatchers = allUsers.filter((u) => selectedWatcherIds.includes(u.id));
  const selectedTags = allTags.filter((t) => selectedTagIds.includes(t.id));

  const hasResponsaveis = selectedUsers.length > 0;
  const hasParticipantes = selectedWatchers.length > 0;
  const hasEtiquetas = selectedTags.length > 0;
  const extras = extrasVisiveis({ participantes: hasParticipantes, estimativa: estimateMinutes != null }, extrasPedidos);
  const extrasParaPedir = CAMPOS_EXTRAS.filter((c) => !extras.has(c));

  return (
    <div className="border-b border-border pb-3 mb-4">
      {/* Os campos na ordem do ClickUp (05/11/2026): Situação, Datas, Rastrear
          tempo, Responsáveis, Prioridade e Etiquetas sempre à vista, "Vazio"
          até alguém preencher; os outros entram por "Adicionar campo".
          "Status" era o único rótulo em inglês do cartão (07/10/2026). */}
      <FieldRow icon={<Circle size={14} />} label="Situação">
        <span className="inline-flex flex-wrap items-center gap-2">
          {canAct ? (
            <Dropdown
              trigger={({ open, toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  aria-expanded={open}
                  aria-label={`Situação: ${currentStageName}. Trocar`}
                  className="inline-flex items-center gap-1 rounded-full text-fg-muted hover:text-fg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Selo tom={tomDaSituacao}>{currentStageName}</Selo>
                  <ChevronDown size={12} />
                </button>
              )}
            >
              {stages.map((s) => (
                <DropdownItem key={s.id} onClick={() => mudarSituacao(s.id)}>
                  <span className="flex items-center justify-between gap-2">
                    {s.name}
                    {currentStageId === s.id && <Check size={14} className="text-brand flex-shrink-0" />}
                  </span>
                </DropdownItem>
              ))}
            </Dropdown>
          ) : (
            <Selo tom={tomDaSituacao}>{currentStageName}</Selo>
          )}
          {/* "Marcar como concluída" ao lado da situação, como no ClickUp
              (05/11/2026) — era um botão solto acima dos campos. */}
          {canAct && concluirAction && !isCompleted && (
            <Button
              type="button"
              variant="secondary"
              size="xs"
              disabled={concluindo}
              onClick={() => concluir({ nome: nomeDaTarefa, abertas: subatividadesAbertas, concluir: (junto) => concluirAction(junto) })}
              className="hover:text-success-fg hover:border-success/40 hover:bg-success/5"
            >
              <CheckCircle2 size={12} /> Marcar como concluída
            </Button>
          )}
          {perguntaDeConcluir}
        </span>
      </FieldRow>

      <FieldRow icon={<Calendar size={14} />} label="Datas">
        {canAct ? (
          <DatesPopover
            dueDate={dueDate}
            startDate={startDate}
            priority={priority}
            recurring={recurring}
            recurrenceFrequency={recurrenceFrequency}
            datesAction={datesAction}
          />
        ) : (
          <span className={`text-fs-3 flex items-center gap-1.5 ${startDate || dueDate ? "text-fg" : "text-fg-muted"}`}>
            {datasNoCampo(startDate, dueDate)}
            {recurring && <Repeat size={12} className="text-fg-muted" aria-label="Recorrente" />}
          </span>
        )}
      </FieldRow>

      {/* Rastrear tempo */}
      <FieldRow icon={<Play size={14} />} label="Rastrear tempo">
        {activeTimer ? (
          activeTimer.userId === currentUserId ? (
            <span className="inline-flex items-center gap-2">
              <TempoDecorrido key={activeTimer.startedAt} startedAt={activeTimer.startedAt} className="text-fs-2 font-medium text-fg" mostrarApontamento />
              <Button
                variant="danger"
                size="xs"
                className="bg-danger/15"
                onClick={() => startTransition(() => stopTimerAction())}
              >
                <Square size={11} /> Parar
              </Button>
            </span>
          ) : (
            // Vale para quem não está rastreando também: o "…" antigo não dizia
            // se o colega tinha começado agora ou esquecido o cronômetro ligado
            // desde ontem.
            <span className="inline-flex items-center gap-1 text-fs-2 text-fg-muted">
              {activeTimer.userName} está rastreando há{" "}
              <TempoDecorrido key={activeTimer.startedAt} startedAt={activeTimer.startedAt} className="font-medium text-fg-secondary" />
            </span>
          )
        ) : canAct ? (
          <Button type="button" variant="secondary" size="xs" onClick={() => startTransition(() => startTimerAction())}>
            <Play size={11} /> Iniciar
          </Button>
        ) : (
          <span className="text-fs-3 text-fg-muted">{VAZIO}</span>
        )}
      </FieldRow>

      <FieldRow icon={<Users size={14} />} label="Responsáveis">
        {canAct ? (
          <Dropdown
            width={260}
            trigger={({ open, toggle }) => (
              <button type="button" onClick={toggle} aria-expanded={open} aria-label={`Responsáveis: ${hasResponsaveis ? selectedUsers.map((u) => u.name).join(", ") : VAZIO}. Trocar`} className="text-fs-3 text-fg hover:text-brand transition-colors text-left">
                {hasResponsaveis ? selectedUsers.map((u) => u.name).join(", ") : <span className="text-fg-muted">{VAZIO}</span>}
              </button>
            )}
          >
            <AssigneeToggleList allUsers={allUsers} selectedIds={selectedUserIds} toggleAction={assigneeToggleAction} />
          </Dropdown>
        ) : (
          <span className={`text-fs-3 ${hasResponsaveis ? "text-fg" : "text-fg-muted"}`}>{hasResponsaveis ? selectedUsers.map((u) => u.name).join(", ") : VAZIO}</span>
        )}
      </FieldRow>

      <FieldRow icon={<Flag size={14} />} label="Prioridade">
        {canAct ? (
          <PriorityPopover priority={priority} dueDate={dueDate} startDate={startDate} recurring={recurring} recurrenceFrequency={recurrenceFrequency} datesAction={datesAction} />
        ) : (
          <MostraPrioridade prioridade={priority} />
        )}
      </FieldRow>

      <FieldRow icon={<TagIcon size={14} />} label="Etiquetas">
        {canAct ? (
          <Dropdown
            width={260}
            trigger={({ open, toggle }) => (
              <button type="button" onClick={toggle} aria-expanded={open} aria-label={`Etiquetas: ${hasEtiquetas ? selectedTags.map((t) => t.name).join(", ") : VAZIO}. Trocar`} className="flex items-center gap-1 flex-wrap">
                {hasEtiquetas ? (
                  selectedTags.map((t) => (
                    <EtiquetaColorida key={t.id} cor={t.color}>
                      {t.name}
                    </EtiquetaColorida>
                  ))
                ) : (
                  <span className="text-fs-3 text-fg-muted">{VAZIO}</span>
                )}
              </button>
            )}
          >
            <TagToggleList allTags={allTags} selectedIds={selectedTagIds} toggleAction={tagToggleAction} />
          </Dropdown>
        ) : hasEtiquetas ? (
          <div className="flex items-center gap-1 flex-wrap">
            {selectedTags.map((t) => (
              <EtiquetaColorida key={t.id} cor={t.color}>
                {t.name}
              </EtiquetaColorida>
            ))}
          </div>
        ) : (
          <span className="text-fs-3 text-fg-muted">{VAZIO}</span>
        )}
      </FieldRow>

      {/* Participantes (observadores) — extra: aparece preenchido ou pedido. */}
      {extras.has("participantes") && (
        <FieldRow icon={<Eye size={14} />} label="Participantes">
          {canAct ? (
            <Dropdown
              width={260}
              trigger={({ open, toggle }) => (
                <button type="button" onClick={toggle} aria-expanded={open} className="text-fs-3 text-fg hover:text-brand transition-colors text-left">
                  {hasParticipantes ? selectedWatchers.map((u) => u.name).join(", ") : <span className="text-fg-muted">{VAZIO}</span>}
                </button>
              )}
            >
              <AssigneeToggleList allUsers={allUsers} selectedIds={selectedWatcherIds} toggleAction={watcherToggleAction} />
            </Dropdown>
          ) : (
            <span className="text-fs-3 text-fg">{hasParticipantes ? selectedWatchers.map((u) => u.name).join(", ") : VAZIO}</span>
          )}
        </FieldRow>
      )}

      {extras.has("estimativa") && (
        <FieldRow icon={<Timer size={14} />} label="Estimativa de tempo">
          <EstimatePopover canAct={canAct} estimateMinutes={estimateMinutes} estimateAction={estimateAction} />
        </FieldRow>
      )}

      {/* "Adicionar campo" (05/11/2026): no lugar do "Recolher campos vazios" —
          os campos do dia a dia ficam sempre à vista, os outros entram quando
          alguém precisa. */}
      {canAct && extrasParaPedir.length > 0 && (
        <Dropdown
          width={220}
          trigger={({ open, toggle }) => (
            <Button variant="ghost" size="xs" type="button" onClick={toggle} aria-expanded={open} className="mt-1 -ml-2.5">
              <Plus size={11} /> Adicionar campo
            </Button>
          )}
        >
          {({ close }) =>
            extrasParaPedir.map((c) => (
              <DropdownItem
                key={c}
                onClick={() => {
                  setExtrasPedidos((atual) => [...atual, c]);
                  close();
                }}
              >
                {ROTULO_DO_CAMPO_EXTRA[c]}
              </DropdownItem>
            ))
          }
        </Dropdown>
      )}
    </div>
  );
}

function MostraPrioridade({ prioridade }: { prioridade: number }) {
  if (prioridade <= 0) return <span className="text-fs-3 text-fg-muted">{VAZIO}</span>;
  return (
    <span className="text-fs-3 text-fg flex items-center gap-1.5">
      <Flag size={12} style={{ color: PRIORITY_COLOR[prioridade] }} aria-hidden /> {prioridadeNoCampo(prioridade)}
    </span>
  );
}

function DatesPopover({
  dueDate, startDate, priority, recurring, recurrenceFrequency, datesAction,
}: {
  dueDate: string | null; startDate: string | null; priority: number; recurring: boolean; recurrenceFrequency: string | null;
  datesAction: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
}) {
  const [isPending, startTransition] = useTransition();
  const [start, setStart] = useState(startDate ? startDate.slice(0, 10) : "");
  const [end, setEnd] = useState(dueDate ? dueDate.slice(0, 10) : "");
  const [isRecurring, setIsRecurring] = useState(recurring);
  const [frequency, setFrequency] = useState(recurrenceFrequency ?? "MONTHLY");
  const uid = useId();

  function save(overrides: Partial<{ start: string; end: string; recurring: boolean; frequency: string }> = {}) {
    const s = overrides.start ?? start;
    const e = overrides.end ?? end;
    const r = overrides.recurring ?? isRecurring;
    const f = overrides.frequency ?? frequency;
    const form = new FormData();
    form.set("startDate", s);
    form.set("dueDate", e);
    form.set("priority", String(priority));
    form.set("recurring", r ? "true" : "false");
    if (r) form.set("recurrenceFrequency", f);
    startTransition(() => { datesAction(null, form); });
  }

  return (
    <Dropdown
      width={240}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={`Datas: ${datasNoCampo(start || null, end || null)}. Trocar`}
          disabled={isPending}
          className={`text-fs-3 hover:text-brand transition-colors flex items-center gap-1.5 ${start || end ? "text-fg" : "text-fg-muted"}`}
        >
          {datasNoCampo(start || null, end || null)}
          {recurring && <Repeat size={12} className="text-fg-muted" aria-hidden />}
        </button>
      )}
    >
      {/* Rótulos do CampoForm (30/09): eram <label> de 11px soltos, sem
          ligação com o campo. */}
      <div className="space-y-3">
        <CampoForm label="Início" htmlFor={`${uid}-inicio`}>
          <CampoData id={`${uid}-inicio`} value={start} onChange={(v) => { setStart(v); save({ start: v }); }} />
        </CampoForm>
        <CampoForm label="Vencimento" htmlFor={`${uid}-fim`}>
          <CampoData id={`${uid}-fim`} value={end} onChange={(v) => { setEnd(v); save({ end: v }); }} />
        </CampoForm>
        <Checkbox
          label="Recorrente"
          checked={isRecurring}
          onChange={(e) => { const checked = e.target.checked; setIsRecurring(checked); save({ recurring: checked }); }}
        />
        {isRecurring && (
          <Select aria-label="Frequência" value={frequency} onChange={(e) => { setFrequency(e.target.value); save({ frequency: e.target.value }); }}>
            {Object.entries(FREQUENCY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
        )}
      </div>
    </Dropdown>
  );
}

function PriorityPopover({
  priority, dueDate, startDate, recurring, recurrenceFrequency, datesAction,
}: {
  priority: number; dueDate: string | null; startDate: string | null; recurring: boolean; recurrenceFrequency: string | null;
  datesAction: (prev: PipelineState, form: FormData) => Promise<PipelineState>;
}) {
  const [, startTransition] = useTransition();
  const [current, setCurrent] = useState(priority);

  function select(next: number) {
    setCurrent(next);
    const form = new FormData();
    form.set("startDate", startDate ? startDate.slice(0, 10) : "");
    form.set("dueDate", dueDate ? dueDate.slice(0, 10) : "");
    form.set("priority", String(next));
    form.set("recurring", recurring ? "true" : "false");
    if (recurring && recurrenceFrequency) form.set("recurrenceFrequency", recurrenceFrequency);
    startTransition(() => { datesAction(null, form); });
  }

  return (
    <Dropdown
      width={160}
      trigger={({ open, toggle }) => (
        <button type="button" onClick={toggle} aria-expanded={open} aria-label={`Prioridade: ${prioridadeNoCampo(current)}. Trocar`} className="hover:text-brand transition-colors">
          <MostraPrioridade prioridade={current} />
        </button>
      )}
    >
      {OPCOES_DE_PRIORIDADE.map((p) => (
        <DropdownItem key={p} onClick={() => select(p)}>
          <span className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5"><Flag size={12} style={{ color: PRIORITY_COLOR[p] }} aria-hidden /> {ROTULO_DA_PRIORIDADE[p]}</span>
            {current === p && <Check size={14} className="text-brand flex-shrink-0" />}
          </span>
        </DropdownItem>
      ))}
    </Dropdown>
  );
}

function EstimatePopover({
  canAct, estimateMinutes, estimateAction,
}: { canAct: boolean; estimateMinutes: number | null; estimateAction: (minutes: string) => Promise<void> }) {
  const [, startTransition] = useTransition();
  const [value, setValue] = useState(estimateMinutes != null ? String(estimateMinutes) : "");

  if (!canAct) {
    return <span className="text-fs-3 text-fg-muted">{estimateMinutes != null ? `${estimateMinutes} min` : "—"}</span>;
  }

  return (
    <Dropdown
      width={160}
      trigger={({ open, toggle }) => (
        <button type="button" onClick={toggle} aria-expanded={open} className="text-fs-3 hover:text-brand transition-colors">
          {estimateMinutes != null ? <span className="text-fg">{estimateMinutes} min</span> : <span className="text-fg-muted">{VAZIO}</span>}
        </button>
      )}
    >
      {({ close }) => (
        <div className="flex items-center gap-1.5">
          <Input
            type="number"
            min={0}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                startTransition(() => estimateAction(value));
                close();
              }
            }}
            placeholder="min"
            autoFocus
          />
          <Button
            variant="primary"
            size="md"
            className="flex-shrink-0"
            onClick={() => {
              startTransition(() => estimateAction(value));
              close();
            }}
          >
            OK
          </Button>
        </div>
      )}
    </Dropdown>
  );
}
