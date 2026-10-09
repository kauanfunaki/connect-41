"use client";

import Link from "next/link";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dangerSolid" | "success" | "link" | "linkMuted";
type Size = "xs" | "sm" | "md" | "lg" | "icon";

type CommonProps = {
  variant?: Variant;
  size?: Size;
  className?: string;
  children?: React.ReactNode;
};

const COMMON_KEYS = ["variant", "size", "className", "children"] as const;

function omitCommon<T extends CommonProps>(props: T): Omit<T, (typeof COMMON_KEYS)[number]> {
  const rest = { ...props };
  for (const key of COMMON_KEYS) delete rest[key];
  return rest;
}

type ButtonProps = CommonProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps> & {
    href?: undefined;
    /** Troca o rótulo por `loadingLabel` e desabilita. Só faz sentido em botão. */
    loading?: boolean;
    /** O que aparece enquanto carrega — "Enviando…", "Criando…". Padrão: "Salvando…". */
    loadingLabel?: string;
    /** O React 19 entrega o `ref` como prop: a confirmação foca o botão de confirmar. */
    ref?: React.Ref<HTMLButtonElement>;
  };

type LinkProps = CommonProps &
  Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof CommonProps | "href"> & {
    /** Com href o componente vira <Link>, com a mesma aparência. 85 lugares do
     *  app estilizavam um <Link> à mão pra parecer botão. */
    href: string;
    loading?: undefined;
    loadingLabel?: undefined;
    /** `false` para não pré-carregar o destino ao aparecer na tela. */
    prefetch?: boolean;
    /** Rota que devolve arquivo (CSV, PDF, exportação): vira um <a download>
     *  simples. O <Link> pré-carregaria a rota — gerando o arquivo só de a tela
     *  abrir — e tentaria navegar dentro do app ao clicar. */
    download?: boolean | string;
    /** Um `<a>` simples, sem o `<Link>` (07/10/2026): endereço de fora do app
     *  (a reunião do Teams, a autorização de uma integração) ou rota que o
     *  navegador abre (PDF). Quatro telas copiavam a classe do botão num `<a>`
     *  porque o `href` virava `<Link>` — pré-carga e navegação por dentro do
     *  app, que ali não servem. Combine com `target`/`rel` quando for o caso. */
    nativo?: boolean;
  };

type Props = ButtonProps | LinkProps;

// secondary e danger foram recalibrados pra bater com o botão real do app,
// medido em dezenas de call-sites — o que este componente declarava antes
// era o oposto do que o app inteiro já usava:
// • secondary: era fundo cinza permanente. O "Cancelar" real (FormFooter,
//   ConfirmDialog, e a maioria dos formulários) não tem fundo em repouso —
//   só borda, e ganha fundo no hover.
// • danger: era fundo+borda sólidos, virando vermelho cheio no hover. O botão
//   de exclusão real (ui/DeleteButton.tsx, o próprio componente da biblioteca
//   com 10 consumidores) é borda translúcida, sem fundo em repouso, tingindo
//   levemente no hover — adotado aqui ao pé da letra.
const VARIANT_CLASS: Record<Variant, string> = {
  // `brand-solid`, e não `brand` (07/10/2026): no escuro o `brand` vira o
  // brand-400, bom para texto azul, mas o branco em cima dele dava 3,28:1. O
  // preenchimento fica no azul 41 nos dois temas (ver globals.css).
  primary: "bg-brand-solid text-on-brand hover:bg-brand-solid-hover shadow-[var(--c41-shadow-xs),inset_0_1px_0_rgba(255,255,255,.14)]",
  secondary: "border border-border-strong text-fg hover:bg-surface-hover",
  ghost: "bg-transparent text-fg-secondary hover:bg-surface-hover hover:text-fg",
  danger: "border border-danger/30 text-danger hover:bg-danger/8",
  // O vermelho cheio da confirmação destrutiva (07/10/2026), que o
  // ConfirmDialog escrevia à mão em `bg-danger text-white` — 3,17:1 no escuro.
  // Tom fixo nos dois temas (4,99:1). Se a confirmação vai continuar cheia ou
  // virar contorno é decisão do Kauan; por ora é só a de lá que usa.
  dangerSolid: "bg-danger-solid text-white hover:bg-danger-solid/90 shadow-xs",
  // Simétrica ao danger, de propósito: o par que o app já usava era
  // "border-danger/30 text-danger" e "border-success/30 text-success", e o
  // desenho semântico do app é contorno, não preenchimento.
  //
  // Os outros dois verdes do app continuam com className por cima, porque são
  // exceção de uma tela cada: `bg-success text-white` na conclusão de admissão
  // (é o botão primário daquela ficha, que por acaso é verde) e o "Concluir
  // tarefa" do kanban, que fica neutro em repouso e só esverdeia no hover.
  success: "border border-success/30 text-success-fg hover:bg-success/8",
  // ─── As duas variantes sem caixa ──────────────────────────────────────────
  //
  // Medidas em 09/09 ao converter o kanban: 13 dos botões crus são texto
  // inline dentro de outra linha — "Responder" num comentário, "+ Vincular
  // tarefa" no rodapé de uma seção. Dar `h-7 px-2.5` a eles empurraria a linha
  // em que vivem, então estas variantes **pulam o SIZE_CLASS** inteiro.
  //
  // Elas também não fixam tamanho de fonte: 11px num rodapé de comentário e
  // 12px num rodapé de seção são contextuais, e vêm do call-site. Impor um
  // mudaria layout em vez de unificar.
  link: "text-brand hover:underline",
  linkMuted: "text-fg-muted hover:text-fg",
};

