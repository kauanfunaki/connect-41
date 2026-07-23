"use client";

import { useEffect } from "react";
import { CADASTROS_LAST_TAB_KEY, type CadastrosTab } from "@/lib/cadastrosNav";

// Sem UI própria — só grava em localStorage qual seção (Empresas/Pessoas) foi
// visitada por último, para o item "Cadastros" da sidebar saber pra onde levar.
export function CadastrosTabSync({ tab }: { tab: CadastrosTab }) {
  useEffect(() => {
    window.localStorage.setItem(CADASTROS_LAST_TAB_KEY, tab);
  }, [tab]);

  return null;
}
