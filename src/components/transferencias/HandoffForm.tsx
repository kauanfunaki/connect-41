"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { HandoffState } from "@/app/(app)/transferencias/actions";
import type { EntityType } from "@/generated/prisma/enums";
import { CampoForm } from "@/components/ui/CampoForm";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Checkbox } from "@/components/ui/Checkbox";
import { HANDOFF_PRIORITY_OPTIONS } from "@/lib/handoffs";

type EntityOption = { id: string; name: string };

type FixedEntity = { entityType: EntityType; entityId: string; entityName: string };

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
  const [fromSector, setFromSector] = useState("");
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const entityOptions = entityType === "COMPANY" ? companies : people;

  function toggleSector(code: string, checked: boolean) {
    setSelectedSectors((prev) => (checked ? [...prev, code] : prev.filter((c) => c !== code)));
  }

  const destinationOptions = toSectorOptions.filter((s) => s.value !== fromSector);
  const selectedInOrder = toSectorOptions.filter((s) => selectedSectors.includes(s.value) && s.value !== fromSector);

  return (
    <form action={formAction} className="space-y-6">
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
              onChange={(e) => setEntityType(e.target.value as EntityType)}
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
            <Select id="entityId" name="entityId" required defaultValue="">
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
