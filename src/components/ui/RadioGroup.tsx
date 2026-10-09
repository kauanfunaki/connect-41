"use client";

import { createContext, useContext, useId } from "react";

export type OpcaoDeRadio<V extends string = string> = {
  valor: V;
  /** Texto principal da opção. Sem ele (só a bolinha), passe `aria-label`. */
  rotulo?: React.ReactNode;
  /** Linha de apoio embaixo do rótulo — o que a opção quer dizer. */
  descricao?: React.ReactNode;
  /** Antes do texto: um ícone ou a logo do escritório. */
  icone?: React.ReactNode;
  disabled?: boolean;
  "aria-label"?: string;
};

type Variante = "linha" | "cartao";

type Grupo = {
  name: string;
  /** Nome gerado aqui: a escolha não vai para o formulário (ver `form=""`). */
  nomeInterno: boolean;
  /** `undefined` = não controlado (o navegador guarda a marca). */
  valor: string | null | undefined;
  valorInicial: string | undefined;
  variante: Variante;
  required: boolean;
  escolher: (valor: string) => void;
};

const ContextoDoGrupo = createContext<Grupo | null>(null);

type Props<V extends string> = {
  /** As opções; sem elas, monte as `<Radio>` à mão em `children` (layout próprio). */
  opcoes?: OpcaoDeRadio<V>[];
  children?: React.ReactNode;
  /** Controlado. `null` = nenhuma marcada. */
  valor?: V | null;
  /** Não controlado: a marcada ao abrir. */
  valorInicial?: V;
  onChange?: (valor: V) => void;
  /** Nome do campo no formulário. Sem ele, a escolha fica só na tela. */
  name?: string;
  /**
   * `cartao` (padrão): cada opção é um alvo de ao menos 44px, com borda, e a
   * escolhida pintada de azul — escolha que importa, ou tela de celular.
   * `linha`: bolinha e texto, lado a lado, para escolha miúda dentro de um form.
   */
  variante?: Variante;
  /** Título do grupo, no desenho do rótulo do `CampoForm`. */
  legenda?: React.ReactNode;
  /** Mantém a legenda só para o leitor de tela (o título já está à vista acima). */
  legendaOculta?: boolean;
  /** Sem legenda: o nome do grupo para o leitor de tela. */
  "aria-label"?: string;
  required?: boolean;
  disabled?: boolean;
  /** Colunas da grade de cartões, ex.: `sm:grid-cols-2`. */
  colunas?: string;
  /** Troca o arranjo das opções por inteiro (o padrão vem da variante). */
  classeDasOpcoes?: string;
  className?: string;
};

/**
 * Escolha única do Connect (08/10/2026), no lugar do rádio cru com
 * `accent-color` — a bolinha do sistema, que muda de desenho a cada navegador
 * e não segue o tema escuro. Eram sete telas com ela.
 *
 * Por baixo continua um `<input type="radio">` de verdade, invisível e do
 * tamanho da opção (a mesma decisão do `ChoicePill` e do `QuizForm`): as setas
 * andam entre as opções, o `required` barra o envio, o "limpar" do formulário
 * volta à marca inicial e o `FormData` recebe o valor — tudo do navegador, sem
 * reimplementar. O que é próprio é o desenho: bolinha, cartão e foco, pintados
 * pelo `:checked` (CSS), então o não controlado também acende a opção certa,
 * inclusive antes da hidratação.
 *
 * O grupo é um `<fieldset role="radiogroup">` com a legenda como nome.
 */
export function RadioGroup<V extends string>({
  opcoes,
  children,
  valor,
  valorInicial,
  onChange,
  name,
  variante = "cartao",
  legenda,
  legendaOculta = false,
  "aria-label": ariaLabel,
  required = false,
  disabled = false,
  colunas = "",
  classeDasOpcoes,
  className = "",
}: Props<V>) {
  const idDaLegenda = useId();
  const nomeGerado = useId();

  const grupo: Grupo = {
    name: name ?? nomeGerado,
    nomeInterno: !name,
    valor,
    valorInicial,
    variante,
    required,
    escolher: (v) => onChange?.(v as V),
  };

  const arranjo =
    classeDasOpcoes ??
    (opcoes ? (variante === "cartao" ? `grid grid-cols-1 gap-2 ${colunas}` : "flex flex-wrap gap-x-5 gap-y-2") : "flex flex-col gap-2");

  return (
    <fieldset
      role="radiogroup"
      aria-labelledby={legenda ? idDaLegenda : undefined}
      aria-label={legenda ? undefined : ariaLabel}
      aria-required={required || undefined}
      disabled={disabled}
      className={`min-w-0 ${className}`.trim()}
    >
      {legenda && (
        <legend id={idDaLegenda} className={legendaOculta ? "sr-only" : "mb-1.5 text-label font-medium text-fg"}>
          {legenda}
          {required && !legendaOculta && <span className="text-danger"> *</span>}
        </legend>
      )}
      <ContextoDoGrupo.Provider value={grupo}>
        <div className={arranjo}>{opcoes ? opcoes.map((o) => <Radio key={o.valor} {...o} />) : children}</div>
      </ContextoDoGrupo.Provider>
    </fieldset>
  );
}

