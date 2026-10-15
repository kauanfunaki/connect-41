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
  /** Mantém ações secundárias recolhidas mesmo quando resta uma única opção. */
  sempreMenu?: boolean;
  /** Classes extras do botão "⋯" — o alvo de 36px no celular do funil da vaga. */
  classeDoGatilho?: string;
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
//
// Uma ação só vira botão (09/10), menos a que apaga ou encerra — excluir,
// inativar, revogar, arquivar, cancelar, desfazer —, que fica no "⋯" mesmo
// sozinha (decisão D3 do Kauan, 15/10/2026). Ela chega aqui como `danger`:
// quem encerra marca o item assim, que é também o vermelho dentro do menu.
export function MenuDeMaisAcoes({
  children,
  rotulo = "Mais ações",
  "aria-label": ariaLabel,
  width = 180,
  align = "right",
  size = "sm",
  sempreMenu = false,
  classeDoGatilho = "",
}: Props) {
  const conteudo = typeof children === "function" ? children({ close: () => {} }) : children;
  const itens = itensVisiveis(conteudo);
  if (itens.length === 0) return null;
  const unico = itens[0];
  if (
    !sempreMenu &&
    itens.length === 1 &&
    isValidElement<React.ComponentProps<typeof ItemDoMenu>>(unico) &&
    unico.type === ItemDoMenu &&
    !unico.props.danger
  ) {
    const { onClick, href, icone, descricao, disabled, children: texto } = unico.props;
    const tamanho = size === "md" ? "sm" : "xs";
    // Uma ação direta precisa conservar o rótulo em uma linha: na célula de
    // uma tabela, encolher o botão quebrava "Abrir pendência" além da altura.
    const classe = "shrink-0 whitespace-nowrap [&>svg]:size-3.5 [&>svg]:shrink-0";
    if (href && !disabled) {
      return <Button href={href} onClick={onClick} variant="secondary" size={tamanho} title={descricao} className={classe}>{icone}{texto}</Button>;
    }
    return <Button type="button" onClick={onClick} disabled={disabled} variant="secondary" size={tamanho} title={descricao} className={classe}>{icone}{texto}</Button>;
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
          } ${classeDoGatilho}`.trim()}
        >
          <MoreHorizontal size={size === "md" ? 15 : 14} />
        </button>
      )}
    >
      {children}
    </Popover>
  );
}
