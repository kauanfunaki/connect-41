"use client";

import { useActionState } from "react";
import type { SocioState } from "@/app/(app)/empresas/[id]/socios/actions";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { FormFooter } from "@/components/ui/FormFooter";

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

  return (
    <form id="form-do-socio" action={formAction} className="space-y-6">
      <input type="hidden" name="companyId" value={companyId} />
      {defaultValues?.id && <input type="hidden" name="id" value={defaultValues.id} />}

      {state?.error && (
        <p className="text-[13px] text-danger bg-danger/8 border border-danger/20 rounded-md px-3 py-2">
          {state.error}
        </p>
      )}

      <CampoForm label="Nome" htmlFor="name" required>
        <Input id="name" name="name" type="text" required defaultValue={defaultValues?.name ?? ""} />
      </CampoForm>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <CampoForm label="Entrada na sociedade" htmlFor="entryDate">
          <Input id="entryDate" name="entryDate" type="date" defaultValue={defaultValues?.entryDate ?? ""} />
        </CampoForm>
        <CampoForm label="Saída da sociedade" htmlFor="exitDate" helper="Preencha quando o sócio sair: ele fica como ex-sócio.">
          <Input id="exitDate" name="exitDate" type="date" defaultValue={defaultValues?.exitDate ?? ""} />
        </CampoForm>
      </div>

      <Checkbox
        name="administrator"
        defaultChecked={defaultValues?.administrator ?? false}
        label="Sócio administrador"
      />

      <div className="border-t border-border pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h2 className="text-[14px] font-semibold text-fg">Endereço</h2>
          <button
            type="button"
            onClick={copiarEndereco}
            className="text-[12px] text-brand hover:underline"
          >
            Copiar o endereço da empresa
          </button>
        </div>
        <p className="text-[12px] text-fg-muted mb-4">
          É daqui que sai a resposta de “Reside no local?” na viabilidade do Empresa Fácil. Sem CEP e número, a pergunta
          volta a ser respondida à mão.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CampoForm label="CEP" htmlFor="zipCode">
            <Input id="zipCode" name="zipCode" type="text" inputMode="numeric" defaultValue={defaultValues?.zipCode ?? ""} />
          </CampoForm>
          <div className="sm:col-span-2">
            <CampoForm label="Logradouro" htmlFor="addressStreet">
              <Input id="addressStreet" name="addressStreet" type="text" defaultValue={defaultValues?.addressStreet ?? ""} />
            </CampoForm>
          </div>
          <CampoForm label="Número" htmlFor="addressNumber">
            <Input id="addressNumber" name="addressNumber" type="text" defaultValue={defaultValues?.addressNumber ?? ""} />
          </CampoForm>
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
          <div className="sm:col-span-2">
            <CampoForm label="Cidade" htmlFor="city">
              <Input id="city" name="city" type="text" defaultValue={defaultValues?.city ?? ""} />
            </CampoForm>
          </div>
          <CampoForm label="UF" htmlFor="stateCode">
            <Input id="stateCode" name="stateCode" type="text" maxLength={2} defaultValue={defaultValues?.stateCode ?? ""} />
          </CampoForm>
        </div>
      </div>

      <FormFooter cancelHref={cancelHref} pending={isPending} />
    </form>
  );
}
