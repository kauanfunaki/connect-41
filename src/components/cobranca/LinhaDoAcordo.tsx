"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * Uma linha da tabela de acordos (Cobrança A, 04/11/2026). "Ver parcelas"
 * abre embaixo as parcelas, os títulos originais e o texto do acordo, que
 * antes ocupavam três linhas de cada cartão. Começa fechada.
 */
export function LinhaDoAcordo({
  colunas,
  detalhe,
  menu,
  rotulo,
}: {
  /** As células da linha, já montadas no servidor. */
  colunas: ReactNode;
  detalhe: ReactNode;
  menu?: ReactNode;
  /** O sacado, para o leitor de tela. */
  rotulo: string;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <tr className={`align-middle transition-colors hover:bg-surface-hover ${aberto ? "bg-surface-hover" : "border-b border-border-soft"}`}>
        {colunas}
        <td className="py-2.5 whitespace-nowrap text-right">
          <span className="inline-flex items-center gap-1">
            <Button type="button" variant="secondary" size="xs" onClick={() => setAberto((a) => !a)} aria-expanded={aberto} aria-label={`${aberto ? "Fechar" : "Ver"} parcelas do acordo de ${rotulo}`}>
              {aberto ? "Fechar" : "Ver parcelas"}
              <ChevronDown size={12} className={`transition-transform ${aberto ? "rotate-180" : ""}`} />
            </Button>
            {menu}
          </span>
        </td>
      </tr>
      {aberto && (
        <tr className="border-b border-border-soft bg-surface-hover">
          <td colSpan={6} className="px-3 pb-4 pt-1">
            {detalhe}
          </td>
        </tr>
      )}
    </>
  );
}
