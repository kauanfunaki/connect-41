import type { Lancamento } from "./lancamentos";
export const AREAS_CONTABEIS = [
  ["visao", "Visão geral"], ["entradas", "Notas de entrada"], ["pendencias", "Pendências"],
  ["regras", "Regras do de-para"], ["lancamentos", "Lançamentos"], ["configuracao", "Plano e contas"],
  ["pagamentos", "Lançados e pendências"], ["documentos-lidos", "Documentos lidos"], ["enviar-pagamentos", "Enviar documentos"], ["regras-pagamentos", "Regras dos pagamentos"],
  ["saidas", "Saídas"], ["lote", "Lote do ano"],
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
// De-para e lançamentos como um trabalho em etapas, na ordem do mês
// (03/11/2026), como o SPED ICMS/IPI: ver o que entrou, tratar o que ficou
// sem regra, criar a regra e baixar a planilha da Domínio. Cada etapa reúne
// as seções que já existiam; a primeira é a que a etapa abre. Saídas e o
// lote do ano vieram do painel do motor (passos 6 e 7, 03/11/2026).
export const ETAPAS_DO_CONTABIL = [
  { chave: "entradas", rotulo: "Notas de entrada", resumo: "O que entrou no mês e o que vira lançamento.", secoes: [["entradas", "Notas de entrada"]] },
  { chave: "pendencias", rotulo: "Pendências", resumo: "As notas que ficaram fora do de-para.", secoes: [["pendencias", "Pendências"]] },
  { chave: "depara", rotulo: "De-para", resumo: "Onde a pendência vira regra de conta.", secoes: [["regras", "Regras"], ["configuracao", "Plano e contas"]] },
  { chave: "lancamentos", rotulo: "Lançamentos", resumo: "A planilha no modelo da Domínio.", secoes: [["lancamentos", "Lançamentos"], ["visao", "Resumo"]] },
  // O passo 5 do motor (03/11/2026): RPA, recibos, contratos e as faturas do
  // BPO, lidos dos documentos enviados aqui. As contas-modelo ficam em Plano e contas.
  { chave: "pagamentos", rotulo: "Pagamentos sem nota", resumo: "RPA, recibos, contratos e faturas do BPO.", secoes: [["pagamentos", "Lançados e pendências"], ["documentos-lidos", "Documentos lidos"], ["enviar-pagamentos", "Enviar documentos"], ["regras-pagamentos", "Regras"]] },
  { chave: "saidas", rotulo: "Saídas", resumo: "O faturamento do mês, um lançamento por dia.", secoes: [["saidas", "Saídas"]] },
  { chave: "lote", rotulo: "Lote do ano", resumo: "Os doze meses num ZIP, com o resumo do que saiu.", secoes: [["lote", "Lote do ano"]] },
] as const;
export type EtapaDoContabil = (typeof ETAPAS_DO_CONTABIL)[number];
export const SECOES_DO_CONTABIL: readonly string[] = ETAPAS_DO_CONTABIL.flatMap((e) => e.secoes.map(([id]) => id));
export function etapaDaSecao(secao: string): EtapaDoContabil {
  return ETAPAS_DO_CONTABIL.find((e) => e.secoes.some(([id]) => id === secao)) ?? ETAPAS_DO_CONTABIL[0];
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
