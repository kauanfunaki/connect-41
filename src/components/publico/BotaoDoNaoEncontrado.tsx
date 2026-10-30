"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { destinoDoNaoEncontrado } from "@/lib/destinoDoNaoEncontrado";

const semAssinatura = () => () => {};

/**
 * O botão da página não encontrada, com o destino pelo endereço (ver
 * `destinoDoNaoEncontrado`). O endereço só existe no navegador: no servidor o
 * botão sai com o início da equipe e troca ao hidratar.
 */
export function BotaoDoNaoEncontrado() {
  const caminho = useSyncExternalStore(semAssinatura, () => window.location.pathname, () => null);
  const destino = destinoDoNaoEncontrado(caminho);
  if ("voltar" in destino) {
    return (
      <Button type="button" className="mt-1" onClick={() => window.history.back()}>
        {destino.rotulo}
      </Button>
    );
  }
  return (
    <Button href={destino.href} className="mt-1">
      {destino.rotulo}
    </Button>
  );
}
