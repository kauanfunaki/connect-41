"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import type { BenefitAssignmentState } from "@/app/(app)/pessoas/[id]/beneficios/actions";
import { CampoForm, AlinhadoAoCampo } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";

type BenefitOption = { id: string; name: string };

type Props = {
  action: (prev: BenefitAssignmentState, form: FormData) => Promise<BenefitAssignmentState>;
  beneficios: BenefitOption[];
};

export function AddBeneficioForm({ action, beneficios }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  // Revisão de alinhamento (30/09): data e valores na largura do que cabe
  // neles; botão alinhado ao campo de observações.
  return (
    <form action={formAction} className="border-t border-border pt-5 mt-2 space-y-4">
      {/* Bloco do "novo" com nome, acima dos campos (5A, 08/10/2026). */}
      <h3 className="c41-rotulo">Novo benefício</h3>
      <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,180px))]">
        <CampoForm label="Benefício" htmlFor="benefitId" required>
          <Select id="benefitId" name="benefitId" required>
            <option value="">Selecione</option>
            {beneficios.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Início da Vigência" htmlFor="startDate" required>
          <CampoData id="startDate" name="startDate" required />
        </CampoForm>
        <CampoForm label="Valor Empresa" htmlFor="companyValue">
          <Input id="companyValue" name="companyValue" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>
        <CampoForm label="Valor Desconto" htmlFor="discountValue">
          <Input id="discountValue" name="discountValue" type="number" step="0.01" prefix="R$" placeholder="0,00" />
        </CampoForm>
      </FieldGrid>
      <FieldGrid columns="sm:grid-cols-[1fr_auto]">
        <CampoForm label="Observações" htmlFor="notes">
          <Input id="notes" name="notes" type="text" />
        </CampoForm>
        <AlinhadoAoCampo>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Vinculando…" : "Vincular Benefício"}
          </Button>
        </AlinhadoAoCampo>
      </FieldGrid>
      {state?.error && <p className="text-helper font-medium text-danger">{state.error}</p>}
    </form>
  );
}
