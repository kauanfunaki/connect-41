"use client";

import { useActionState } from "react";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormFooter } from "@/components/ui/FormFooter";
import { Input } from "@/components/ui/Input";
import { DICAS_SPED, type Contabilista } from "@/lib/empresas/camposSped";
import type { ContabilistaState } from "@/app/(app)/admin/tenant/actions";

type Props = {
  action: (prev: ContabilistaState, form: FormData) => Promise<ContabilistaState>;
  valor: Contabilista;
};

/**
 * O contabilista padrão do escritório (06/11/2026): já vem preenchido em
 * empresa nova, e cada empresa pode trocar o seu. Tudo opcional.
 */
export function ContabilistaPadraoForm({ action, valor }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-5">
      <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
        <CampoForm label="Nome" htmlFor="contabilista-nome" dica={DICAS_SPED.contabilistaNome}>
          <Input id="contabilista-nome" name="contabilistaNome" defaultValue={valor.contabilistaNome ?? ""} maxLength={100} />
        </CampoForm>
        <CampoForm label="CPF" htmlFor="contabilista-cpf" dica={DICAS_SPED.contabilistaCpf}>
          <Input id="contabilista-cpf" name="contabilistaCpf" defaultValue={valor.contabilistaCpf ?? ""} inputMode="numeric" maxLength={14} placeholder="000.000.000-00" />
        </CampoForm>
        <CampoForm label="CRC" htmlFor="contabilista-crc" dica={DICAS_SPED.contabilistaCrc}>
          <Input id="contabilista-crc" name="contabilistaCrc" defaultValue={valor.contabilistaCrc ?? ""} maxLength={20} placeholder="012345O1PR" className="uppercase" />
        </CampoForm>
      </FieldGrid>
      <FormFooter
        pending={isPending}
        erro={state && "error" in state ? state.error : undefined}
        nota={state && "success" in state ? "Salvo." : "Em branco, empresa nova não vem com contabilista."}
      />
    </form>
  );
}
