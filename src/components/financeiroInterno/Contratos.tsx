"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SlideOver } from "@/components/ui/SlideOver";
import { CampoForm } from "@/components/ui/CampoForm";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { CampoData } from "@/components/ui/CampoData";
import { Switch } from "@/components/ui/Switch";
import { FormFooter } from "@/components/ui/FormFooter";
import { useToast } from "@/components/ui/Toast";
import type { ActionState } from "@/lib/actionState";
import { CATEGORIAS_DE_CONTRATO, CICLOS } from "@/lib/financeiroInterno/contratos";

export type ContratoNoFormulario = {
  name: string;
  supplier: string;
  category: string;
  amount: string;
  cycle: string;
  startDate: string | null;
  endDate: string | null;
  renewalDate: string | null;
  autoRenew: boolean;
  ownerUserId: string | null;
  url: string | null;
  notes: string | null;
};

/**
 * Cadastrar ou editar um contrato ou assinatura do escritório (05/11/2026), num
 * painel ao lado. O valor é o de cada cobrança, no ciclo escolhido; a lista
 * mostra o peso por mês para somar ciclos diferentes.
 */
export function FormularioDoContrato({
  contrato,
  pessoas,
  action,
}: {
  contrato?: ContratoNoFormulario;
  pessoas: { id: string; name: string }[];
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
}) {
  const [aberto, setAberto] = useState(false);
  const [state, formAction, isPending] = useActionState(action, null);
  const toast = useToast();
  const estavaEnviando = useRef(false);
  useEffect(() => {
    if (estavaEnviando.current && !isPending && !state?.error) {
      setAberto(false);
      toast.success(contrato ? "Contrato salvo." : "Contrato cadastrado.");
    }
    estavaEnviando.current = isPending;
  }, [isPending, state, toast, contrato]);
  const novo = !contrato;

  return (
    <>
      {novo ? (
        <Button onClick={() => setAberto(true)}>
          <Plus size={14} aria-hidden /> Novo contrato
        </Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => setAberto(true)} aria-label={`Editar ${contrato.name}`}>
          <Pencil size={13} aria-hidden /> Editar
        </Button>
      )}
      <SlideOver open={aberto} onClose={() => setAberto(false)} title={novo ? "Novo contrato" : `Editar: ${contrato.name}`} width="max-w-lg">
        <form action={formAction} className="flex flex-col gap-4">
          <CampoForm label="Nome" htmlFor="contrato-nome" required>
            <Input id="contrato-nome" name="name" defaultValue={contrato?.name ?? ""} maxLength={160} required placeholder="Google Workspace" />
          </CampoForm>
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoForm label="Fornecedor" htmlFor="contrato-fornecedor" required>
              <Input id="contrato-fornecedor" name="supplier" defaultValue={contrato?.supplier ?? ""} maxLength={160} required />
            </CampoForm>
            <CampoForm label="Categoria" htmlFor="contrato-categoria" required>
              <Select id="contrato-categoria" name="category" defaultValue={contrato?.category ?? "SOFTWARE"} required>
                {Object.entries(CATEGORIAS_DE_CONTRATO).map(([v, rotulo]) => (
                  <option key={v} value={v}>
                    {rotulo}
                  </option>
                ))}
              </Select>
            </CampoForm>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoForm label="Valor de cada cobrança" htmlFor="contrato-valor" required>
              <Input id="contrato-valor" name="amount" defaultValue={contrato?.amount ?? ""} inputMode="decimal" placeholder="0,00" prefix="R$" required />
            </CampoForm>
            <CampoForm label="Cobrança" htmlFor="contrato-ciclo" required>
              <Select id="contrato-ciclo" name="cycle" defaultValue={contrato?.cycle ?? "MENSAL"} required>
                {Object.entries(CICLOS).map(([v, rotulo]) => (
                  <option key={v} value={v}>
                    {rotulo}
                  </option>
                ))}
              </Select>
            </CampoForm>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <CampoForm label="Início" htmlFor="contrato-inicio">
              <CampoData id="contrato-inicio" name="startDate" defaultValue={contrato?.startDate ?? ""} />
            </CampoForm>
            <CampoForm label="Renovação" htmlFor="contrato-renovacao" helper="Avisa 30 dias antes.">
              <CampoData id="contrato-renovacao" name="renewalDate" defaultValue={contrato?.renewalDate ?? ""} />
            </CampoForm>
            <CampoForm label="Fim" htmlFor="contrato-fim">
              <CampoData id="contrato-fim" name="endDate" defaultValue={contrato?.endDate ?? ""} />
            </CampoForm>
          </div>
          <Switch name="autoRenew" value="on" defaultChecked={contrato?.autoRenew ?? false} rotulo="Renova sozinho" />
          <CampoForm label="Quem responde" htmlFor="contrato-responsavel" helper="Quem aprova a renovação.">
            <Select id="contrato-responsavel" name="ownerUserId" defaultValue={contrato?.ownerUserId ?? ""} busca>
              <option value="">Ninguém definido</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </CampoForm>
          <CampoForm label="Endereço do serviço" htmlFor="contrato-url">
            <Input id="contrato-url" name="url" type="url" defaultValue={contrato?.url ?? ""} maxLength={255} placeholder="https://" />
          </CampoForm>
          <CampoForm label="Observações" htmlFor="contrato-notas">
            <Textarea id="contrato-notas" name="notes" defaultValue={contrato?.notes ?? ""} rows={3} maxLength={4000} />
          </CampoForm>
          <FormFooter pending={isPending} submitLabel={novo ? "Cadastrar" : "Salvar"} pendingLabel="Salvando…" onCancel={() => setAberto(false)} erro={state?.error} />
        </form>
      </SlideOver>
    </>
  );
}
