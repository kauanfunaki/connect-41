"use client";

import { JanelaDeCadastro } from "@/components/shared/JanelaDeCadastro";
import { PipelineForm } from "@/components/kanban/PipelineForm";
import { criarPipeline } from "@/app/(app)/kanban/actions";

/**
 * O "+ Novo kanban" do cabeçalho de /kanban, com o formulário numa janela (P19,
 * 15/10/2026) — como "Nova lista" e "Novo espaço". Abria a página /kanban/novo,
 * que agora traz de volta à lista com a janela aberta. Criado, vai para o quadro.
 */
export function NovoKanban({
  sectorOptions,
  abertaDeInicio = false,
}: {
  sectorOptions: { value: string; label: string }[];
  abertaDeInicio?: boolean;
}) {
  return (
    <JanelaDeCadastro rotulo="Nova tarefa" maxWidth="max-w-2xl" abertaDeInicio={abertaDeInicio}>
      {(fechar) => <PipelineForm action={criarPipeline} sectorOptions={sectorOptions} onCancel={fechar} />}
    </JanelaDeCadastro>
  );
}
