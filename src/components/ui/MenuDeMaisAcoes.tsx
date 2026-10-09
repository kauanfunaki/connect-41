"use client";

import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { MoreHorizontal } from "lucide-react";
import { Popover, ItemDoMenu } from "@/components/ui/Popover";

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

// Fragmentos e agrupadores não contam como ações; condições falsas também não.
function itensVisiveis(conteudo: ReactNode): ReactNode[] {
  return Children.toArray(conteudo).flatMap((item) => {
    if (isValidElement<{ children?: ReactNode }>(item) && (item.type === Fragment || item.type === "div")) {
      return itensVisiveis(item.props.children);
    }
    return [item];
  });
}

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
  const conteudo = typeof children === "function" ? children({ close: () => {} }) : children;
  const itens = itensVisiveis(conteudo);
  if (itens.length === 0) return null;
  const unico = itens[0];
  if (itens.length === 1 && isValidElement<React.ComponentProps<typeof ItemDoMenu>>(unico) && unico.type === ItemDoMenu) {
    const { onClick, href, icone, descricao, danger, disabled, children: texto } = unico.props;
    const tamanho = size === "md" ? "sm" : "xs";
    // Uma ação direta precisa conservar o rótulo em uma linha: na célula de
    // uma tabela, encolher o botão quebrava "Abrir pendência" além da altura.
    const classe = "shrink-0 whitespace-nowrap [&>svg]:size-3.5 [&>svg]:shrink-0";
    if (href && !disabled) {
      return <Button href={href} onClick={onClick} variant={danger ? "danger" : "secondary"} size={tamanho} title={descricao} className={classe}>{icone}{texto}</Button>;
    }
    return <Button type="button" onClick={onClick} disabled={disabled} variant={danger ? "danger" : "secondary"} size={tamanho} title={descricao} className={classe}>{icone}{texto}</Button>;
  }
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
          data-dica={rotulo}
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
