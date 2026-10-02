import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { CampoData } from "@/components/ui/CampoData";
import { Select } from "@/components/ui/Select";
import { MAX_TITULO } from "@/lib/societario/dados-do-processo";
import { PRIORIDADES, PRIORIDADE_LABEL, type Prioridade } from "@/lib/societario/prioridade";

export type ValoresDoProcesso = {
  titulo: string;
  responsavelId: string;
  prioridade: Prioridade;
  /** "AAAA-MM-DD" ou vazio. */
  prazoCombinado: string;
};

type Props = {
  responsaveis: { id: string; name: string }[];
  valores: ValoresDoProcesso;
  /** Distingue os ids quando o formulário de abrir e o de editar convivem na página. */
  prefixo: string;
};

/**
 * Título, responsável, prioridade e prazo combinado — os mesmos campos no abrir
 * e no editar, lidos pela mesma `lerDadosDoProcesso`.
 */
export function CamposDoProcesso({ responsaveis, valores, prefixo }: Props) {
  return (
    <>
      <CampoForm
        label="Título"
        htmlFor={`${prefixo}-titulo`}
        helper="Opcional — o que diferencia este processo de outro do mesmo tipo na mesma empresa."
      >
        <Input
          id={`${prefixo}-titulo`}
          name="title"
          maxLength={MAX_TITULO}
          defaultValue={valores.titulo}
          placeholder="Ex.: Abertura da filial de Pinhais"
        />
      </CampoForm>

      <FieldGrid>
        <CampoForm label="Responsável" htmlFor={`${prefixo}-responsavel`}>
          <Select id={`${prefixo}-responsavel`} name="ownerUserId" defaultValue={valores.responsavelId}>
            <option value="">Sem responsável</option>
            {responsaveis.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Prioridade" htmlFor={`${prefixo}-prioridade`}>
          <Select id={`${prefixo}-prioridade`} name="priority" defaultValue={valores.prioridade}>
            {PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {PRIORIDADE_LABEL[p]}
              </option>
            ))}
          </Select>
        </CampoForm>
      </FieldGrid>

      <CampoForm
        label="Prazo combinado"
        htmlFor={`${prefixo}-prazo`}
        helper="Opcional — a data prometida ao cliente. O prazo previsto do tipo continua sendo contado em dias úteis."
      >
        {/* Largura de data, não a do modal: esticada, o dia ficava num canto e o
            calendário no outro. A explicação continua na largura toda embaixo. */}
        <CampoData
          id={`${prefixo}-prazo`}
          name="dueAt"
         
          defaultValue={valores.prazoCombinado}
          className="sm:w-44"
        />
      </CampoForm>
    </>
  );
}
