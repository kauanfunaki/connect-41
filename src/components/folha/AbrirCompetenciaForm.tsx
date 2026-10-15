"use client";

import { useActionState } from "react";
import type { PayrollCompetencyState } from "@/app/(app)/empresas/[id]/folha/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { FormFooter } from "@/components/ui/FormFooter";
import { JanelaDeCadastro } from "@/components/shared/JanelaDeCadastro";

type Props = {
  action: (prev: PayrollCompetencyState, form: FormData) => Promise<PayrollCompetencyState>;
  companyId: string;
  onCancelar: () => void;
};

/**
 * O "+ Nova competência" do cabeçalho da folha da empresa, com mês e ano numa
 * janela (P19, 15/10/2026). Era um formulário sempre aberto no topo da lista.
 * Aberta, a competência abre a tela dela.
 */
export function NovaCompetenciaDaFolha({ action, companyId }: Omit<Props, "onCancelar">) {
  return (
    <JanelaDeCadastro rotulo="Nova competência" maxWidth="max-w-md">
      {(fechar) => <AbrirCompetenciaForm action={action} companyId={companyId} onCancelar={fechar} />}
    </JanelaDeCadastro>
  );
}

export function AbrirCompetenciaForm({ action, companyId, onCancelar }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const now = new Date();

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="companyId" value={companyId} />
      {/* Mês e ano são números curtos: colunas estreitas fixas, também no
          celular. Um pouco mais largas desde que ganharam o − e o + (08/10/2026). */}
      <div className="grid grid-cols-[112px_128px] gap-4">
        <CampoForm label="Mês" htmlFor="month">
          <CampoNumero id="month" name="month" min={1} max={12} defaultValue={now.getMonth() + 1} />
        </CampoForm>
        <CampoForm label="Ano" htmlFor="year">
          <CampoNumero id="year" name="year" min={2000} defaultValue={now.getFullYear()} />
        </CampoForm>
      </div>
      <FormFooter
        pending={isPending}
        pendingLabel="Abrindo…"
        submitLabel="Abrir competência"
        onCancel={onCancelar}
        erro={state?.error}
      />
    </form>
  );
}
