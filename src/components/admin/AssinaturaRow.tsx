"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { salvarAssinatura, type AssinaturaState } from "@/app/(app)/admin/assinaturas/actions";
import { MANAGEMENT_MODE_LABEL, SUBSCRIPTION_STATUS_LABEL } from "@/lib/subscription-labels";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type Plan = { id: string; name: string; managementMode: "MANAGED" | "SELF_SERVICE" };

type Sub = {
  planId: string;
  status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "CANCELED";
  seatLimit: number | null;
  currentPeriodEnd: string | null;
  setupFeeAmount: string | null;
  setupFeePaidAt: string | null;
  notes: string | null;
} | null;

type Props = {
  tenant: { id: string; name: string; managementMode: "MANAGED" | "SELF_SERVICE" };
  subscription: Sub;
  plans: Plan[];
  activeUsers: number;
};

export function AssinaturaRow({ tenant, subscription, plans, activeUsers }: Props) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, isPending] = useActionState<AssinaturaState, FormData>(salvarAssinatura, null);
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) setEditing(false);
    wasPending.current = isPending;
  }, [isPending, state]);

  const plan = plans.find((p) => p.id === subscription?.planId);

  if (editing) {
    return (
      <form action={formAction} className="px-4 py-3 bg-surface-hover space-y-2">
        <input type="hidden" name="tenantId" value={tenant.id} />
        <p className="text-[13px] text-fg font-medium">{tenant.name}</p>
        <div className="grid grid-cols-2 gap-2">
          <Select name="managementMode" defaultValue={tenant.managementMode}>
            <option value="MANAGED">Frente 1 — Gerenciado</option>
            <option value="SELF_SERVICE">Frente 2 — Autoatendimento</option>
          </Select>
          <Select name="planId" defaultValue={subscription?.planId ?? ""} required>
            <option value="" disabled>Selecione um plano</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
          <Select name="status" defaultValue={subscription?.status ?? "TRIAL"}>
            {Object.entries(SUBSCRIPTION_STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </Select>
          <Input
            name="seatLimit"
            type="number"
            min={1}
            defaultValue={subscription?.seatLimit ?? ""}
            placeholder="Limite de usuários (self-service)"
          />
          <Input
            name="currentPeriodEnd"
            type="date"
            defaultValue={subscription?.currentPeriodEnd?.slice(0, 10) ?? ""}
          />
          <Input
            name="setupFeeAmount"
            placeholder="Valor de implantação"
            inputMode="decimal"
            defaultValue={subscription?.setupFeeAmount ?? ""}
            prefix="R$"
          />
        </div>
        <Checkbox name="setupFeePaid" defaultChecked={!!subscription?.setupFeePaidAt} label="Implantação já paga" />
        <Input
          name="notes"
          defaultValue={subscription?.notes ?? ""}
          placeholder="Observações (contrato, negociação…)"
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="h-9 px-3 rounded-md bg-brand text-on-brand text-[12px] font-medium hover:bg-brand-hover disabled:opacity-60 transition-colors"
          >
            {isPending ? "Salvando…" : "Salvar"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="h-9 px-3 rounded-md border border-border text-[12px] text-fg-muted hover:text-fg hover:bg-surface-2 transition-colors"
          >
            Cancelar
          </button>
        </div>
        {state?.error && <p className="text-[12px] text-danger">{state.error}</p>}
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="min-w-0">
        <p className="text-[13px] text-fg font-medium">{tenant.name}</p>
        <p className="text-[11px] text-fg-muted mt-0.5">
          {MANAGEMENT_MODE_LABEL[tenant.managementMode]}
          {subscription ? (
            <>
              {" · "}{plan?.name ?? "plano removido"} · {SUBSCRIPTION_STATUS_LABEL[subscription.status]}
              {subscription.seatLimit != null && ` · ${activeUsers}/${subscription.seatLimit} usuários`}
              {subscription.setupFeePaidAt ? " · implantação paga" : " · implantação pendente"}
            </>
          ) : (
            " · sem assinatura configurada"
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-[12px] text-fg-muted hover:text-fg transition-colors flex-shrink-0"
      >
        {subscription ? "Editar" : "Configurar"}
      </button>
    </div>
  );
}
