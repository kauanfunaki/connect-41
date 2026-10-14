// O cartão "Connect sob medida" da seção Planos do site (14/10/2026, pedido do
// Kauan): o escritório que quer começar por um ou dois setores — os que
// quiser — escolhe os setores nas etiquetas do cartão, e o "Montar meu plano"
// abre o e-mail de contato do site com o assunto "Connect sob medida" e os
// setores escolhidos no corpo. Sem preço: o valor sai dos módulos escolhidos.
//
// Puro e pequeno: vai para o componente de cliente do cartão
// (components/site/EscolhaDosSetores) e para os testes.

export const ASSUNTO_SOB_MEDIDA = "Connect sob medida";

/**
 * O link do "Montar meu plano". Sem setor escolhido (ou sem JavaScript na
 * página, que é o mesmo começo), só o assunto; com setores, o corpo do e-mail
 * já traz a lista, na ordem das etiquetas. Quebra de linha do e-mail é CRLF
 * (`%0D%0A`), como pede o `mailto:`.
 */
export function linkDoSobMedida(contato: string, setores: readonly string[]): string {
  const assunto = `subject=${encodeURIComponent(ASSUNTO_SOB_MEDIDA)}`;
  if (setores.length === 0) return `mailto:${contato}?${assunto}`;
  const corpo = [
    "Olá! Quero montar o Connect sob medida para o meu escritório.",
    "",
    setores.length === 1 ? "O setor que me interessa:" : "Os setores que me interessam:",
    ...setores.map((s) => `- ${s}`),
    "",
  ].join("\r\n");
  return `mailto:${contato}?${assunto}&body=${encodeURIComponent(corpo)}`;
}

/** Os nomes dos setores escolhidos, na ordem das etiquetas (não na ordem dos cliques). */
export function rotulosEscolhidos(setores: readonly { code: string; rotulo: string }[], escolhidos: ReadonlySet<string>): string[] {
  return setores.filter((s) => escolhidos.has(s.code)).map((s) => s.rotulo);
}

/** Liga ou desliga um setor da escolha, sem mexer no conjunto de antes. */
export function alternarSetor(escolhidos: ReadonlySet<string>, code: string): ReadonlySet<string> {
  const novo = new Set(escolhidos);
  if (!novo.delete(code)) novo.add(code);
  return novo;
}

/** A frase embaixo das etiquetas, que também avisa o leitor de tela. Nada escolhido, nada. */
export function resumoDaEscolha(quantos: number): string {
  if (quantos <= 0) return "";
  return quantos === 1 ? "1 setor escolhido, que vai junto no e-mail." : `${quantos} setores escolhidos, que vão junto no e-mail.`;
}
