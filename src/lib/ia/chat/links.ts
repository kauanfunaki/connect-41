// Os links da resposta da Ceci, conferidos no servidor antes de gravar
// (13/10/2026). Puro, testado em `links.test.ts`.
//
// A mesma ideia das citações com foto (`citacoes.ts`): **só vale o que a
// execução viu**. As ferramentas devolvem o link pronto num campo `link`
// ("[Abrir as férias](/ferias)", `src/lib/ia/legivel.ts`); link da resposta com
// caminho que nenhuma ferramenta devolveu nesse campo vira só o rótulo — um id
// inventado levaria a uma ficha que não existe. Só o campo `link` (e o
// `caminho` da lista de telas) conta: um link escrito dentro do título de uma
// pendência, por um cliente, não vale. A rota exata de uma tela do Connect
// ("/pagar") passa sempre: é o menu.
//
// E o id que escapou para o texto: se a execução viu o link daquele item
// ("[Confirmar o aluguel](/pendencias/<id>)"), o id vira o link; se não, fica
// para a tela esconder (`ocultarIds`, em `markdown.ts`).

import { ehCaminhoInterno, ehRotaDeTela } from "./telas";

/** `[rótulo](endereço)` que não é citação (`@[Nome](tipo:id)`). */
const LINK_MD = /(?<!@)\[([^\]\n]+)\]\(\s*<?((?:[^()\s>]|\([^()\s]*\))+)>?\s*\)/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** O campo `link` no JSON que a ferramenta devolveu: `"link":"[rótulo](/caminho)"`. */
const CAMPO_LINK = /"link"\s*:\s*"(\[(?:[^"\\\]]|\\.)*\]\(([^()\s"\\]+)\))"/g;
/** O campo `caminho` da lista de telas da Ajuda: `"caminho":"/pagar"`. */
const CAMPO_CAMINHO = /"caminho"\s*:\s*"(\/[^"\s\\]+)"/g;

export type LinksDasFerramentas = {
  /** Os caminhos que alguma ferramenta devolveu. */
  caminhos: ReadonlySet<string>;
  /** O link de cada item, pelo id que está no caminho: id → "[Título](/pendencias/id)". */
  porId: ReadonlyMap<string, { link: string; href: string }>;
};

/** Os links que as ferramentas devolveram nesta execução (o texto de cada resultado, como foi ao modelo). */
export function linksDasFerramentas(resultados: readonly string[]): LinksDasFerramentas {
  const caminhos = new Set<string>();
  const porId = new Map<string, { link: string; href: string }>();
  for (const r of resultados) {
    for (const m of r.matchAll(CAMPO_LINK)) {
      const href = m[2]!;
      if (!ehCaminhoInterno(href)) continue;
      caminhos.add(href);
      let link = m[1]!;
      try {
        link = JSON.parse(`"${link}"`) as string;
      } catch {
        /* o texto como veio */
      }
      const id = UUID.exec(href)?.[0]?.toLowerCase();
      if (id && !porId.has(id)) porId.set(id, { link, href });
    }
    for (const m of r.matchAll(CAMPO_CAMINHO)) if (ehCaminhoInterno(m[1]!)) caminhos.add(m[1]!);
  }
  return { caminhos, porId };
}

/**
 * Troca por só o rótulo todo link que não pode ficar: endereço de fora, ou
 * caminho interno que nenhuma ferramenta devolveu e não é a rota de uma tela.
 */
export function filtrarLinks(texto: string, vistos: Pick<LinksDasFerramentas, "caminhos">): string {
  return texto.replace(LINK_MD, (inteiro, rotulo: string, href: string) => {
    if (!ehCaminhoInterno(href)) return rotulo;
    return ehRotaDeTela(href) || vistos.caminhos.has(href) ? inteiro : rotulo;
  });
}

/** O id solto, com o "(id: …)" ou "id …" em volta — o que sai junto quando ele é trocado. */
const ID_SOLTO = /(\s*)\(?\s*(?:\bid\s*[:#]?\s*)?#?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?![0-9a-z])(?:\s*\))?/gi;

/**
 * O id solto no texto (fora de link e de citação) vira o link do item, quando
 * a execução viu o link dele. Se a linha já tem esse link, o id só sai.
 */
export function trocarIdsPorLinks(texto: string, vistos: Pick<LinksDasFerramentas, "porId">): string {
  if (vistos.porId.size === 0 || !UUID.test(texto)) return texto;
  return texto
    .split("\n")
    .map((linha) =>
      // Os trechos protegidos (link e citação) ficam de fora da troca.
      linha
        .split(/(@?\[[^\]\n]*\]\([^)\n]*\))/g)
        .map((p, i) => {
          if (i % 2 === 1) return p;
          return p.replace(ID_SOLTO, (inteiro, espaco: string, id: string) => {
            const achado = vistos.porId.get(id.toLowerCase());
            if (!achado) return inteiro;
            return linha.includes(`](${achado.href})`) ? "" : `${espaco || " "}${achado.link}`;
          });
        })
        .join("")
    )
    .join("\n");
}
