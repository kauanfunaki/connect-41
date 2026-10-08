"use client";

import { useActionState, useState } from "react";
import type { HandoffState } from "@/app/(app)/transferencias/actions";
import type { EntityType } from "@/generated/prisma/enums";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Checkbox } from "@/components/ui/Checkbox";
import { useConfirm } from "@/components/ui/useConfirm";
import { HANDOFF_PRIORITY_OPTIONS } from "@/lib/handoffs";
import { HANDOFF_TEMPLATES, renderHandoffTemplate, matchSectorsForTemplate, splitDescriptionBySector } from "@/lib/handoffTemplates";
import { formatCnpj } from "@/lib/format";
import { MentionTextarea, type MentionUser } from "@/components/transferencias/MentionTextarea";
import { SectorAssigneePicker } from "@/components/transferencias/SectorAssigneePicker";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";

type EntityOption = { id: string; name: string; cnpj?: string | null };

type FixedEntity = { entityType: EntityType; entityId: string; entityName: string; entityCnpj?: string | null };

type Props = {
  action: (prev: HandoffState, form: FormData) => Promise<HandoffState>;
  fromSectorOptions: { value: string; label: string }[];
  toSectorOptions: { value: string; label: string }[];
  cancelHref: string;
  fixedEntity?: FixedEntity;
  companies?: EntityOption[];
  people?: EntityOption[];
  mentionUsers?: MentionUser[];
  /** Membros elegíveis como responsável por setor de destino (setor + admins do tenant). */
  assigneeOptionsBySector?: Record<string, MentionUser[]>;
  /** Preenchimento inicial — a transferência sugerida pelo chat de IA. */
  inicial?: { toSectors: string[]; description: string };
};

