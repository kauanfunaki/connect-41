"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * "Tentar de novo" de um bloco do Início que não carregou (11/11/2026, P26).
 * O texto dizia "Atualize a página", e o portal instalado como app não tem
 * botão de recarregar. `router.refresh()` pede a tela de novo ao servidor sem
 * perder a rolagem; enquanto isso, o botão diz que está tentando e não aceita
 * outro toque.
 */
export function TentarDeNovo() {
  const router = useRouter();
  const [tentando, iniciar] = useTransition();
  return (
    <Button type="button" variant="secondary" size="sm" disabled={tentando} onClick={() => iniciar(() => router.refresh())}>
      <RotateCw size={14} aria-hidden className={tentando ? "animate-spin motion-reduce:animate-none" : undefined} />
      {tentando ? "Tentando…" : "Tentar de novo"}
    </Button>
  );
}
