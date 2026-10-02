"use client";

import { useActionState } from "react";
import type { SocioState } from "@/app/(app)/empresas/[id]/socios/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormSection } from "@/components/ui/FormSection";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormFooter } from "@/components/ui/FormFooter";
import { Button } from "@/components/ui/Button";
import { Copy } from "lucide-react";

type Props = {
  action: (prev: SocioState, form: FormData) => Promise<SocioState>;
  companyId: string;
  cancelHref: string;
  /** O endereço da empresa, para o botão de copiar. */
  enderecoDaEmpresa: {
    zipCode: string | null;
    addressStreet: string | null;
    addressNumber: string | null;
    addressComplement: string | null;
    neighborhood: string | null;
    city: string | null;
    stateCode: string | null;
  };
  defaultValues?: {
    id?: string;
    name?: string;
    document?: string | null;
    administrator?: boolean;
    sharePercent?: string | null;
    qualification?: string | null;
    quotas?: string | null;
    capitalAmount?: string | null;
    /** "AAAA-MM-DD", como o input de data espera. */
    entryDate?: string;
    exitDate?: string;
    /** O CPF como a Receita divulga, quando o inteiro não é conhecido. */
    documentMasked?: string | null;
    zipCode?: string | null;
    addressStreet?: string | null;
    addressNumber?: string | null;
    addressComplement?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    stateCode?: string | null;
  };
};

