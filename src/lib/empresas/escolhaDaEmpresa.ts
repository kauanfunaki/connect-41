// Qual empresa uma tela abre (13/10/2026) — a regra, sem banco.
//
// Pedido do Kauan: "nas telas que puxariam muitos dados, uma seleção de empresa
// para não estressar o app; o padrão seria a última empresa aberta pelo
// usuário". Duas famílias de tela usam esta regra:
//
// - **uma empresa por vez** (Lançamentos, Conciliação, Fornecedores e sacados,
//   DRE, DRE econômica, Análises, Orçamento, Emitir NFS-e): até aqui abriam na
//   primeira empresa em ordem alfabética quando a URL não dizia qual — e quem
//   lançava sem olhar o seletor gravava na empresa errada;
// - **pesadas** (Contas a pagar e a receber, Fluxo de caixa, Cobrança,
//   Documentos fiscais): abriam em todas as empresas, lendo o acervo inteiro.
//
// A ordem: a empresa da URL; sem ela, a última que a pessoa abriu; sem esta,
// a única da lista; senão, a tela pede para escolher. **Nunca a primeira da
// lista** — escolher por alguém é o que gravava na empresa errada.
//
// A empresa da URL que não está na lista da tela (outro escritório, excluída,
// inativa, sem conta do Omie…) também pede para escolher, em vez de cair na
// última: link velho que abre outra empresa em silêncio é o mesmo erro.

/** O valor de `?empresa=` que pede todas as empresas, nas telas que oferecem. */
export const TODAS_AS_EMPRESAS = "todas";

export type EscolhaDaEmpresa =
  | {
      tipo: "empresa";
      companyId: string;
      /** De onde veio: a URL, a última aberta ou a única da lista. */
      origem: "url" | "ultima" | "unica";
    }
  | { tipo: "todas" }
  | {
      tipo: "escolher";
      /** `invalida`: a URL pediu uma empresa que não está na lista da tela. */
      motivo: "nenhuma" | "invalida";
    };

export type EntradaDaEscolha = {
  /** O `?empresa=` da URL, como veio. */
  pedida: string | null | undefined;
  /** A última empresa aberta pela pessoa, já conferida no tenant (ou `null`). */
  ultima: string | null;
  /** As empresas que a tela oferece — o que ela mostra no seletor. */
  disponiveis: readonly string[];
  /** A tela oferece "Todas as empresas" (`?empresa=todas`). */
  permitirTodas?: boolean;
};

export function resolverEmpresaDaTela({ pedida, ultima, disponiveis, permitirTodas = false }: EntradaDaEscolha): EscolhaDaEmpresa {
  const naLista = new Set(disponiveis);
  const pedidaLimpa = pedida?.trim() ?? "";

  if (pedidaLimpa !== "") {
    if (pedidaLimpa === TODAS_AS_EMPRESAS) return permitirTodas ? { tipo: "todas" } : { tipo: "escolher", motivo: "invalida" };
    return naLista.has(pedidaLimpa) ? { tipo: "empresa", companyId: pedidaLimpa, origem: "url" } : { tipo: "escolher", motivo: "invalida" };
  }

  if (ultima && naLista.has(ultima)) return { tipo: "empresa", companyId: ultima, origem: "ultima" };
  // Uma só não é escolher por ninguém: não há outra em que errar.
  if (naLista.size === 1) return { tipo: "empresa", companyId: [...naLista][0]!, origem: "unica" };
  return { tipo: "escolher", motivo: "nenhuma" };
}

/** O id da empresa escolhida, ou `null` (todas ou nenhuma ainda). */
export function idDaEscolha(e: EscolhaDaEmpresa): string | null {
  return e.tipo === "empresa" ? e.companyId : null;
}

/** O valor do seletor: o id, "todas" ou `null` (nenhuma ainda). */
export function valorDoSeletor(e: EscolhaDaEmpresa): string | null {
  if (e.tipo === "empresa") return e.companyId;
  if (e.tipo === "todas") return TODAS_AS_EMPRESAS;
  return null;
}

/**
 * O `?empresa=` que um link da mesma tela leva para não perder a escolha —
 * trocar de aba, de recorte, de mês. "Todas" vai explícito: sem o parâmetro, a
 * tela voltaria para a última empresa.
 */
export function empresaNaUrl(e: EscolhaDaEmpresa): string | undefined {
  return valorDoSeletor(e) ?? undefined;
}

/**
 * Como "Todas as empresas" vai para a URL:
 * - `explicita` — `?empresa=todas`, nas telas pesadas, que sem parâmetro abrem
 *   na última empresa;
 * - `padrao` — sem o parâmetro, nas telas leves, cujo padrão já é todas.
 */
export type ModoDeTodas = "explicita" | "padrao";

/**
 * O endereço da tela com a empresa escolhida no seletor. `empresa` vazia é a
 * escolha "Todas as empresas". Os parâmetros de `manter` (aba, mês, visão…)
 * seguem; os outros saem — filtro de uma empresa (centro de custo, conta
 * bancária, página) não serve para a próxima.
 */
export function hrefDaEmpresa(
  acao: string,
  empresa: string,
  opcoes: { manter?: Record<string, string | undefined>; todas?: ModoDeTodas } = {}
): string {
  const q = new URLSearchParams();
  for (const [chave, valor] of Object.entries(opcoes.manter ?? {})) if (valor && chave !== "empresa") q.set(chave, valor);
  if (empresa) q.set("empresa", empresa);
  else if (opcoes.todas === "explicita") q.set("empresa", TODAS_AS_EMPRESAS);
  const s = q.toString();
  return s ? `${acao}?${s}` : acao;
}
