/** Lista fechada: a permissão contábil não dá acesso à escrita de ICMS/IPI. */
export const DECISOES_DO_CONTABIL = ["parametro_contribuicoes", "ajuste_contribuicoes", "decisao_registro_contribuicoes"] as const;
export function decisaoContabilPermitida(tipo: string) {
  return (DECISOES_DO_CONTABIL as readonly string[]).includes(tipo);
}
export function recursoDeContribuicoes(recurso: { obrigacao?: string; acao?: string }) {
  return recurso.obrigacao !== undefined ? recurso.obrigacao === "contribuicoes" : recurso.acao === "sped_contribuicoes";
}
