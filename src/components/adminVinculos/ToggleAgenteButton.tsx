"use client";

import { useTransition } from "react";
import { Switch } from "@/components/ui/Switch";

type Props = {
  action: (ligado: boolean) => Promise<void>;
  ligado: boolean;
  /** Texto quando ligado — ex. "Recepção", "Automação". */
  rotuloLigado: string;
  /** Texto quando desligado — ex. "Setor", "Pessoa". */
  rotuloDesligado: string;
  nome: string;
  canEdit: boolean;
};

/**
 * Liga/desliga um papel de um agente do Chatwoot (recepção, automação).
 *
 * Sem confirmação, ao contrário do toggle de ativo/inativo: aqui nada é perdido
 * e o efeito é reversível no mesmo clique. O que muda é a leitura das próximas
 * avaliações — as já gravadas só mudam quando a repontuação roda.
 */
export function ToggleAgenteButton({
  action,
  ligado,
  rotuloLigado,
  rotuloDesligado,
  nome,
  canEdit,
}: Props) {
  const [pending, startTransition] = useTransition();

  if (!canEdit) {
    return <span className="text-ui text-fg-muted">{ligado ? rotuloLigado : "—"}</span>;
  }

  // Nome fixo ("Recepção: Fulano") e o estado no `aria-checked` — antes era um
  // botão `aria-pressed` cujo nome trocava a cada clique.
  return (
    <Switch
      checked={ligado}
      onCheckedChange={(proximo) => startTransition(() => void action(proximo))}
      disabled={pending}
      rotulo={ligado ? rotuloLigado : rotuloDesligado}
      aria-label={`${rotuloLigado}: ${nome}`}
      className="min-w-[7.5rem]"
    />
  );
}
