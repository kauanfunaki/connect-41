"use client";

import { useActionState, useId, useState } from "react";
import { Pencil } from "lucide-react";
import { editarPlano, type PlanoState } from "@/app/(app)/admin/planos/actions";
import { Aviso } from "@/components/ui/Aviso";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoNumero } from "@/components/ui/CampoNumero";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormFooter } from "@/components/ui/FormFooter";
import { FormSection } from "@/components/ui/FormSection";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { BILLING_TYPE_LABEL, MANAGEMENT_MODE_LABEL } from "@/lib/subscription-labels";
import {
  MAX_DESTAQUE,
  MAX_DESTAQUES,
  MAX_ORDEM,
  MAX_PARA_QUEM,
  PARA_QUEM_PADRAO,
  type CamposDoSite,
} from "@/lib/planos/site-regras";
import type { BillingType, ManagementMode } from "@/generated/prisma/enums";

export type PlanoParaEditar = {
  id: string;
  nome: string;
  modo: ManagementMode;
  cobranca: BillingType;
  /** O valor da cobrança do plano, já no formato do campo ("1200,00"). */
  valor: string;
  implantacao: string;
};

type Props = {
  plano: PlanoParaEditar;
  /** `null`: a tabela do site ainda não existe (migration pendente) — a janela não mostra os campos do site. */
  site: CamposDoSite | null;
};

/**
 * "Editar" do cartão do plano (14/10/2026, escolha A do Kauan para Planos). Até
 * aqui um plano não se editava depois de criado. A janela tem duas partes: o
 * plano (nome, valor, implantação) e como ele aparece no site (mostrar ou não,
 * "para quem é", destaques, ordem e destaque do cartão). Os módulos continuam
 * na janela própria do cartão ("Escolher módulos").
 */
export function EditarPlano({ plano, site }: Props) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant="secondary" size="xs" onClick={() => setAberto(true)}>
        <Pencil size={11} />
        Editar
      </Button>
      <Modal open={aberto} onClose={() => setAberto(false)} title={`Editar o plano ${plano.nome}`} maxWidth="max-w-2xl">
        {/* Remonta a cada abertura: a janela parte sempre do que está salvo. */}
        {aberto && <FormularioDoPlano plano={plano} site={site} onFechar={() => setAberto(false)} />}
      </Modal>
    </>
  );
}

function FormularioDoPlano({ plano, site, onFechar }: Props & { onFechar: () => void }) {
  const id = useId();
  const [state, formAction, isPending] = useActionState<PlanoState, FormData>(async (anterior, form) => {
    const r = await editarPlano(anterior, form);
    if (!r) onFechar();
    return r;
  }, null);
  const porUsuario = plano.cobranca === "PER_USER_MONTHLY";

  return (
    <form action={formAction}>
      <input type="hidden" name="planId" value={plano.id} />

      <FormSection
        title="Plano"
        descricao={`${MANAGEMENT_MODE_LABEL[plano.modo]} · ${BILLING_TYPE_LABEL[plano.cobranca]}. O modo e a cobrança não mudam depois de criado: para outro jeito de cobrar, crie um plano novo.`}
      >
        <CampoForm label="Nome do plano" htmlFor={`${id}-nome`} required>
          <Input id={`${id}-nome`} name="name" required maxLength={80} defaultValue={plano.nome} />
        </CampoForm>
        <FieldGrid>
          <CampoForm label={porUsuario ? "Valor por usuário" : "Valor mensal"} htmlFor={`${id}-valor`} required>
            <Input id={`${id}-valor`} name="valor" required inputMode="decimal" prefix="R$" defaultValue={plano.valor} />
          </CampoForm>
          <CampoForm label="Taxa de implantação" htmlFor={`${id}-implantacao`}>
            <Input id={`${id}-implantacao`} name="setupFee" inputMode="decimal" prefix="R$" defaultValue={plano.implantacao} />
          </CampoForm>
        </FieldGrid>
      </FormSection>

      <FormSection title="No site" descricao="A seção Planos do site do Connect. Sem preço enquanto “Mostrar preços no site” estiver desligado.">
        {site ? <CamposDoSiteNoFormulario id={id} modo={plano.modo} site={site} /> : (
          <Aviso tom="atencao">
            Falta a atualização do banco desta versão do Connect. Até ela rodar, os planos não aparecem no site e estes campos não
            salvam.
          </Aviso>
        )}
      </FormSection>

      <FormFooter pending={isPending} onCancel={onFechar} erro={state?.error} />
    </form>
  );
}

function CamposDoSiteNoFormulario({ id, modo, site }: { id: string; modo: ManagementMode; site: CamposDoSite }) {
  const destaques = Array.from({ length: MAX_DESTAQUES }, (_, i) => site.destaques[i] ?? "");
  return (
    <>
      {/* Avisa a action que estes campos vieram — sem ele, nada do site é gravado. */}
      <input type="hidden" name="comSite" value="1" />
      <Switch name="mostrarNoSite" defaultChecked={site.mostrarNoSite} rotulo="Mostrar este plano no site" />
      {/* Os campos ficam mesmo com o interruptor desligado: dá para deixar tudo
          pronto e ligar depois. */}
      <CampoForm
        label="Para quem é"
        htmlFor={`${id}-para-quem`}
        helper={`Uma frase embaixo do nome do plano. Vazio, o site usa: “${PARA_QUEM_PADRAO[modo]}”`}
      >
        <Textarea
          id={`${id}-para-quem`}
          name="paraQuem"
          maxLength={MAX_PARA_QUEM}
          defaultValue={site.paraQuem ?? ""}
          placeholder={PARA_QUEM_PADRAO[modo]}
        />
      </CampoForm>
      <div className="flex flex-col gap-1.5">
        <span className="text-label font-medium leading-5 text-fg">Destaques (até {MAX_DESTAQUES}, opcionais)</span>
        {destaques.map((d, i) => (
          <Input
            key={i}
            name="destaque"
            maxLength={MAX_DESTAQUE}
            defaultValue={d}
            aria-label={`Destaque ${i + 1}`}
            placeholder={i === 0 ? "Ex: a 41 Tech cuida de usuários e setores" : `Destaque ${i + 1}`}
          />
        ))}
      </div>
      <FieldGrid>
        <CampoForm label="Ordem no site" htmlFor={`${id}-ordem`} helper="O menor aparece primeiro.">
          <CampoNumero id={`${id}-ordem`} name="ordem" min={1} max={MAX_ORDEM} defaultValue={site.ordem} />
        </CampoForm>
        <div className="flex flex-col gap-1.5">
          <span className="text-label font-medium leading-5 text-fg">Destacar este cartão</span>
          <div className="flex min-h-9 items-center">
            <Switch name="destacar" defaultChecked={site.destacar} rotulo="Borda azul no cartão do site" />
          </div>
        </div>
      </FieldGrid>
    </>
  );
}
