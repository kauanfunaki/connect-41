import { Select } from "@/components/ui/Select";
import { CampoForm } from "@/components/ui/CampoForm";

/**
 * O campo Projeto do lançamento, da conciliação e da edição.
 *
 * **Aparece sempre** (19/10, retorno do BPO: "não achamos o campo de
 * projeto"). Até aqui só aparecia quando a empresa já tinha projeto cadastrado,
 * como o centro de custo — e nenhuma tinha, então o campo pedido não existia
 * para quem foi procurar. Sem projeto, fica desabilitado, dizendo que a
 * empresa não tem nenhum, com o link "Cadastrar projeto" ao lado do rótulo —
 * numa aba nova, para não perder o que já foi digitado.
 *
 * Sem frase embaixo (16/11/2026, melhoria-717): o link é o caminho, e
 * "Opcional. Um projeto por lançamento." não dizia nada que o campo não diga.
 */
export function CampoDeProjeto({
  id,
  companyId,
  projetos,
  defaultValue = "",
  className,
}: {
  id: string;
  companyId: string;
  projetos: { id: string; nome: string }[];
  defaultValue?: string;
  className?: string;
}) {
  const vazio = projetos.length === 0;
  return (
    <CampoForm
      label="Projeto"
      htmlFor={id}
      className={className}
      acao={
        vazio ? (
          <a href={`/fornecedores-e-sacados?empresa=${companyId}&aba=projetos`} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
            Cadastrar projeto
          </a>
        ) : undefined
      }
    >
      <Select id={id} name="projectId" defaultValue={vazio ? "" : defaultValue} disabled={vazio}>
        <option value="">{vazio ? "Nenhum projeto nesta empresa" : "Sem projeto"}</option>
        {projetos.map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
      </Select>
    </CampoForm>
  );
}
