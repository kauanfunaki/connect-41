"use client";

import { useState } from "react";
import { useConfirm } from "@/components/ui/useConfirm";
import { Select } from "@/components/ui/Select";

type Props = {
  action: (sectorCode: string) => Promise<void>;
  /** Setor que opera o módulo hoje, já resolvido. */
  atual: string;
  opcoes: { value: string; label: string }[];
  nome: string;
};

export function SetorDoModuloSelect({ action, atual, opcoes, nome }: Props) {
  const { dialog, requestConfirm } = useConfirm();
  // Controlado: se a confirmação for cancelada, o select volta ao setor atual
  // em vez de exibir uma transferência que não aconteceu.
  const [valor, setValor] = useState(atual);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const novo = e.target.value;
    if (novo === valor) return;
    const rotulo = opcoes.find((o) => o.value === novo)?.label ?? novo;
    requestConfirm(
      {
        title: `Transferir "${nome}" para ${rotulo}?`,
        description:
          "O módulo passa a aparecer no menu desse setor, e só quem é dele (ou administrador) consegue abrir. Quem é só do setor atual perde o acesso. Os dados não mudam.",
        confirmLabel: "Transferir",
      },
      async () => {
        setValor(novo);
        await action(novo);
      }
    );
  }

  return (
    <>
      <Select compact value={valor} onChange={handleChange} aria-label={`Setor que opera ${nome}`}>
        {opcoes.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
      {dialog}
    </>
  );
}
