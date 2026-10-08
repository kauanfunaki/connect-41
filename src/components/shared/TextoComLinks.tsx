// Endereços http(s) no meio de um texto livre. Para no espaço e não leva a
// pontuação final da frase (ponto, vírgula, parêntese que fecha).
const URL = /https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g;

export type PedacoDoTexto = { texto: string } | { url: string };

/** O texto em pedaços: o que é texto e o que é endereço, na ordem. */
export function separarLinks(texto: string): PedacoDoTexto[] {
  const pedacos: PedacoDoTexto[] = [];
  let ultimo = 0;
  for (const m of texto.matchAll(URL)) {
    const inicio = m.index ?? 0;
    if (inicio > ultimo) pedacos.push({ texto: texto.slice(ultimo, inicio) });
    pedacos.push({ url: m[0] });
    ultimo = inicio + m[0].length;
  }
  if (ultimo < texto.length) pedacos.push({ texto: texto.slice(ultimo) });
  return pedacos;
}

/**
 * Texto livre com os endereços clicáveis (07/10/2026).
 *
 * As observações do processo trazem da importação do Trello a URL do cartão
 * ("Importado do Trello em … — https://trello.com/c/…"), e a nota manda abrir o
 * cartão para baixar os anexos — mas a URL saía como texto puro. O
 * `SimpleMarkdown` não faz isto. Serve também para a descrição de uma
 * transferência e para comentários.
 *
 * Abre em outra aba, sem passar o `opener`. Quebras de linha são preservadas
 * por quem envolve (`whitespace-pre-line` ou `pre-wrap`).
 */
export function TextoComLinks({ texto, className = "" }: { texto: string; className?: string }) {
  return (
    <span className={className}>
      {separarLinks(texto).map((p, i) =>
        "url" in p ? (
          <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="text-brand underline-offset-2 hover:underline break-all">
            {p.url}
          </a>
        ) : (
          p.texto
        )
      )}
    </span>
  );
}
