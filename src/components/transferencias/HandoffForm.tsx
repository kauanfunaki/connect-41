"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import type { HandoffState } from "@/app/(app)/transferencias/actions";
import type { EntityType } from "@/generated/prisma/enums";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Checkbox } from "@/components/ui/Checkbox";
import { HANDOFF_PRIORITY_OPTIONS } from "@/lib/handoffs";
import { HANDOFF_TEMPLATES, renderHandoffTemplate } from "@/lib/handoffTemplates";
import { formatCnpj } from "@/lib/format";

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
}: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [entityType, setEntityType] = useState<EntityType>(fixedEntity?.entityType ?? "COMPANY");
  const [entityId, setEntityId] = useState("");
  const [fromSector, setFromSector] = useState("");
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [templateKey, setTemplateKey] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const entityOptions = entityType === "COMPANY" ? companies : people;

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

  function applyTemplate(key: string) {
    setTemplateKey(key);
    if (!key) return;
    const textarea = formRef.current?.elements.namedItem("description") as HTMLTextAreaElement | null;
    if (!textarea) return;
    if (textarea.value.trim().length > 0 && !window.confirm("Já existe texto em Descrição. Substituir pelo modelo selecionado?")) {
      return;
    }
    textarea.value = renderHandoffTemplate(key, currentEntity());
  }

  // Se a empresa for trocada depois de um modelo já aplicado, reaplica com a
  // nova empresa (o usuário acabou de escolher o modelo, ainda não editou).
  function handleEntityChange(id: string) {
    setEntityId(id);
    if (!templateKey) return;
    const textarea = formRef.current?.elements.namedItem("description") as HTMLTextAreaElement | null;
    if (!textarea) return;
    const found = entityOptions.find((e) => e.id === id);
    textarea.value = renderHandoffTemplate(templateKey, { name: found?.name, cnpj: found?.cnpj ? formatCnpj(found.cnpj) : null });
  }

  const destinationOptions = toSectorOptions.filter((s) => s.value !== fromSector);
  const selectedInOrder = toSectorOptions.filter((s) => selectedSectors.includes(s.value) && s.value !== fromSector);

  return (
    <form ref={formRef} action={formAction} className="space-y-6">
      <CampoForm
        label="Modelo de solicitação"
        htmlFor="handoffTemplate"
        helper="Preenche o campo Descrição com o padrão de texto — os placeholders entre colchetes ficam para você completar."
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
          <div>
            <p className="text-[10px] text-fg-muted mb-0.5">
              {fixedEntity.entityType === "COMPANY" ? "Empresa" : "Pessoa"}
            </p>
            <p className="text-[14px] text-fg font-medium">{fixedEntity.entityName}</p>
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
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
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

      <CampoForm
        label="Setores de destino"
        htmlFor="toSectors"
        required
        helper="Selecione todos os setores envolvidos — cada um recebe a própria instrução abaixo."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 border border-border rounded-[10px] px-3.5 py-3">
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
            <p className="text-[13px] text-fg-muted">Nenhum setor disponível.</p>
          )}
        </div>
      </CampoForm>

      <CampoForm
        label="Informações gerais"
        htmlFor="message"
        helper="Resumo válido para todos os setores selecionados."
      >
        <Textarea
          id="message"
          name="message"
          rows={2}
          placeholder="Resumo curto para quem vai receber a transferência…"
        />
      </CampoForm>

      <CampoForm label="Descrição" htmlFor="description">
        <Textarea
          id="description"
          name="description"
          rows={4}
          placeholder="Detalhe o que motivou esta transferência, contexto adicional, pendências etc…"
        />
      </CampoForm>

      {selectedInOrder.length > 0 && (
        <div className="space-y-4 border-t border-border pt-5">
          <p className="text-[13px] font-semibold text-fg">Instrução por setor</p>
          {selectedInOrder.map((s) => (
            <CampoForm key={s.value} label={`Instrução para ${s.label}`} htmlFor={`instruction_${s.value}`}>
              <Textarea
                id={`instruction_${s.value}`}
                name={`instruction_${s.value}`}
                rows={3}
                placeholder={`O que o setor ${s.label} precisa fazer nesta transferência…`}
              />
            </CampoForm>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="h-9 px-5 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
        >
          {isPending ? "Enviando…" : "Solicitar Transferência"}
        </button>
        <Link
          href={cancelHref}
          className="h-9 px-4 rounded-md border border-border text-[13px] text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors inline-flex items-center"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