// Uma transferência, N setores de destino: informações gerais valem pra todos
// e cada setor selecionado ganha um campo de instrução específica — espelho do
// fluxo usado hoje no Acessórias, sem abrir uma transferência por setor.
export function HandoffForm({
  action,
  fromSectorOptions,
  toSectorOptions,
  cancelHref,
  fixedEntity,
  companies = [],
  people = [],
  mentionUsers = [],
  assigneeOptionsBySector = {},
  inicial,
}: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [entityType, setEntityType] = useState<EntityType>(fixedEntity?.entityType ?? "COMPANY");
  const [entityId, setEntityId] = useState("");
  const [fromSector, setFromSector] = useState("");
  const [selectedSectors, setSelectedSectors] = useState<string[]>(inicial?.toSectors ?? []);
  const [templateKey, setTemplateKey] = useState("");
  const [messageValue, setMessageValue] = useState("");
  const [descriptionValue, setDescriptionValue] = useState(inicial?.description ?? "");
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const entityOptions = entityType === "COMPANY" ? companies : people;
  const { dialog: templateConfirmDialog, requestConfirm: requestTemplateConfirm } = useConfirm();

  function toggleSector(code: string, checked: boolean) {
    setSelectedSectors((prev) => (checked ? [...prev, code] : prev.filter((c) => c !== code)));
  }

  // [EMPRESA]/[CNPJ] são substituídos pela empresa já selecionada no form (ou
  // fixa, vinda da ficha) — os demais placeholders do modelo (responsável,
  // prazo, valor...) não são deriváveis de nenhum campo existente aqui, ficam
  // por conta de quem preenche.
  function currentEntity(): { name?: string; cnpj?: string | null } {
    if (fixedEntity) return { name: fixedEntity.entityName, cnpj: fixedEntity.entityCnpj ? formatCnpj(fixedEntity.entityCnpj) : null };
    const found = entityOptions.find((e) => e.id === entityId);
    return { name: found?.name, cnpj: found?.cnpj ? formatCnpj(found.cnpj) : null };
  }

  // O modelo preenche APENAS Descrição e as instruções por setor.
  // "Informações adicionais" (campo `message`) ficou reservado pro que o
  // solicitante quiser acrescentar por conta própria, então nunca é
  // sobrescrito por modelo — antes ele recebia o resumo do template e o
  // usuário não tinha onde escrever algo além do padrão.
  //
  // splitDescriptionBySector tira da descrição os blocos "Demanda X:"/
  // "Instruções — X:" e joga cada um na instrução do setor correspondente; o
  // que sobra (o modelo inteiro menos a parte de cada setor) fica na Descrição,
  // junto do resumo que antes ia pra Informações gerais.
  function composeDescription(message: string, general: string): string {
    return [message.trim(), general.trim()].filter(Boolean).join("\n\n");
  }

  function doApplyTemplate(key: string) {
    setTemplateKey(key);
    if (!key) return;

    const rendered = renderHandoffTemplate(key, currentEntity());
    const matchedSectors = matchSectorsForTemplate(key, toSectorOptions);
    if (matchedSectors.length > 0) setSelectedSectors(matchedSectors);

    const { general, bySector } = splitDescriptionBySector(rendered.description, toSectorOptions);
    setDescriptionValue(composeDescription(rendered.message, general));
    setInstructions((prev) => ({ ...prev, ...bySector }));
  }

  function applyTemplate(key: string) {
    if (key && descriptionValue.trim()) {
      requestTemplateConfirm(
        {
          title: "Substituir pelo modelo selecionado?",
          description: "Já existe texto em Descrição — isso vai sobrescrever o conteúdo atual. Informações adicionais não é afetado.",
          confirmLabel: "Substituir",
        },
        async () => doApplyTemplate(key)
      );
      return;
    }
    doApplyTemplate(key);
  }

  // Se a empresa for trocada depois de um modelo já aplicado, reaplica com a
  // nova empresa (o usuário acabou de escolher o modelo, ainda não editou).
  function handleEntityChange(id: string) {
    setEntityId(id);
    if (!templateKey) return;
    const found = entityOptions.find((e) => e.id === id);
    const rendered = renderHandoffTemplate(templateKey, { name: found?.name, cnpj: found?.cnpj ? formatCnpj(found.cnpj) : null });
    const { general, bySector } = splitDescriptionBySector(rendered.description, toSectorOptions);
    setDescriptionValue(composeDescription(rendered.message, general));
    setInstructions((prev) => ({ ...prev, ...bySector }));
  }

  const destinationOptions = toSectorOptions.filter((s) => s.value !== fromSector);
  const selectedInOrder = toSectorOptions.filter((s) => selectedSectors.includes(s.value) && s.value !== fromSector);

  return (
    <form action={formAction} className="space-y-6">
      <CampoForm
        label="Modelo de solicitação"
        htmlFor="handoffTemplate"
        helper="Preenche a Descrição e as instruções por setor com o padrão de texto (e os setores de destino, quando o modelo já indica quais) — os placeholders entre colchetes ficam para você completar."
      >
        <Select id="handoffTemplate" value={templateKey} onChange={(e) => applyTemplate(e.target.value)}>
          <option value="">Nenhum (escrever manualmente)</option>
          {HANDOFF_TEMPLATES.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </Select>
      </CampoForm>

      {fixedEntity ? (
        <>
          <input type="hidden" name="entityType" value={fixedEntity.entityType} />
          <input type="hidden" name="entityId" value={fixedEntity.entityId} />
          {/* Rótulo/valor no padrão da ficha (era 11px sobre 14px). */}
          <div>
            <p className="text-[length:var(--fs-helper)] text-fg-muted mb-0.5">
              {fixedEntity.entityType === "COMPANY" ? "Empresa" : "Pessoa"}
            </p>
            <p className="text-[length:var(--fs-body)] text-fg font-medium">{fixedEntity.entityName}</p>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <CampoForm label="Tipo" htmlFor="entityType" required>
            <Select
              id="entityType"
              name="entityType"
              required
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value as EntityType);
                setEntityId("");
              }}
            >
              <option value="COMPANY">Empresa</option>
              <option value="PERSON">Pessoa</option>
            </Select>
          </CampoForm>
          <CampoForm
            label={entityType === "COMPANY" ? "Empresa" : "Pessoa"}
            htmlFor="entityId"
            required
            helper={
              entityOptions.length === 0
                ? `Nenhuma ${entityType === "COMPANY" ? "empresa" : "pessoa"} disponível no seu escopo.`
                : undefined
            }
          >
            <Select id="entityId" name="entityId" required value={entityId} onChange={(e) => handleEntityChange(e.target.value)}>
              <option value="" disabled>Selecionar…</option>
              {entityOptions.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </Select>
          </CampoForm>
        </div>
      )}

      {state?.error && (
        <Aviso>
          {state.error}
        </Aviso>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CampoForm label="Setor de origem" htmlFor="fromSector" required>
          <Select
            id="fromSector"
            name="fromSector"
            required
            value={fromSector}
            onChange={(e) => setFromSector(e.target.value)}
          >
            <option value="" disabled>Selecionar…</option>
            {fromSectorOptions.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Prioridade" htmlFor="priority" required>
          <Select id="priority" name="priority" required defaultValue="MEDIUM">
            {HANDOFF_PRIORITY_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </Select>
        </CampoForm>
      </div>

      {/* Grupo de caixas é <fieldset> com <legend> no estilo do rótulo de
          campo (30/09): o rótulo apontava para um id que não existia. */}
      <fieldset className="min-w-0 flex flex-col gap-1.5">
        <legend className="text-[length:var(--fs-label)] font-medium leading-5 text-fg mb-1.5">
          Setores de destino<span className="text-danger"> *</span>
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2 border border-border rounded-md px-3.5 py-3">
          {destinationOptions.map((s) => (
            <Checkbox
              key={s.value}
              id={`toSector-${s.value}`}
              name="toSectors"
              value={s.value}
              label={s.label}
              checked={selectedSectors.includes(s.value)}
              onChange={(e) => toggleSector(s.value, e.target.checked)}
            />
          ))}
          {destinationOptions.length === 0 && (
            <p className="text-[length:var(--fs-helper)] text-fg-muted">Nenhum setor disponível.</p>
          )}
        </div>
        <p className="text-[length:var(--fs-helper)] text-fg-muted">
          Preenchido automaticamente quando o modelo escolhido já indica os setores — ajuste manualmente se precisar.
        </p>
      </fieldset>

      <CampoForm
        label="Informações adicionais"
        htmlFor="message"
        helper="Opcional — só se você quiser acrescentar algo além do que já está na Descrição."
      >
        <Textarea
          id="message"
          name="message"
          rows={3}
          placeholder="Algo a acrescentar além do modelo? (opcional)"
          value={messageValue}
          onChange={(e) => setMessageValue(e.target.value)}
        />
      </CampoForm>

      <CampoForm
        label="Descrição"
        htmlFor="description"
        helper='Digite "@" para referenciar um colaborador — ele recebe uma notificação quando a transferência for criada.'
      >
        <MentionTextarea
          id="description"
          name="description"
          rows={16}
          placeholder="Detalhe o que motivou esta transferência, contexto adicional, pendências etc…"
          value={descriptionValue}
          onChange={setDescriptionValue}
          users={mentionUsers}
        />
      </CampoForm>

      {selectedInOrder.length > 0 && (
        <div className="space-y-4 border-t border-border pt-5">
          {/* Título no estilo dos títulos de seção de formulário (FormSection). */}
          <h3 className="text-[length:var(--fs-2)] font-semibold text-fg-muted uppercase tracking-wider">Instrução por setor</h3>
          {selectedInOrder.map((s) => (
            <CampoForm key={s.value} label={`Instrução para ${s.label}`} htmlFor={`instruction_${s.value}`}>
              <Textarea
                id={`instruction_${s.value}`}
                name={`instruction_${s.value}`}
                rows={3}
                value={instructions[s.value] ?? ""}
                onChange={(e) => setInstructions((prev) => ({ ...prev, [s.value]: e.target.value }))}
                placeholder={`O que o setor ${s.label} precisa fazer nesta transferência…`}
              />
              <div className="mt-2">
                <SectorAssigneePicker name={`assignee_${s.value}`} options={assigneeOptionsBySector[s.value] ?? []} />
              </div>
            </CampoForm>
          ))}
        </div>
      )}

      {/* Rodapé no padrão (30/09): Cancelar à esquerda do primário, os dois
          à direita, com divisor. Estava ao contrário e alinhado à esquerda. */}
      <FormFooter
        pending={isPending}
        pendingLabel="Enviando…"
        submitLabel="Solicitar transferência"
        cancelHref={cancelHref}
      />
      {templateConfirmDialog}
    </form>
  );
}
