"use client";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "prefix"> & {
  error?: boolean;
  icon?: React.ReactNode;
  /** Texto fixo antes do valor, ex.: "R$" — renderiza célula separada por borda. */
  prefix?: string;
  /** Texto fixo depois do valor, ex.: "%" ou "kg". */
  suffix?: string;
  /**
   * Variante enxuta pra barras de ferramentas (busca ao lado de botões de
   * filtro/visão), onde o input de formulário — 36px de altura e 16px de fonte
   * — destoava dos controles de 32px/12px em volta. Formulário continua no
   * tamanho padrão: 16px é o que evita o zoom automático do Safari no iOS ao
   * focar um campo, e vale pagar esse preço onde se digita de verdade.
   */
  compact?: boolean;
  /** Controle dentro do campo, à direita — o olho da senha, um "limpar".
   *  Diferente do `suffix`, é clicável e não leva a divisória. */
  direita?: React.ReactNode;
};

export function Input({ error = false, icon, prefix, suffix, direita, compact = false, className = "", disabled, readOnly, ...rest }: Props) {
  const sizeClass = compact ? "h-8 text-ui" : "h-9 text-input";
  // `w-full` é o padrão de formulário; quem passa largura própria (o mês do
  // filtro, as horas do processo) quer a dele. Com os dois, o `w-40` perdia
  // para o `w-full` no CSS, e o filtro de mês esticava pela tela inteira,
  // empurrando o "Aplicar" para outra linha (visto no redesign de 30/09).
  const largura = /(^|\s)w-(?!full(\s|$))\S+/.test(className) ? "" : "w-full";
  // Variante com prefixo/sufixo/controle: a borda e o focus ring vivem no
  // wrapper (focus-within), e o input interno fica transparente e sem borda.
  if (prefix || suffix || direita) {
    return (
      <div
        className={`flex items-stretch ${largura} ${compact ? "h-8" : "h-9"} rounded-md border bg-input-bg overflow-hidden transition-colors ${
          error
            ? "border-danger focus-within:shadow-[0_0_0_3px_var(--c41-danger-bg)]"
            : "border-border-strong focus-within:border-brand focus-within:shadow-[0_0_0_3px_var(--c41-focus-ring)]"
        } has-[:disabled]:opacity-[var(--c41-disabled-op)] ${className}`.trim()}
      >
        {/* O ícone também aqui (07/10/2026): sem ele, a senha com o olho perdia
            o cadeado que o e-mail logo acima mantinha. */}
        {icon && (
          <span className="flex items-center pl-3 text-fg-muted [&>svg]:w-4 [&>svg]:h-4 pointer-events-none">{icon}</span>
        )}
        {prefix && (
          <span className="flex items-center px-3 text-helper text-fg-muted border-r border-border select-none whitespace-nowrap">
            {prefix}
          </span>
        )}
        {/* `focus-visible:shadow-none!`: o anel é da caixa (focus-within). O
            `:focus-visible` global do globals.css, fora das camadas do
            Tailwind, desenhava um segundo anel aqui dentro — o traço vertical
            que aparecia ao lado do "R$" e do olho da senha (07/10/2026). O
            mesmo que os campos de data já faziam (`useCampoDigitado`). */}
        <input
          disabled={disabled}
          readOnly={readOnly}
          className={`flex-1 min-w-0 ${icon ? "pl-2.5 pr-3" : "px-3"} bg-transparent ${compact ? "text-ui" : "text-input"} text-fg placeholder:text-fg-muted outline-none focus-visible:shadow-none!`}
          {...rest}
        />
        {suffix && (
          <span className="flex items-center px-3 text-helper text-fg-muted border-l border-border select-none whitespace-nowrap">
            {suffix}
          </span>
        )}
        {direita && <span className="flex items-center pr-1">{direita}</span>}
      </div>
    );
  }

  // No campo simples o anel é do próprio input. Com erro, o `!`: o
  // `:focus-visible` global vence as utilidades do Tailwind e trocava o anel
  // vermelho pelo azul justamente no campo que tem erro.
  const input = (
    <input
      disabled={disabled}
      readOnly={readOnly}
      className={`${largura} ${sizeClass} ${icon ? "pl-9" : "px-3"} pr-3 rounded-md border bg-input-bg text-fg placeholder:text-fg-muted outline-none transition-colors ${
        error
          ? "border-danger focus:shadow-[0_0_0_3px_var(--c41-danger-bg)]!"
          : "border-border-strong focus:border-brand focus:shadow-[0_0_0_3px_var(--c41-focus-ring)]"
      } ${readOnly ? "bg-transparent border-dashed" : ""} disabled:opacity-[var(--c41-disabled-op)] ${className}`.trim()}
      {...rest}
    />
  );

  if (!icon) return input;

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted [&>svg]:w-4 [&>svg]:h-4 pointer-events-none">
        {icon}
      </span>
      {input}
    </div>
  );
}
