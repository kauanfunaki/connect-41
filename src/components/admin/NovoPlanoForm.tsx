"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { criarPlano, type PlanoState } from "@/app/(app)/admin/planos/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FormFooter } from "@/components/ui/FormFooter";

export function NovoPlanoForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState<PlanoState, FormData>(criarPlano, null);
  const [billingType, setBillingType] = useState<"FLAT_MONTHLY" | "PER_USER_MONTHLY">("FLAT_MONTHLY");

  // Fechado, só o botão. Aberto, o botão some e o formulário traz o próprio
  // rodapé (Cancelar, Criar plano) — antes o "Cancelar" era o mesmo botão lá
  // em cima, longe do "Criar plano", que ficava sozinho embaixo à esquerda.
  if (!open) {
    return <Button onClick={() => setOpen(true)}>+ Novo plano</Button>;
  }

  // Os campos só tinham placeholder: preenchidos, ninguém sabia mais o que era
  // cada valor. Agora têm rótulo, como todo formulário.
  return (
    <form
      action={formAction}
      className="p-4 bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] space-y-4 max-w-2xl"
    >
      <CampoForm label="Nome do plano" htmlFor="plano-nome" required>
        <Input id="plano-nome" name="name" required placeholder="Ex: Gerenciado Essencial" />
      </CampoForm>

      <FieldGrid>
        <CampoForm label="Modo de gestão" htmlFor="plano-modo" required>
          <Select id="plano-modo" name="managementMode" required>
            <option value="MANAGED">Frente 1 — Gerenciado pela 41 Tech</option>
            <option value="SELF_SERVICE">Frente 2 — Cliente administra</option>
          </Select>
        </CampoForm>

        <CampoForm label="Cobrança" htmlFor="plano-cobranca" required>
          <Select
            id="plano-cobranca"
            name="billingType"
            required
            value={billingType}
            onChange={(e) => setBillingType(e.target.value as typeof billingType)}
          >
            <option value="FLAT_MONTHLY">Valor fixo mensal</option>
            <option value="PER_USER_MONTHLY">Por usuário/mês</option>
          </Select>
        </CampoForm>

        {billingType === "FLAT_MONTHLY" ? (
          <CampoForm label="Valor mensal" htmlFor="plano-valor" required>
            <Input id="plano-valor" name="basePrice" required inputMode="decimal" prefix="R$" />
          </CampoForm>
        ) : (
          <CampoForm label="Valor por usuário" htmlFor="plano-valor" required>
            <Input id="plano-valor" name="pricePerUser" required inputMode="decimal" prefix="R$" />
          </CampoForm>
        )}
        <CampoForm label="Taxa de implantação" htmlFor="plano-implantacao">
          <Input id="plano-implantacao" name="setupFee" inputMode="decimal" prefix="R$" />
        </CampoForm>
      </FieldGrid>

      <FormFooter
        pending={isPending}
        pendingLabel="Criando…"
        submitLabel="Criar plano"
        onCancel={() => setOpen(false)}
        erro={state?.error}
      />
    </form>
  );
}