/** Variantes que não têm caixa — sem altura, sem padding, sem peso próprio. */
const SEM_CAIXA = new Set<Variant>(["link", "linkMuted"]);

// px-4/text-ui no md também vieram de medição: o `h-9`
// real do app aparece esmagadoramente com padding 16px e texto 13px — não
// os 18px/15px que este componente declarava (--fs-button, que ninguém
// media até então).
const SIZE_CLASS: Record<Size, string> = {
  // xs e sm em 12px, e não nos 13px que este componente declarava: medido em
  // 09/09, o app escreve `text-fs-2` em 56 dos 59 botões `h-8` e em 9 dos 12
  // `h-7`. A medição original que o comentário abaixo cita só tinha coberto o
  // `md` — onde 13px estava certo (54 contra 28).
  xs: "h-7 px-2.5 text-button-sm",
  sm: "h-8 px-3 text-button-sm",
  md: "h-9 px-4 text-ui",
  // `lg` existe para formulário de página cheia — candidatura em /carreiras,
  // admissão, assinatura de documento, seletor de tema, DISC e quiz. São telas
  // onde o botão é o destino da página inteira, e não um controle numa barra.
  // Os que estavam em `h-11` descem para cá: 4px a menos vale mais que um
  // sétimo tamanho para três call-sites.
  lg: "h-10 px-5 text-label",
  // Quadrado de 36px, sem padding, para um botão só de ícone na altura do `md`
  // (07/10/2026). O `w-9` por cima do `md` deixava o `px-4` espremer o ícone até
  // virar um ponto (o fechar do cartão do Kanban); quem acertava escrevia
  // `w-9 px-0!`. Fora de uma fileira de botões `md`, prefira o `IconButton`.
  icon: "h-9 w-9 px-0 text-ui",
};

// `active:translate-y-px`: o botão afunda 1px ao ser pressionado (polimento de
// 30/09) — o retorno tátil que faltava num app de muito clique. Desabilitado
// não afunda.
const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-semibold transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:translate-y-px disabled:active:translate-y-0 disabled:opacity-[var(--c41-disabled-op)] disabled:cursor-not-allowed";

// Sem `justify-center`, sem `font-semibold` e sem raio de botão: o alvo é uma
// palavra no meio de uma frase, não um controle com área própria.
const BASE_SEM_CAIXA =
  "inline-flex items-center gap-1 transition-colors disabled:opacity-[var(--c41-disabled-op)] disabled:cursor-not-allowed";

export function Button(props: Props) {
  const { variant = "primary", size = "md", className = "", children } = props;
  const cls = SEM_CAIXA.has(variant)
    ? `${BASE_SEM_CAIXA} ${VARIANT_CLASS[variant]} ${className}`.trim()
    : `${BASE} ${VARIANT_CLASS[variant]} ${SIZE_CLASS[size]} ${className}`.trim();

  if (props.href !== undefined) {
    const { href, download, nativo, prefetch, ...rest } = omitCommon(props);
    if (download) {
      return (
        <a href={href} download={download === true ? "" : download} className={cls} {...rest}>
          {children}
        </a>
      );
    }
    if (nativo) {
      return (
        <a href={href} className={cls} {...rest}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href} prefetch={prefetch} className={cls} {...rest}>
        {children}
      </Link>
    );
  }

  const { loading = false, loadingLabel = "Salvando…", disabled, ...rest } = omitCommon(props);
  return (
    <button type={rest.type ?? "button"} disabled={disabled || loading} className={cls} {...rest}>
      {loading ? loadingLabel : children}
    </button>
  );
}
