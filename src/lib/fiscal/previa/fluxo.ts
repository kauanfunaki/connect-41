import { documentosDoContexto, mesmoEscopo, precisaRevisar, totaisDoContexto, type ArquivoTeste, type Cenario, type ContextoFiscal } from "./cenario";

export type EtapaFiscal = {
  titulo: string;
  resumo: string;
  orientacao: string;
  modulo: string;
  aba: string;
  acao: string;
  completa: boolean;
};

// O histórico permanece acessível, mas só a última versão de cada obrigação
// e estabelecimento deve definir a próxima ação da competência.
export function arquivoNoContexto(arquivo: ArquivoTeste, contexto: ContextoFiscal) {
  return arquivo.contexto.empresaId === contexto.empresaId && arquivo.contexto.competencia === contexto.competencia
    && (!contexto.estabelecimentoId || !arquivo.contexto.estabelecimentoId || arquivo.contexto.estabelecimentoId === contexto.estabelecimentoId);
}
export function ultimasVersoesDoContexto(cenario: Cenario): ArquivoTeste[] {
  const versoes: ArquivoTeste[] = [];
  const cobertos = new Set<string>();
  const empresa = cenario.empresas.find((e) => e.id === cenario.contexto.empresaId);
  const ordenados = [...cenario.arquivos].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm) || b.versao - a.versao);
  for (const arquivo of ordenados) {
    if (arquivo.dominio || !arquivoNoContexto(arquivo, cenario.contexto)) continue;
    const estabelecimentos = arquivo.contexto.estabelecimentoId ? [arquivo.contexto.estabelecimentoId] : empresa?.estabelecimentos.map((e) => e.id) ?? [];
    const chaves = estabelecimentos.map((id) => `${arquivo.tipo}:${id}`);
    if (chaves.every((chave) => cobertos.has(chave))) continue;
    versoes.push(arquivo);
    chaves.forEach((chave) => cobertos.add(chave));
  }
  return versoes;
}

export function fluxoDaCompetencia(cenario: Cenario, modulos: readonly string[]): EtapaFiscal[] {
  const docs = documentosDoContexto(cenario);
  const totais = totaisDoContexto(cenario);
  const periodos = cenario.periodos.filter((p) => mesmoEscopo(p, cenario.contexto));
  const versoes = ultimasVersoesDoContexto(cenario);
  const recebidos = docs.length > 0 && totais.rejeitados === 0;
  const classificados = recebidos && totais.pendentes === 0;
  const fechado = classificados && periodos.length > 0 && periodos.every((p) => p.apurado && p.fechado);
  const gerado = fechado && versoes.length > 0 && versoes.every((a) => !precisaRevisar(cenario, a));
  const validado = gerado && versoes.every((a) => a.validacao === "Aprovado");
  const entregue = validado && versoes.every((a) => a.entregue);
  const apuracao = modulos.includes("fiscal_contribuicoes") ? "fiscal_contribuicoes" : "fiscal_icms_ipi";
  return [
    { titulo: "Receber documentos", resumo: `${docs.length} recebidos · ${totais.rejeitados} em quarentena`, orientacao: totais.rejeitados ? "Revise os documentos em quarentena para liberar a classificação." : "Reúna as notas, contratos e recibos da competência.", modulo: "fiscal_acervo", aba: totais.rejeitados ? "quarentena" : "envio", acao: totais.rejeitados ? "Revisar quarentena" : "Enviar documentos", completa: recebidos },
    { titulo: "Classificar", resumo: `${totais.pendentes} decisões pendentes`, orientacao: "Selecione os documentos e defina destinação, CST e crédito. Confira também os contratos e recibos.", modulo: "fiscal_classificacao", aba: "produtos", acao: "Classificar documentos", completa: classificados },
    { titulo: "Apurar e fechar", resumo: fechado ? "Competência fechada" : "Conferência e fechamento pendentes", orientacao: "Confira as pendências, atualize a apuração e feche a competência antes de gerar os arquivos.", modulo: apuracao, aba: apuracao === "fiscal_contribuicoes" ? "fechamento" : "apuracao", acao: "Conferir apuração", completa: fechado },
    { titulo: "Gerar arquivos", resumo: `${versoes.length} versões atuais · ${versoes.filter((a) => precisaRevisar(cenario, a)).length} para revisar`, orientacao: "Escolha a obrigação e gere uma versão com os dados conferidos. Versões anteriores ficam no histórico.", modulo: "fiscal_entregas", aba: "arquivos", acao: "Gerar arquivos", completa: gerado },
    { titulo: "Validar", resumo: validado ? "Versões atuais aprovadas" : "Validação pendente", orientacao: "Valide as versões atuais e consulte o relatório quando houver pendências.", modulo: "fiscal_entregas", aba: "validacao", acao: "Validar arquivos", completa: validado },
    { titulo: "Registrar entrega", resumo: entregue ? "Entregas registradas" : "Aguardando versões aprovadas", orientacao: "Registre a entrega das versões aprovadas e confira os protocolos no histórico.", modulo: "fiscal_entregas", aba: "entregas", acao: "Registrar entrega", completa: entregue },
  ];
}
