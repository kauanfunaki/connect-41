/**
 * Troca o valor de um campo como se a pessoa tivesse digitado: o `onChange` do
 * React dispara (controlado ou não) e o `change` chega ao formulário.
 *
 * Atribuir `input.value = x` direto não basta: o React guarda o último valor
 * que viu e, sem diferença, engole o evento. Pelo setter do protótipo o valor
 * muda sem o React saber, e o `input` que vem em seguida é tratado como
 * digitação. É o que o − e o + do `CampoNumero`, o "limpar" da busca e a
 * escolha de uma sugestão usam.
 */
export function digitarNoCampo(input: HTMLInputElement, valor: string): void {
  const definir = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (definir) definir.call(input, valor);
  else input.value = valor;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
