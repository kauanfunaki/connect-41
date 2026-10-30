"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { CampoComSugestoes } from "@/components/ui/CampoComSugestoes";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";
import { FormFooter } from "@/components/ui/FormFooter";
import { Aviso } from "@/components/ui/Aviso";
import { lancarTaxa, type TaxaState } from "@/app/(app)/processos/actions";
import { MAX_DESCRICAO, TAXAS_SUGERIDAS } from "@/lib/societario/taxa-form";

/** Uma apresentação do processo, para ligar a taxa a ela ("2ª apresentação" é volta). */
export type ApresentacaoParaTaxa = { id: string; rotulo: string };

/**
 * Lançar a taxa do processo à mão (30/10/2026): a guia da Junta, o DAM, a taxa
 * do Bombeiros. Até aqui só o robô criaria — e ele ainda não lê guia nenhuma.
 */
export function NovaTaxa({ processId, apresentacoes }: { processId: string; apresentacoes: ApresentacaoParaTaxa[] }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button variant="secondary" size="xs" onClick={() => setAberto(true)}>
        <Plus size={12} /> Lançar taxa
      </Button>
      <Modal open={aberto} onClose={() => setAberto(false)} title="Lançar taxa" maxWidth="max-w-lg">
        {/* Montado só quando aberto: o estado zera a cada abertura. */}
        {aberto && <Formulario processId={processId} apresentacoes={apresentacoes} onClose={() => setAberto(false)} />}
      </Modal>
    </>
  );
}

function Formulario({ processId, apresentacoes, onClose }: { processId: string; apresentacoes: ApresentacaoParaTaxa[]; onClose: () => void }) {
  const [estado, action, isPending] = useActionState(async (prev: TaxaState, form: FormData) => {
    const r = await lancarTaxa(prev, form);
    if (r && "success" in r) onClose();
    return r;
  }, null);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="processId" value={processId} />
      {estado && "error" in estado && <Aviso>{estado.error}</Aviso>}

      <CampoForm label="Taxa" htmlFor="taxa-descricao" required helper="Escolha uma sugestão ou escreva como a guia diz.">
        <CampoComSugestoes id="taxa-descricao" name="description" sugestoes={TAXAS_SUGERIDAS} maxLength={MAX_DESCRICAO} required />
      </CampoForm>

      <FieldGrid>
        <CampoForm label="Valor" htmlFor="taxa-valor" required>
          <Input id="taxa-valor" name="amount" inputMode="decimal" prefix="R$" placeholder="0,00" required />
        </CampoForm>
        <CampoForm label="Vencimento" htmlFor="taxa-vencimento">
          <CampoData id="taxa-vencimento" name="dueDate" />
        </CampoForm>
      </FieldGrid>

      {apresentacoes.length > 0 && (
        <CampoForm
          label="Apresentação"
          htmlFor="taxa-apresentacao"
          helper="Da 2ª apresentação em diante, a taxa conta como custo das voltas do processo."
        >
          <Select id="taxa-apresentacao" name="protocolId" defaultValue="">
            <option value="">Sem apresentação ligada</option>
            {apresentacoes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.rotulo}
              </option>
            ))}
          </Select>
        </CampoForm>
      )}

      <CampoForm label="Já paga em" htmlFor="taxa-paga" helper="Em branco se ainda vai ser paga.">
        <CampoData id="taxa-paga" name="paidAt" />
      </CampoForm>

      <FormFooter pending={isPending} submitLabel="Lançar" pendingLabel="Lançando…" onCancel={onClose} />
    </form>
  );
}
