// As entidades do XML no texto do SPED local (06/11/2026). Achado no teste com o
// motor: "FORNECEDOR &amp; CIA" ia literal para a descrição do item, porque a
// importação lê o XML sem decodificar (`processEntities: false`), e o
// `fast-xml-parser`, mesmo com ela ligada, não decodifica as referências
// numéricas (`&#233;`).
//
// Uma passada só: "&amp;amp;" vira "&amp;", nunca "&". Por isso dá para aplicar
// também na leitura do que já foi gravado — texto já decodificado não muda.
// O DOCTYPE e as entidades externas continuam recusados na importação.

const NOMEADAS: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodificarEntidades(texto: string): string {
  if (!texto.includes("&")) return texto;
  return texto.replace(/&(?:(amp|lt|gt|quot|apos)|#(\d{1,7})|#x([0-9a-fA-F]{1,6}));/g, (todo, nome?: string, dec?: string, hex?: string) => {
    if (nome) return NOMEADAS[nome];
    const ponto = dec !== undefined ? Number(dec) : parseInt(hex!, 16);
    const valido = ponto > 0 && ponto <= 0x10ffff && !(ponto >= 0xd800 && ponto <= 0xdfff);
    return valido ? String.fromCodePoint(ponto) : todo;
  });
}
