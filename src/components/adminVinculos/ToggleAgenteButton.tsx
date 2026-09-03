"use client";

import { useTransition } from "react";

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
    return <span className="text-[length:var(--fs-ui)] text-fg-muted">{ligado ? rotuloLigado : "—"}</span>;
  }

  const rotulo = ligado
    ? `Tirar ${nome} de ${rotuloLigado.toLowerCase()}`
    : `Marcar ${nome} como ${rotuloLigado.toLowerCase()}`;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => void action(!ligado))}
      title={rotulo}
      aria-label={rotulo}
      aria-pressed={ligado}
      className={`c41-toggle-active ${ligado ? "is-on" : ""}`}
    >
      {ligado ? rotuloLigado : rotuloDesligado}
      <span className="switch" />
    </button>
  );
}
