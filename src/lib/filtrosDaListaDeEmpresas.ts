// Filtros por coluna da listagem de empresas (funil de Regime e de Localização).
//
// A listagem é paginada, então o funil filtra no servidor: as opções e as
// contagens saem de um `groupBy` na base inteira, e a escolha volta pela URL
// como parâmetro repetido (`?regime=A&regime=B`). Ver `FiltroDaColunaNaUrl`.

import { resumirRegime } from "@/lib/taxRegime";

export type OpcaoDoFunil = { valor: string; rotulo: string; n: number };

const ORDEM = (a: OpcaoDoFunil, b: OpcaoDoFunil) =>
  a.valor === "" ? 1 : b.valor === "" ? -1 : a.rotulo.localeCompare(b.rotulo, "pt-BR", { sensitivity: "base" });

// ─── Regime ──────────────────────────────────────────────────────────────────
//
// A coluna mostra o regime **resumido** ("Simples Nacional"), e o funil oferece
// o mesmo resumo: o texto bruto do Acessórias tem dezenas de variações por
// regime (com/sem pró-labore, com/sem funcionários...). Escolher o resumo filtra
// por todas as variações brutas que resumem nele.

/** O valor do funil é o resumo; empresa sem regime vira "" e aparece como "(vazio)". */
export function valorDoRegime(bruto: string | null): string {
  return resumirRegime(bruto) ?? "";
}

export function opcoesDeRegime(grupos: { taxRegime: string | null; n: number }[]): OpcaoDoFunil[] {
  const soma = new Map<string, number>();
  for (const g of grupos) {
    const v = valorDoRegime(g.taxRegime);
    soma.set(v, (soma.get(v) ?? 0) + g.n);
  }
  return [...soma.entries()].map(([valor, n]) => ({ valor, rotulo: valor || "(vazio)", n })).sort(ORDEM);
}

/**
 * O `where` do regime escolhido: os textos brutos que resumem num dos valores
 * escolhidos. `brutos` são todos os regimes que existem na base filtrada.
 */
export function ondeDoRegime(escolhidos: string[], brutos: (string | null)[]) {
  if (escolhidos.length === 0) return {};
  const aceitos = new Set(escolhidos);
  const textos = brutos.filter((b): b is string => b !== null && aceitos.has(valorDoRegime(b)));
  const semRegime = aceitos.has("");
  const alternativas = [
    ...(textos.length ? [{ taxRegime: { in: textos } }] : []),
    ...(semRegime ? [{ taxRegime: null }, { taxRegime: "" }] : []),
  ];
  // Nenhum bruto casou (valor velho na URL): o filtro não pode virar "tudo".
  return alternativas.length ? { OR: alternativas } : { id: { in: [] as string[] } };
}

// ─── Localização ─────────────────────────────────────────────────────────────
//
// O valor carrega cidade e UF separados por "|" (a coluna mostra "CIDADE/UF"),
// para o `where` casar os dois campos sem adivinhar onde um termina.

export function valorDoLocal(city: string | null, stateCode: string | null): string {
  if (!city && !stateCode) return "";
  return `${city ?? ""}|${stateCode ?? ""}`;
}

function rotuloDoLocal(valor: string): string {
  if (!valor) return "(vazio)";
  const [city, uf] = valor.split("|");
  return city && uf ? `${city}/${uf}` : city || uf;
}

export function opcoesDeLocal(grupos: { city: string | null; stateCode: string | null; n: number }[]): OpcaoDoFunil[] {
  const soma = new Map<string, number>();
  for (const g of grupos) {
    const v = valorDoLocal(g.city, g.stateCode);
    soma.set(v, (soma.get(v) ?? 0) + g.n);
  }
  return [...soma.entries()].map(([valor, n]) => ({ valor, rotulo: rotuloDoLocal(valor), n })).sort(ORDEM);
}

export function ondeDoLocal(escolhidos: string[]) {
  if (escolhidos.length === 0) return {};
  return {
    OR: escolhidos.map((v) => {
      if (!v) return { city: null, stateCode: null };
      const [city, uf] = v.split("|");
      return { city: city || null, stateCode: uf || null };
    }),
  };
}
