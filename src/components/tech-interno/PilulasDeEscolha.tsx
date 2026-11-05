import { useId } from "react";
import { Check } from "lucide-react";

export type Pilula = { valor: string; rotulo: string };

/**
 * Escolha de um clique entre poucas opções (05/11/2026, opção A do formulário
 * do Controle interno): Tipo e Prioridade deixaram o `<select>`, que pedia dois
 * cliques e escondia as opções.
 *
 * Por baixo é um `<input type="radio">` de verdade, invisível e do tamanho da
 * pílula (a mesma decisão do `RadioGroup` e do `ChoicePill`): as setas andam
 * entre as opções, o `required` barra o envio, e o `FormData` recebe o valor
 * sem estado nenhum aqui. A escolhida se pinta pelo `:checked` (CSS), então
 * acende certo antes da hidratação, e leva um ✓ além da cor.
 *
 * O grupo é um `<fieldset role="radiogroup">` com a legenda como nome; dentro
 * de um `<fieldset disabled>` (somente consulta, enviando), desliga junto.
 */
export function PilulasDeEscolha({ legenda, name, opcoes, valorInicial, required = false }: {
  legenda: string; name: string; opcoes: Pilula[]; valorInicial?: string; required?: boolean;
}) {
  const id = useId();
  return <fieldset role="radiogroup" aria-labelledby={id} aria-required={required || undefined} className="min-w-0">
    <legend id={id} className="mb-1.5 text-label font-medium leading-5 text-fg">
      {legenda}{required && <span className="text-danger"> *</span>}
    </legend>
    <div className="flex flex-wrap gap-2">
      {opcoes.map(o => <label key={o.valor} className="group relative inline-flex h-11 sm:h-9 items-center gap-1.5 rounded-full border border-border-strong bg-surface px-3.5 text-ui font-medium text-fg-secondary cursor-pointer select-none transition-colors not-has-[:checked]:hover:border-brand not-has-[:checked]:hover:text-fg has-[:checked]:border-brand has-[:checked]:bg-brand-subtle has-[:checked]:text-brand has-[:checked]:shadow-[inset_0_0_0_1px_var(--c41-brand)] has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-focus-ring has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-[var(--c41-disabled-op)]">
        <input type="radio" name={name} value={o.valor} defaultChecked={valorInicial === o.valor} required={required}
          className="peer absolute inset-0 m-0 size-full cursor-[inherit] appearance-none opacity-0" />
        <Check size={14} aria-hidden className="hidden shrink-0 peer-checked:block" />
        {o.rotulo}
      </label>)}
    </div>
  </fieldset>;
}
