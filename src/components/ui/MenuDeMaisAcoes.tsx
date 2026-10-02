"use client";

import { MoreHorizontal } from "lucide-react";
import { Popover } from "@/components/ui/Popover";

type Props = {
  children: React.ComponentProps<typeof Popover>["children"];
  /** Nome do botão para leitor de tela e dica. */
  rotulo?: string;
  /** Nome acessível do painel; padrão: o `rotulo`. */
  "aria-label"?: string;
  width?: number;
  align?: "left" | "right";
  /** `sm` (28px) na linha de tabela, ao lado de botão `xs`; `md` (32px) ao
   *  lado de botão `sm` ou numa barra. */
  size?: "sm" | "md";
};

// O "⋯" das ações que saem da linha (regra de 30/09: "botão não é link; o que
// leva para fora da linha vai num menu ⋯"). Era o mesmo gatilho copiado em seis
// componentes — AcoesDeLinha, AcoesDaLicenca, AcoesDoItem, AcoesDoCadastro,
// MenuDoRegistro e AcoesDoModelo (02/10/2026).
export function MenuDeMaisAcoes({
  children,
  rotulo = "Mais ações",
  "aria-label": ariaLabel,
  width = 180,
  align = "right",
  size = "sm",
}: Props) {
  return (
    <Popover
      align={align}
      width={width}
      aria-label={ariaLabel ?? rotulo}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label={rotulo}
          aria-expanded={open}
          title={rotulo}
          className={`${size === "md" ? "h-8 w-8" : "h-7 w-7"} rounded-md border inline-flex items-center justify-center transition-colors ${
            open ? "border-brand/40 bg-brand-subtle text-fg" : "border-border-strong text-fg-muted hover:text-fg hover:bg-surface-hover"
          }`}
        >
          <MoreHorizontal size={size === "md" ? 15 : 14} />
        </button>
      )}
    >
      {children}
    </Popover>
  );
}
