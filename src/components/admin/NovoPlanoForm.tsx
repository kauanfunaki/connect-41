"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { criarPlano, type PlanoState } from "@/app/(app)/admin/planos/actions";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

export function NovoPlanoForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<PlanoState, FormData>(criarPlano, null);
  const [billingType, setBillingType] = useState<"FLAT_MONTHLY" | "PER_USER_MONTHLY">("FLAT_MONTHLY");

  return (
    <div>
      <Button
        type="button"
        onClick={() => setOpen((o) => !o)}
        variant="primary" className="font-medium"
      >
        {open ? "Cancelar" : "+ Novo plano"}
     </Button>

      {open && (
        <form action={formAction} className="mt-4 p-4 bg-surface border border-border rounded-lg space-y-3 max-w-xl">
          <Input
            name="name"
            required
            placeholder="Nome do plano (ex: Gerenciado Essencial)"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select name="managementMode" required>
              <option value="MANAGED">Frente 1 — Gerenciado pela 41 Tech</option>
              <option value="SELF_SERVICE">Frente 2 — Cliente administra</option>
            </Select>

            <Select
              name="billingType"
              required
              value={billingType}
              onChange={(e) => setBillingType(e.target.value as typeof billingType)}
            >
              <option value="FLAT_MONTHLY">Valor fixo mensal</option>
              <option value="PER_USER_MONTHLY">Por usuário/mês</option>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {billingType === "FLAT_MONTHLY" ? (
              <Input
                name="basePrice"
                required
                placeholder="Valor mensal"
                inputMode="decimal"
                prefix="R$"
              />
            ) : (
              <Input
                name="pricePerUser"
                required
                placeholder="Valor por usuário"
                inputMode="decimal"
                prefix="R$"
              />
            )}
            <Input
              name="setupFee"
              placeholder="Taxa de implantação"
              inputMode="decimal"
              prefix="R$"
            />
          </div>

          <Button
            type="submit"
            disabled={isPending}
            variant="primary" className="font-medium disabled:opacity-60"
          >
            {isPending ? "Criando…" : "Criar plano"}
         </Button>

          {state?.error && <p className="text-[12px] text-danger">{state.error}</p>}
        </form>
      )}
    </div>
  );
}
