// XML mínimo para os eventos do eSocial (12/11/2026, DP 2 fase 3a).
//
// O eSocial confere a ORDEM das tags contra o XSD, então cada elemento é uma
// lista na ordem do leiaute. Tag com valor vazio ou nulo não sai (o XSD
// recusa tag vazia em campo opcional). Sem declaração <?xml?> por evento: ela
// vai no lote.
//
// Puro, sem banco.

export type No = { tag: string; atributos?: Record<string, string>; filhos: (No | null)[] } | { tag: string; texto: string | number | null | undefined };

export function el(tag: string, conteudo: (No | null)[] | string | number | null | undefined, atributos?: Record<string, string>): No | null {
  if (Array.isArray(conteudo)) {
    const filhos = conteudo.filter((f): f is No => f !== null);
    if (filhos.length === 0) return null;
    return { tag, atributos, filhos };
  }
  if (conteudo === null || conteudo === undefined || conteudo === "") return null;
  return { tag, texto: conteudo };
}

export function escapar(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function serializar(no: No | null): string {
  if (!no) return "";
  if ("texto" in no) return `<${no.tag}>${escapar(String(no.texto))}</${no.tag}>`;
  const attrs = no.atributos ? Object.entries(no.atributos).map(([k, v]) => ` ${k}="${escapar(v)}"`).join("") : "";
  return `<${no.tag}${attrs}>${no.filhos.map((f) => serializar(f)).join("")}</${no.tag}>`;
}

/** Valor em reais no formato do eSocial: ponto decimal, duas casas. */
export function decimal(v: number, casas = 2): string {
  return (Math.round(v * 10 ** casas) / 10 ** casas).toFixed(casas);
}
