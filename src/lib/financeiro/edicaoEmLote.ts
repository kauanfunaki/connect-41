// Alterar as contas marcadas de uma vez (lote D da fila do BPO, 20/10 — o
// "Alterar em lote" do Omie). Funções puras; a leitura e a gravação moram em
// `edicaoEmLoteServidor.ts`.
//
// Muda o que é data ou classificação — vencimento, previsão, competência,
// categoria, centro de custo, projeto e a conta corrente prevista — com as travas da
// janela "Editar" de uma conta
// (`travasDaEdicao`): o que ela não deixa mudar numa conta, o lote também não.
// A conta com trava em algum campo escolhido fica de fora inteira, com o
// porquê: mudar só parte do pedido deixaria a conta num meio-termo que
// ninguém escolheu.
//
// Valor e fornecedor ficam na janela de uma conta: mexem na aprovação, e o
// mesmo valor para contas diferentes não faz sentido.

import type { CampoEditavel, Travas } from "./edicao";
import { MAXIMO_DO_LOTE, type ForaDoLote } from "./baixa/lote";

export const CAMPOS_DO_LOTE = ["vencimento", "previsao", "competencia", "categoria", "centro", "projeto", "conta"] as const satisfies readonly CampoEditavel[];

export type CampoDoLote = (typeof CAMPOS_DO_LOTE)[number];

export function campoDoLote(v: unknown): v is CampoDoLote {
  return typeof v === "string" && (CAMPOS_DO_LOTE as readonly string[]).includes(v);
}

/** Os ids marcados, sem repetição, dentro do teto do lote. */
export function idsMarcados(valores: unknown[]): string[] | { erro: string } {
  const ids = [...new Set(valores.map((v) => String(v ?? "")).filter(Boolean))];
  if (ids.length === 0) return { erro: "Marque ao menos uma conta." };
  if (ids.length > MAXIMO_DO_LOTE) return { erro: `No máximo ${MAXIMO_DO_LOTE} contas por vez.` };
  return ids;
}

export type ContaDaAlteracao = {
  id: string;
  kind: "PAGAR" | "RECEBER";
  empresaId: string;
  contraparteNome: string;
  /** Cancelada, renegociada ou baixada por perda: o porquê de nada mudar. */
  encerrada: string | null;
  travas: Travas;
};

/**
 * O que a pessoa escolheu mudar. Centro, projeto e conta corrente vão com a
 * empresa do escolhido; `null` neles e na categoria é "tirar".
 */
export type EscolhaDaAlteracao = {
  campos: CampoDoLote[];
  categoriaId?: string | null;
  /**
   * As empresas em que a categoria escolhida vale. Só o servidor passa: a
   * janela oferece apenas as categorias que valem em todas as empresas marcadas.
   */
  categoriaValeEm?: ReadonlySet<string>;
  centroDaEmpresa?: string | null;
  projetoDaEmpresa?: string | null;
  contaDaEmpresa?: string | null;
};

const SEM_CATEGORIA_NO_PAGAR = "Conta a pagar precisa de categoria — despesa sem classificação não fecha o DRE.";

/** Por que esta conta fica de fora da alteração, ou `null` quando entra. */
export function porQueFica(conta: ContaDaAlteracao, escolha: EscolhaDaAlteracao): string | null {
  const { campos } = escolha;
  // O centro é classificação de gestão e muda até em conta encerrada: a
  // renegociada e a perdida continuam na DRE. Era assim na troca de centro em
  // lote que esta janela substituiu.
  const soCentro = campos.length > 0 && campos.every((c) => c === "centro");
  if (conta.encerrada && !soCentro) return conta.encerrada;
  for (const c of campos) {
    const trava = conta.travas[c];
    if (trava) return trava;
  }
  if (campos.includes("categoria")) {
    if (!escolha.categoriaId && conta.kind === "PAGAR") return SEM_CATEGORIA_NO_PAGAR;
    if (escolha.categoriaId && escolha.categoriaValeEm && !escolha.categoriaValeEm.has(conta.empresaId)) {
      return "A categoria escolhida não está no plano de contas desta empresa.";
    }
  }
  if (campos.includes("centro") && escolha.centroDaEmpresa && escolha.centroDaEmpresa !== conta.empresaId) {
    return "O centro de custo escolhido é de outra empresa.";
  }
  if (campos.includes("projeto") && escolha.projetoDaEmpresa && escolha.projetoDaEmpresa !== conta.empresaId) {
    return "O projeto escolhido é de outra empresa.";
  }
  if (campos.includes("conta") && escolha.contaDaEmpresa && escolha.contaDaEmpresa !== conta.empresaId) {
    return "A conta corrente escolhida é de outra empresa.";
  }
  return null;
}

/** O que muda e o que fica de fora, com o porquê de cada uma. A janela e a gravação separam igual. */
export function separarAlteracao<C extends ContaDaAlteracao>(contas: C[], escolha: EscolhaDaAlteracao): { entram: C[]; ficam: ForaDoLote[] } {
  const entram: C[] = [];
  const ficam: ForaDoLote[] = [];
  for (const c of contas) {
    const motivo = porQueFica(c, escolha);
    if (motivo) ficam.push({ id: c.id, contraparteNome: c.contraparteNome, motivo });
    else entram.push(c);
  }
  return { entram, ficam };
}

/**
 * Quem fica de fora, agrupado pelo motivo, do mais comum ao menos: a seleção
 * vai a 200 contas, e "paga" repetido 40 vezes não se lê.
 */
export function motivosAgrupados(ficam: ForaDoLote[]): { motivo: string; nomes: string[] }[] {
  const grupos = new Map<string, string[]>();
  for (const f of ficam) grupos.set(f.motivo, [...(grupos.get(f.motivo) ?? []), f.contraparteNome]);
  return [...grupos].map(([motivo, nomes]) => ({ motivo, nomes })).sort((a, b) => b.nomes.length - a.nomes.length);
}

// ─── Categorias ─────────────────────────────────────────────────────────────

/** Uma categoria do plano com o que decide onde ela vale — ver `ondeDaEmpresa` em `planoDeContas.ts`. */
export type CategoriaDoPlano = { id: string; nome: string; empresaId: string | null; ocultaEm: string[] };

/** Vale na empresa: a do plano do escritório, se a empresa não a escondeu; a da própria empresa. */
export function valeNaEmpresa(c: CategoriaDoPlano, empresaId: string): boolean {
  return c.empresaId === null ? !c.ocultaEm.includes(empresaId) : c.empresaId === empresaId;
}

/** As categorias que valem em todas as empresas das contas marcadas — as que a janela oferece. */
export function categoriasEmComum<C extends CategoriaDoPlano>(categorias: C[], empresas: string[]): C[] {
  return categorias.filter((c) => empresas.every((e) => valeNaEmpresa(c, e)));
}
