import type { ArquivoTeste, Cenario, ContextoFiscal } from "./cenario";

export function arquivoNoContexto(arquivo: ArquivoTeste, contexto: ContextoFiscal) {
  return arquivo.contexto.empresaId === contexto.empresaId && arquivo.contexto.competencia === contexto.competencia
    && (!contexto.estabelecimentoId || !arquivo.contexto.estabelecimentoId || arquivo.contexto.estabelecimentoId === contexto.estabelecimentoId);
}

/** Só a última versão que cobre cada obrigação e filial define o fluxo atual. */
export function ultimasVersoesDoContexto(cenario: Cenario): ArquivoTeste[] {
  const versoes: ArquivoTeste[] = [];
  const cobertos = new Set<string>();
  const empresa = cenario.empresas.find((e) => e.id === cenario.contexto.empresaId);
  const filiais = cenario.contexto.estabelecimentoId ? [cenario.contexto.estabelecimentoId] : empresa?.estabelecimentos.map((e) => e.id) ?? [];
  const ordenados = [...cenario.arquivos].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm) || b.versao - a.versao);
  for (const arquivo of ordenados) {
    if (arquivo.dominio || !arquivoNoContexto(arquivo, cenario.contexto)) continue;
    const estabelecimentos = arquivo.contexto.estabelecimentoId ? [arquivo.contexto.estabelecimentoId] : filiais;
    const chaves = estabelecimentos.map((id) => `${arquivo.tipo}:${id}`);
    if (chaves.every((chave) => cobertos.has(chave))) continue;
    versoes.push(arquivo);
    chaves.forEach((chave) => cobertos.add(chave));
  }
  return versoes;
}