/**
 * Uma opção do `RadioGroup`, para quando o arranjo é da tela — a bolinha ao
 * lado de um campo, como a alternativa correta do teste. Sem `rotulo`, vira só
 * a bolinha (com um alvo de 24px).
 */
export function Radio({
  valor,
  rotulo,
  descricao,
  icone,
  disabled,
  "aria-label": ariaLabel,
  className = "",
}: OpcaoDeRadio & { className?: string }) {
  const grupo = useContext(ContextoDoGrupo);
  if (!grupo) throw new Error("<Radio> precisa estar dentro de um <RadioGroup>.");

  const marca =
    grupo.valor === undefined ? { defaultChecked: grupo.valorInicial === valor } : { checked: grupo.valor === valor };
  const cartao = grupo.variante === "cartao" && rotulo != null;
  const comApoio = descricao != null;

  // Cobre a opção inteira: o clique em qualquer ponto cai no rádio, e o aviso
  // do `required` aponta para a opção, não para um ponto de 1px.
  const input = (
    <input
      type="radio"
      name={grupo.name}
      // Nome gerado aqui não é campo do formulário: sem dono (`form=""`), o
      // rádio continua agrupado pelo nome e não entra no `FormData`.
      form={grupo.nomeInterno ? "" : undefined}
      value={valor}
      {...marca}
      onChange={() => grupo.escolher(valor)}
      disabled={disabled}
      required={grupo.required}
      aria-label={ariaLabel}
      className="peer absolute inset-0 m-0 size-full cursor-[inherit] appearance-none opacity-0"
    />
  );

  const bolinha = (
    <span
      aria-hidden
      className={`flex size-4 flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-border-strong bg-input-bg transition-colors group-hover:border-brand group-has-[:checked]:border-brand-solid group-has-[:disabled]:border-border-strong ${
        cartao ? "" : "group-has-[:focus-visible]:outline-3 group-has-[:focus-visible]:outline-focus-ring"
      } ${comApoio ? "mt-0.5" : ""}`}
    >
      <span className="size-2 rounded-full bg-brand-solid scale-0 transition-transform motion-reduce:transition-none group-has-[:checked]:scale-100" />
    </span>
  );

  const texto = (rotulo != null || comApoio) && (
    <span className="min-w-0">
      {rotulo != null && (
        <span className={`block break-words ${cartao ? "text-label font-medium text-fg" : "text-label text-fg-secondary"}`}>{rotulo}</span>
      )}
      {comApoio && <span className="block mt-0.5 text-fs-2 leading-snug text-fg-muted break-words">{descricao}</span>}
    </span>
  );

  if (cartao) {
    return (
      <label
        className={`group relative flex min-h-11 gap-3 rounded-md border border-border-strong bg-surface px-3 py-2.5 cursor-pointer transition-colors not-has-[:checked]:hover:bg-surface-hover has-[:checked]:border-brand has-[:checked]:bg-brand-subtle has-[:checked]:shadow-[inset_0_0_0_1px_var(--c41-brand)] has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus-ring has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-[var(--c41-disabled-op)] ${
          comApoio ? "items-start" : "items-center"
        } ${className}`.trim()}
      >
        {input}
        {bolinha}
        {icone && (
          <span aria-hidden className="flex flex-shrink-0 items-center text-fg-secondary [&>svg]:size-4">
            {icone}
          </span>
        )}
        {texto}
      </label>
    );
  }

  return (
    <label
      className={`group relative inline-flex gap-2 cursor-pointer has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-[var(--c41-disabled-op)] ${
        comApoio ? "items-start" : "items-center"
      } ${rotulo == null && !comApoio ? "size-6 flex-shrink-0 justify-center" : ""} ${className}`.trim()}
    >
      {input}
      {bolinha}
      {icone && (
        <span aria-hidden className="flex flex-shrink-0 items-center text-fg-secondary [&>svg]:size-4">
          {icone}
        </span>
      )}
      {texto}
    </label>
  );
}
