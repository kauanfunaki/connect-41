"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ItemDoMenu } from "@/components/ui/Popover";
import { ExcluirCadastro } from "@/components/exclusao/ExcluirCadastro";

type Props = {
  id: string;
  nome: string;
  /** Gerir o Recrutamento — o formulário inteiro. */
  podeEditar: boolean;
  /** Só administrador (`podeExcluir`). */
  podeExcluir: boolean;
};

/**
 * O "⋯" do cabeçalho da ficha do candidato. Desde 14/10/2026 cada bloco da
 * ficha se edita no próprio lugar (o lápis); o formulário com tudo de uma vez
 * continua aqui, em "Editar tudo", por enquanto. Excluir segue só para
 * administrador, com a prévia do que está ligado.
 */
export function AcoesDoCandidato({ id, nome, podeEditar, podeExcluir }: Props) {
  const [excluindo, setExcluindo] = useState(false);
  if (!podeEditar && !podeExcluir) return null;

  return (
    <>
      <MenuDeMaisAcoes size="md" sempreMenu width={200} rotulo="Mais ações do candidato">
        {({ close }) => (
          <>
            {podeEditar && (
              <ItemDoMenu href={`/candidatos/${id}/editar`} icone={<Pencil />} onClick={close}>
                Editar tudo
              </ItemDoMenu>
            )}
            {podeExcluir && (
              <ItemDoMenu
                danger
                icone={<Trash2 />}
                onClick={() => {
                  close();
                  setExcluindo(true);
                }}
              >
                Excluir candidato
              </ItemDoMenu>
            )}
          </>
        )}
      </MenuDeMaisAcoes>
      {podeExcluir && <ExcluirCadastro tipo="pessoa" id={id} nome={nome} aberto={excluindo} onFechar={() => setExcluindo(false)} />}
    </>
  );
}
