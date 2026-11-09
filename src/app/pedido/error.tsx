"use client";

import { ErroPublico } from "@/components/publico/ErroPublico";

// O link público de pedido (09/11/2026) — rota pública, sem sidebar nem shell:
// quem abre ainda não é cliente.
export default function PedidoError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErroPublico error={error} reset={reset} rotulo="pedido" texto="Não foi possível carregar esta página. Tente novamente em instantes." />;
}
