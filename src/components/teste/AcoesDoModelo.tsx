"use client";

import { useTransition } from "react";
import { Archive, ArchiveRestore, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ItemDoMenu } from "@/components/ui/Popover";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { useConfirm } from "@/components/ui/useConfirm";
import { alternarAtivoTemplate, excluirTemplate } from "@/app/(app)/testes/templates/actions";

type Props = {
  id: string;
  nome: string;
  ativo: boolean;
  /** Modelo já usado não se exclui — arquiva (ver `excluirTemplate`). */
  podeExcluir: boolean;
};

/**
 * As ações da linha de um modelo de teste.
 *
 * Eram três textos soltos (até 30/09): "Editar", "Arquivar" e "Excluir" — este
 * com o diálogo do cadastro de campos, que falava em "campo". Desde o
 * polimento seguem o desenho das linhas de Cadastros: **Editar** é botão, e o
 * que é raro ou tira o modelo da lista (arquivar, reativar, excluir) vai no
 * menu "⋯".
 */
export function AcoesDoModelo({ id, nome, ativo, podeExcluir }: Props) {
  const [pendente, startTransition] = useTransition();
  const { dialog, requestConfirm } = useConfirm();

  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Button variant="secondary" size="xs" href={`/testes/templates/${id}/editar`}>
        <Pencil size={11} /> Editar
      </Button>
      <MenuDeMaisAcoes align="right" width={180} aria-label={`Mais ações do modelo ${nome}`}>
        {({ close }) => (
          <>
            <ItemDoMenu
              icone={ativo ? <Archive /> : <ArchiveRestore />}
              disabled={pendente}
              onClick={() => {
                close();
                startTransition(() => alternarAtivoTemplate(id));
              }}
            >
              {ativo ? "Arquivar" : "Reativar"}
            </ItemDoMenu>
            {podeExcluir && (
              <ItemDoMenu
                icone={<Trash2 />}
                danger
                onClick={() => {
                  close();
                  requestConfirm(
                    {
                      title: `Excluir o modelo "${nome}"?`,
                      description: "Esta ação não pode ser desfeita.",
                      destructive: true,
                      confirmLabel: "Excluir",
                    },
                    () => excluirTemplate(id)
                  );
                }}
              >
                Excluir
              </ItemDoMenu>
            )}
          </>
        )}
      </MenuDeMaisAcoes>
      {dialog}
    </span>
  );
}
