import type { Lancamento } from "./lancamentos";
export const AREAS_CONTABEIS = [
  ["visao", "Visão geral"], ["entradas", "Notas de entrada"], ["pendencias", "Pendências"],
  ["regras", "Regras do de-para"], ["lancamentos", "Lançamentos"], ["configuracao", "Plano e contas"],
] as const;
export const AREAS_CONTRIBUICOES = [
  ["visao", "Visão geral"], ["fechamento", "Fechamento e conferência"], ["apuracao", "Apuração e créditos"],
  ["parametros", "Parâmetros e ajustes"], ["gerar", "Gerar e acompanhar"], ["arquivos", "Arquivos e histórico"],
] as const;
export function grupoContabil(params: Record<string, string | undefined>) {
  if (params.aba === "contribuicoes") return "contribuicoes";
  if (params.grupo === "depara" || params.grupo === "lancamentos") return params.grupo;
  const secao = params.secao ?? params.ver;
  return ["lancamentos", "entradas", "fora", "visao"].includes(secao ?? "") ? "lancamentos" : "depara";
}
export function secoesDoGrupo(grupo: string): readonly (readonly [string, string])[] {
  if (grupo === "contribuicoes") return [
    ["gerar", "Gerar e acompanhar"], ["arquivos", "Arquivos e histórico"],
    ["fechamento", "Fechamento e conferência"], ["apuracao", "Apuração e créditos"],
    ["parametros", "Parâmetros e ajustes"], ["visao", "Resumo"],
  ];
  if (grupo === "lancamentos") return [["lancamentos", "Lançamentos"], ["entradas", "Notas de entrada"], ["visao", "Resumo"]];
  return [["regras", "Regras"], ["pendencias", "Pendências"], ["configuracao", "Plano e contas"]];
}
export function areaContabil(params: Record<string, string | undefined>) {
  const areas = params.aba === "contribuicoes" ? AREAS_CONTRIBUICOES : AREAS_CONTABEIS;
  const pedida = params.secao ?? (params.ver === "fora" ? "entradas" : params.ver);
  return areas.find(([id]) => id === pedida)?.[0] ?? "visao";
}
export type FiltrosContabeis = { q?: string; tipo?: string; cfop?: string; situacao?: string; origem?: string; imobilizado?: string };
export function filtrarLancamentos<T extends Lancamento>(linhas: T[], f: FiltrosContabeis): T[] {
  const q = (f.q ?? "").toLocaleLowerCase("pt-BR").trim();
  return linhas.filter((l) => (!q || [l.nomeFornecedor, l.cnpjFornecedor, l.numero, l.historico, l.debito, l.credito].some((s) => s.toLocaleLowerCase("pt-BR").includes(q))) &&
    (!f.tipo || l.tipo === f.tipo) && (!f.cfop || l.cfop === f.cfop) &&
    (!f.origem || l.origemDoCredito === f.origem) && (f.imobilizado !== "1" || l.imobilizado));
}
