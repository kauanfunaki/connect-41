"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { MenuDeMaisAcoes } from "@/components/ui/MenuDeMaisAcoes";
import { ItemDoMenu } from "@/components/ui/Popover";
import { ExcluirCadastro } from "@/components/exclusao/ExcluirCadastro";

type Props = {
  id: string;
  nome: string;
  /** Só administrador (`podeExcluir`). */
  podeExcluir: boolean;
};

/**
 * O "⋯" do cabeçalho da ficha do candidato: só o Excluir, para administrador,
 * com a prévia do que está ligado. Editar é no próprio bloco da ficha (o
 * lápis); o "Editar tudo", que abria o formulário inteiro, saiu em
 * 14/10/2026. Sem permissão de excluir, o "⋯" nem aparece.
 */
export function AcoesDoCandidato({ id, nome, podeExcluir }: Props) {
  const [excluindo, setExcluindo] = useState(false);
  if (!podeExcluir) return null;

  return (
    <>
      <MenuDeMaisAcoes size="md" sempreMenu width={200} rotulo="Mais ações do candidato">
        {({ close }) => (
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
      </MenuDeMaisAcoes>
      <ExcluirCadastro tipo="pessoa" id={id} nome={nome} aberto={excluindo} onFechar={() => setExcluindo(false)} />
    </>
  );
}
