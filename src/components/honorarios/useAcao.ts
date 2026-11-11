"use client";

import { useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import type { ResultadoDaAcao } from "@/lib/honorarios/acesso";

/** Roda uma ação dos Honorários, trava os botões enquanto roda e avisa o resultado. */
export function useAcao() {
  const toast = useToast();
  const [rodando, iniciar] = useTransition();
  function rodar(acao: () => Promise<ResultadoDaAcao>, depois?: () => void) {
    iniciar(async () => {
      const r = await acao();
      if (!r.ok) return toast.error(r.erro);
      if (r.mensagem) toast.success(r.mensagem);
      depois?.();
    });
  }
  return { rodando, rodar };
}
