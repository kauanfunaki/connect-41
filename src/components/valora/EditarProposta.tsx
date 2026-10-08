"use client";

import { useId, useState, useTransition } from "react";
import { MessageSquareReply } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Modal } from "@/components/ui/Modal";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { atualizarProposta } from "@/app/(app)/valora/actions";
import { FormFooter } from "@/components/ui/FormFooter";

type Proposta = {
  id: string;
  cliente?: string;
  status: string;
  motivo: string | null;
  precoOferecido: number | null;
  precoConcorrente: number | null;
};

const texto = (n: number | null) => (n === null ? "" : n.toFixed(2).replace(".", ","));

/**
 * Fechou ou perdeu, por quê e por quanto — é o registro que vira comparação com o mercado.
 *
 * Numa janela, e não mais aberto dentro da célula da tabela (revisão de
 * alinhamento, 30/09): eram quatro campos empilhados sem rótulo — só o
 * placeholder dizia qual preço era qual, e sumia ao digitar — e a linha da
 * proposta esticava até caber o formulário. A janela tem rótulo em cada campo
 * e o rodapé padrão; os nomes enviados são os mesmos.
 */
export function EditarProposta({ proposta }: { proposta: Proposta }) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  // A mesma proposta aparece duas vezes na página (cartão no celular e linha
  // na tabela), então os ids dos campos não podem ser fixos.
  const id = useId();

  return (
    <>
      {/* Botão de verdade, e não texto cinza (conferência de 30/09: botão não
          é link) — é a ação da linha da proposta. */}
      <Button variant="secondary" size="xs" onClick={() => setAberto(true)}>
        <MessageSquareReply size={12} /> Registrar retorno
      </Button>

      <Modal
        open={aberto}
        onClose={() => !pendente && setAberto(false)}
        title={proposta.cliente ? `Retorno — ${proposta.cliente}` : "Registrar retorno"}
        maxWidth="max-w-lg"
      >
        {/* `text-left`: a janela nasce dentro da célula da tabela, que o casco
            `.c41-tabela` centraliza — e o alinhamento herdaria. */}
        <form
          className="flex flex-col gap-4 text-left"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setErro(null);
            startTransition(async () => {
              const r = await atualizarProposta({
                id: proposta.id,
                status: f.get("status"),
                motivo: f.get("motivo"),
                precoOferecido: f.get("precoOferecido"),
                precoConcorrente: f.get("precoConcorrente"),
              });
              if ("error" in r) setErro(r.error);
              else setAberto(false);
            });
          }}
        >
          <CampoForm label="Situação" htmlFor={`${id}-status`}>
            <Select id={`${id}-status`} name="status" defaultValue={proposta.status}>
              <option value="ABERTA">Em aberto</option>
              <option value="GANHA">Ganha</option>
              <option value="PERDIDA">Perdida</option>
            </Select>
          </CampoForm>
          <FieldGrid>
            <CampoForm label="Preço oferecido" htmlFor={`${id}-oferecido`}>
              <Input
                id={`${id}-oferecido`}
                name="precoOferecido"
                prefix="R$"
                inputMode="decimal"
                defaultValue={texto(proposta.precoOferecido)}
                placeholder="0,00"
              />
            </CampoForm>
            <CampoForm label="Preço do concorrente" htmlFor={`${id}-concorrente`}>
              <Input
                id={`${id}-concorrente`}
                name="precoConcorrente"
                prefix="R$"
                inputMode="decimal"
                defaultValue={texto(proposta.precoConcorrente)}
                placeholder="0,00"
              />
            </CampoForm>
          </FieldGrid>
          {/* Várias linhas desde 05/10: além do motivo, é onde ficam as
              observações da tratativa, que a página da proposta mostra. */}
          <CampoForm label="Motivo e observações" htmlFor={`${id}-motivo`}>
            <Textarea
              id={`${id}-motivo`}
              name="motivo"
              rows={3}
              maxLength={500}
              defaultValue={proposta.motivo ?? ""}
              placeholder="Fechou por…, perdeu para…, combinamos…"
            />
          </CampoForm>
          {erro && <p className="text-helper font-medium text-danger">{erro}</p>}
          <FormFooter
            pending={pendente}
            onCancel={() => setAberto(false)}
          />
        </form>
      </Modal>
    </>
  );
}
