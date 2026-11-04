// As renovações da empresa (04/11/2026, escolha A da página de opções da
// Cobrança e do Societário): licenças, certidões e o certificado digital numa
// faixa só, no topo da visão societária, do que vence primeiro ao último.
// Puro e testado; a leitura do banco está em ./renovacoesServidor.ts.

export type TipoDaRenovacao = "licenca" | "certidao" | "certificado";

export type Renovacao = {
  chave: string;
  tipo: TipoDaRenovacao;
  rotulo: string;
  /** Dias até vencer (negativo = vencido); nulo sem validade. */
  dias: number | null;
  /** Certidão positiva ainda não vista: pede alguém antes de qualquer vencimento. */
  positiva?: boolean;
  href: string;
  acao: string;
};

export type TomDaRenovacao = "perigo" | "atencao" | "sucesso" | "neutro";

/** Quantos dias antes o documento entra em "a renovar" (o mesmo aviso das licenças). */
export const AVISO_DA_RENOVACAO = 60;

/** O selo e a frase de cada documento. */
export function situacaoDaRenovacao(r: Renovacao): { texto: string; tom: TomDaRenovacao } {
  if (r.positiva) return { texto: "positiva", tom: "perigo" };
  if (r.dias === null) return { texto: "sem validade", tom: "neutro" };
  if (r.dias < 0) return { texto: `venceu há ${-r.dias} ${r.dias === -1 ? "dia" : "dias"}`, tom: "perigo" };
  if (r.dias === 0) return { texto: "vence hoje", tom: "perigo" };
  if (r.dias <= AVISO_DA_RENOVACAO) return { texto: `vence em ${r.dias} ${r.dias === 1 ? "dia" : "dias"}`, tom: "atencao" };
  return { texto: `válida por ${r.dias} dias`, tom: "sucesso" };
}

/** A positiva primeiro; depois do que vence primeiro ao último; sem validade por último. */
export function ordenarRenovacoes(itens: Renovacao[]): Renovacao[] {
  const chave = (r: Renovacao) => (r.positiva ? -100_000 : r.dias === null ? 100_000 : r.dias);
  return [...itens].sort((a, b) => chave(a) - chave(b) || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}