export function SocioForm({ action, companyId, cancelHref, enderecoDaEmpresa, defaultValues }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);

  // Copiar o endereço da empresa é o atalho do caso que a viabilidade pergunta:
  // sócio que mora no endereço da empresa. Escreve nos campos em vez de marcar
  // uma caixa "mesmo endereço" porque o endereço da empresa pode mudar depois, e
  // aí o do sócio mudaria junto sem ninguém decidir.
  function copiarEndereco() {
    const form = document.getElementById("form-do-socio") as HTMLFormElement | null;
    if (!form) return;
    for (const [campo, valor] of Object.entries(enderecoDaEmpresa)) {
      const input = form.elements.namedItem(campo);
      if (input instanceof HTMLInputElement) input.value = valor ?? "";
    }
  }

  // Revisão de alinhamento (30/09): eram quatro grades diferentes (1, 2, 3 e
  // 2 colunas) empilhadas, e as colunas não batiam de uma linha para a outra.
  // Agora são três seções com a mesma grade de três colunas; o endereço usa
  // colunas estreitas para CEP, número e UF.
  return (
    <form id="form-do-socio" action={formAction} className="space-y-6">
      <input type="hidden" name="companyId" value={companyId} />
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <p className="text-[length:var(--fs-helper)] font-medium text-danger bg-danger-bg border border-danger/30 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      {/* As seções num bloco só: a última perde o divisor de baixo, e o do
          rodapé não fica dobrado. */}
      <div>
        <FormSection title="Sócio">
          <FieldGrid columns="sm:grid-cols-3">
            <CampoForm label="Nome" htmlFor="name" required className="sm:col-span-2">
              <Input id="name" name="name" type="text" required defaultValue={defaultValues?.name ?? ""} />
            </CampoForm>
            <CampoForm
              label="CPF ou CNPJ"
              htmlFor="document"
              helper={
                defaultValues?.documentMasked && !defaultValues?.document
                  ? `A Receita divulga só ${defaultValues.documentMasked}. Opcional; se preenchido, precisa ser válido.`
                  : "Opcional. Se preenchido, precisa ser válido."
              }
            >
              <Input id="document" name="document" type="text" inputMode="numeric" defaultValue={defaultValues?.document ?? ""} />
            </CampoForm>
          </FieldGrid>
        </FormSection>

        <FormSection title="Participação na sociedade">
          <FieldGrid columns="sm:grid-cols-3">
            <CampoForm label="Qualificação" htmlFor="qualification" helper="Como a Receita chama o papel.">
              <Input
                id="qualification"
                name="qualification"
                type="text"
                maxLength={80}
                placeholder="Sócio-Administrador"
                defaultValue={defaultValues?.qualification ?? ""}
              />
            </CampoForm>
            <CampoForm label="Participação" htmlFor="sharePercent" helper="No capital social. Opcional.">
              <Input
                id="sharePercent"
                name="sharePercent"
                type="text"
                inputMode="decimal"
                suffix="%"
                defaultValue={defaultValues?.sharePercent ?? ""}
              />
            </CampoForm>
            <CampoForm label="Quotas" htmlFor="quotas" helper="Do contrato social. Opcional.">
              <Input id="quotas" name="quotas" type="text" inputMode="numeric" defaultValue={defaultValues?.quotas ?? ""} />
            </CampoForm>
            <CampoForm label="Capital" htmlFor="capitalAmount" helper="Valor integralizado. Opcional.">
              <Input
                id="capitalAmount"
                name="capitalAmount"
                type="text"
                inputMode="decimal"
                prefix="R$"
                defaultValue={defaultValues?.capitalAmount ?? ""}
              />
            </CampoForm>
            <CampoForm label="Entrada na sociedade" htmlFor="entryDate">
              <CampoData id="entryDate" name="entryDate" defaultValue={defaultValues?.entryDate ?? ""} />
            </CampoForm>
            <CampoForm label="Saída da sociedade" htmlFor="exitDate" helper="Preencha quando o sócio sair: ele fica como ex-sócio.">
              <CampoData id="exitDate" name="exitDate" defaultValue={defaultValues?.exitDate ?? ""} />
            </CampoForm>
          </FieldGrid>
          <Checkbox
            name="administrator"
            defaultChecked={defaultValues?.administrator ?? false}
            label="Sócio administrador"
          />
        </FormSection>

        <FormSection title="Endereço">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <p className="min-w-0 flex-1 basis-64 text-[length:var(--fs-helper)] text-fg-muted">
              É daqui que sai a resposta de “Reside no local?” na viabilidade do Empresa Fácil. Sem CEP e número, a pergunta
              volta a ser respondida à mão.
            </p>
            {/* Era link azul (30/09): copiar é ação, então é botão. */}
            <Button type="button" variant="secondary" size="sm" onClick={copiarEndereco}>
              <Copy size={14} /> Copiar o endereço da empresa
            </Button>
          </div>

          <FieldGrid columns="sm:grid-cols-[140px_1fr_100px]">
            <CampoForm label="CEP" htmlFor="zipCode">
              <Input id="zipCode" name="zipCode" type="text" inputMode="numeric" defaultValue={defaultValues?.zipCode ?? ""} />
            </CampoForm>
            <CampoForm label="Logradouro" htmlFor="addressStreet">
              <Input id="addressStreet" name="addressStreet" type="text" defaultValue={defaultValues?.addressStreet ?? ""} />
            </CampoForm>
            <CampoForm label="Número" htmlFor="addressNumber">
              <Input id="addressNumber" name="addressNumber" type="text" defaultValue={defaultValues?.addressNumber ?? ""} />
            </CampoForm>
          </FieldGrid>
          <FieldGrid>
            <CampoForm label="Complemento" htmlFor="addressComplement">
              <Input
                id="addressComplement"
                name="addressComplement"
                type="text"
                defaultValue={defaultValues?.addressComplement ?? ""}
              />
            </CampoForm>
            <CampoForm label="Bairro" htmlFor="neighborhood">
              <Input id="neighborhood" name="neighborhood" type="text" defaultValue={defaultValues?.neighborhood ?? ""} />
            </CampoForm>
          </FieldGrid>
          <FieldGrid columns="sm:grid-cols-[1fr_100px]">
            <CampoForm label="Cidade" htmlFor="city">
              <Input id="city" name="city" type="text" defaultValue={defaultValues?.city ?? ""} />
            </CampoForm>
            <CampoForm label="UF" htmlFor="stateCode">
              <Input id="stateCode" name="stateCode" type="text" maxLength={2} className="uppercase" defaultValue={defaultValues?.stateCode ?? ""} />
            </CampoForm>
          </FieldGrid>
        </FormSection>
      </div>

      <FormFooter cancelHref={cancelHref} pending={isPending} />
    </form>
  );
}
