"use client";

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  CHAVE_DE_TELAS_RECENTES,
  lerTelasRecentes,
  moduloDaRota,
  registrarTelaRecente,
} from "@/lib/telasRecentes";

// O rastro das últimas telas abertas, guardado no navegador (ver
// `src/lib/telasRecentes.ts`). Fica num componente só porque são dois lados da
// mesma coisa: quem escreve (o registro, montado no shell) e quem lê (o Ctrl+K).

/** Disparado na própria aba ao gravar — o evento `storage` do navegador só avisa as OUTRAS. */
const EVENTO_LOCAL = "connect41:telas-recentes";

function assinar(avisar: () => void) {
  window.addEventListener("storage", avisar);
  window.addEventListener(EVENTO_LOCAL, avisar);
  return () => {
    window.removeEventListener("storage", avisar);
    window.removeEventListener(EVENTO_LOCAL, avisar);
  };
}

// A foto do store é a **string crua**, não a lista: `useSyncExternalStore` compara
// por identidade, e devolver um array novo a cada leitura renderizaria para sempre.
function foto(): string {
  try {
    return window.localStorage.getItem(CHAVE_DE_TELAS_RECENTES) ?? "";
  } catch {
    return "";
  }
}

function fotoNoServidor(): string {
  return "";
}

/** Os códigos das telas recentes, do mais recente para o mais antigo. */
export function useTelasRecentes(): string[] {
  const bruto = useSyncExternalStore(assinar, foto, fotoNoServidor);
  return lerTelasRecentes(bruto);
}

/**
 * Anota a tela atual como recente. Montado uma vez no shell.
 *
 * Só grava rota que é de módulo — `/home`, `/empresas` e o resto da navegação
 * geral ficam de fora, porque já estão fixos na sidebar e ocupariam a lista.
 */
export function RegistroDeTelasRecentes() {
  const pathname = usePathname();

  useEffect(() => {
    const code = moduloDaRota(pathname);
    if (!code) return;
    try {
      const atual = lerTelasRecentes(window.localStorage.getItem(CHAVE_DE_TELAS_RECENTES));
      const novo = registrarTelaRecente(atual, code);
      if (novo[0] === atual[0] && novo.length === atual.length) return;
      window.localStorage.setItem(CHAVE_DE_TELAS_RECENTES, JSON.stringify(novo));
      window.dispatchEvent(new Event(EVENTO_LOCAL));
    } catch {
      // Storage bloqueado (janela anônima, site data desligado): sem recentes,
      // e o resto do app segue igual.
    }
  }, [pathname]);

  return null;
}
