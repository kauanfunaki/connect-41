"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { Pencil, Settings2 } from "lucide-react";
import { salvarAssinatura, type AssinaturaState } from "@/app/(app)/admin/assinaturas/actions";
import { MANAGEMENT_MODE_LABEL, SUBSCRIPTION_STATUS_LABEL } from "@/lib/subscription-labels";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { FormFooter } from "@/components/ui/FormFooter";

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
  const id = useId();

  useEffect(() => {
    if (wasPending.current && !isPending && !state?.error) setEditing(false);
    wasPending.current = isPending;
  }, [isPending, state]);

  const plan = plans.find((p) => p.id === subscription?.planId);

  // Espelha getSubscriptionReadOnly (src/lib/auth/context.ts): o bloqueio só
  // vale para SELF_SERVICE. Num tenant MANAGED, marcar PAST_DUE/CANCELED não
  // faz absolutamente nada — o que parecia bug, mas é a regra (cobrança de
  // MANAGED é tratada manualmente). Explicitado aqui pra não ser um no-op mudo.
  const statusLocks = subscription?.status === "PAST_DUE" || subscription?.status === "CANCELED";
  const readOnlyActive = statusLocks && tenant.managementMode === "SELF_SERVICE";
  const readOnlyInert = statusLocks && tenant.managementMode === "MANAGED";

  if (editing) {
    // Os campos só tinham placeholder — a data e os selects nem isso, e
    // preenchidos ninguém sabia o que era cada um. Agora têm rótulo, em três
    // colunas: gestão e plano, depois cobrança e limites. A confirmação do
    // limite abaixo do número de usuários sobe para antes do rodapé, perto do
    // botão que ela destrava.
    return (
      <form action={formAction} className="px-4 py-4 bg-surface-hover space-y-4">
        <input type="hidden" name="tenantId" value={tenant.id} />
        <p className="text-fs-3 text-fg font-medium">{tenant.name}</p>
        <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-3">
          <CampoForm label="Modo de gestão" htmlFor={`${id}-modo`}>
            <Select id={`${id}-modo`} name="managementMode" defaultValue={tenant.managementMode}>
              <option value="MANAGED">Frente 1 — Gerenciado</option>
              <option value="SELF_SERVICE">Frente 2 — Autoatendimento</option>
            </Select>
          </CampoForm>
          <CampoForm label="Plano" htmlFor={`${id}-plano`} required>
            <Select id={`${id}-plano`} name="planId" defaultValue={subscription?.planId ?? ""} required>
              <option value="" disabled>Selecione um plano</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </CampoForm>
          <CampoForm label="Status" htmlFor={`${id}-status`}>
            <Select id={`${id}-status`} name="status" defaultValue={subscription?.status ?? "TRIAL"}>
              {Object.entries(SUBSCRIPTION_STATUS_LABEL).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </Select>
          </CampoForm>
          <CampoForm label="Limite de usuários" htmlFor={`${id}-limite`} helper="Só vale no autoatendimento (self-service).">
            <CampoNumero
              id={`${id}-limite`}
              name="seatLimit"
              min={1}
              defaultValue={subscription?.seatLimit ?? ""}
            />
          </CampoForm>
          <CampoForm label="Próxima renovação" htmlFor={`${id}-renovacao`}>
            <CampoData
              id={`${id}-renovacao`}
              name="currentPeriodEnd"
             
              defaultValue={subscription?.currentPeriodEnd?.slice(0, 10) ?? ""}
            />
          </CampoForm>
          <CampoForm label="Valor de implantação" htmlFor={`${id}-implantacao`}>
            <Input
              id={`${id}-implantacao`}
              name="setupFeeAmount"
              inputMode="decimal"
              defaultValue={subscription?.setupFeeAmount ?? ""}
              prefix="R$"
            />
          </CampoForm>
        </FieldGrid>
        <Checkbox
          id={`${id}-implantacao-paga`}
          name="setupFeePaid"
          defaultChecked={!!subscription?.setupFeePaidAt}
          label="Implantação já paga"
        />
        <CampoForm label="Observações" htmlFor={`${id}-observacoes`}>
          <Input
            id={`${id}-observacoes`}
            name="notes"
            defaultValue={subscription?.notes ?? ""}
            placeholder="Contrato, negociação…"
          />
        </CampoForm>
        {state?.error && <p className="text-helper font-medium text-danger">{state.error}</p>}
        {state?.needsSeatConfirm && (
          <Checkbox
            id={`${id}-confirma-limite`}
            name="confirmSeatBelowHeadcount"
            label="Confirmo o limite abaixo do número de usuários ativos"
          />
        )}
        <FormFooter
          pending={isPending}
          onCancel={() => setEditing(false)}
        />
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-fs-3 text-fg font-medium">{tenant.name}</p>
        <p className="text-fs-1 text-fg-muted mt-0.5">
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
        {readOnlyActive && (
          <p className="text-fs-1 text-danger mt-1">
            Somente leitura ativo — este workspace não consegue criar nem editar.
          </p>
        )}
        {readOnlyInert && (
          <p className="text-fs-1 text-warning-fg mt-1">
            Status de inadimplência sem efeito: somente leitura só se aplica a workspaces
            em Autoatendimento. Mude o modo de gestão para bloquear de fato.
          </p>
        )}
      </div>
      {/* Botão, e não texto cinza (polimento de 30/09). */}
      <Button variant="secondary" size="xs" onClick={() => setEditing(true)} className="flex-shrink-0">
        {subscription ? <Pencil size={11} /> : <Settings2 size={11} />}
        {subscription ? "Editar" : "Configurar"}
      </Button>
    </div>
  );
}
