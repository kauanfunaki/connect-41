"use client";

import { useTransition } from "react";

type Props = {
  action: (isReception: boolean) => Promise<void>;
  ehRecepcao: boolean;
  nome: string;
  canEdit: boolean;
};

/**
 * Marca um agente do Chatwoot como recepção/triagem.
 *
 * Sem confirmação, ao contrário do toggle de ativo/inativo: aqui nada é perdido
 * e o efeito é reversível no mesmo clique. O que muda é a leitura das próximas
 * avaliações — as já gravadas só mudam quando a repontuação roda.
 */
export function ToggleRecepcaoButton({ action, ehRecepcao, nome, canEdit }: Props) {
  const [pending, startTransition] = useTransition();

  if (!canEdit) {
    return (
      <span className="text-[length:var(--fs-ui)] text-fg-muted">{ehRecepcao ? "Recepção" : "—"}</span>
    );
  }

  const rotulo = ehRecepcao ? `Tirar ${nome} da recepção` : `Marcar ${nome} como recepção`;

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => void action(!ehRecepcao))}
      title={rotulo}
      aria-label={rotulo}
      aria-pressed={ehRecepcao}
      className={`c41-toggle-active ${ehRecepcao ? "is-on" : ""}`}
    >
      {ehRecepcao ? "Recepção" : "Setor"}
      <span className="switch" />
    </button>
  );
}
