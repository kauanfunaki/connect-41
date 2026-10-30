import type { BaseLocal } from "./servidor";
import { somar, type Obrigacao } from "./dominio";
export function relatorioLocal(base: BaseLocal, aba: string, obrigacao: Obrigacao): { nome: string; colunas: string[]; linhas: (string | null)[][] }[] {
  const a = obrigacao === "icms_ipi" ? base.icms : base.contribuicoes;
  const apoio = { nome: "Documentos de apoio", colunas: ["Identificação", "Empresa", "Pessoa", "CPF ou CNPJ", "Competência", "Categoria", "Bruto", "Líquido", "Crédito", "Decisão"], linhas: base.apoios.map(p => [p.identidade, p.companyId, p.nome, p.documento, p.competencia, p.categoria, p.bruto, p.liquido, p.credito, p.decisao]) };
  if (aba === "classificacao") return [
    { nome: "Produtos", colunas: ["Fornecedor", "Código", "Descrição", "NCM", "CFOP", "Destinação", "Valor", "ICMS", "Decidido"], linhas: base.produtos.map(p => [p.fornecedor, p.codigo, p.descricao, p.ncm, p.cfop, p.tipoItem, p.valor, p.icms, p.decidido ? "Sim" : "Não"]) },
    { nome: "Decisões", colunas: ["Tipo", "Chave", "Autor", "Data", "Dados"], linhas: base.decisoes.map(d => [d.tipo, d.chave, d.autor, d.em, JSON.stringify(d.dados)]) },
    apoio,
  ];
  if (aba === "fechamento") return [
    { nome: "Documentos fiscais", colunas: ["Identidade", "Empresa", "Tipo", "Número", "Competência", "Sentido", "Valor", "Cancelado", "Completo"], linhas: [...base.documentos.map(d => [d.identidade, d.companyId, d.tipo, d.numero, d.competencia, d.sentido, d.valor, d.cancelado ? "Sim" : "Não", d.completo ? "Sim" : "Não"]), ...base.acervo.map(d => [d.dedupKey, d.companyId, d.type, d.number, d.competence, "Acervo sem itens", d.amount, d.situation === "CANCELADA" ? "Sim" : "Não", "Não"])] }, apoio,
    { nome: "Duplicidades", colunas: ["Pessoa", "Documento", "Competência", "Pagamento", "Bruto", "Ocorrências"], linhas: base.fechamento.duplicatas.map(g => [g[0].nome, g[0].documento, g[0].competencia, g[0].dataPagamento, g[0].bruto, String(g.length)]) },
    { nome: "Faturamento", colunas: ["Grupo", "Valor", "Cobertura"], linhas: [["Saídas fiscais escrituradas", base.icms.totalSaidas], ["Entradas escrituradas com nota", base.icms.totalEntradas], ["Pagamentos sem nota", base.fechamento.bruto], ["Saídas menos entradas escrituradas", somar([base.icms.totalSaidas, `-${base.icms.totalEntradas}`, `-${base.fechamento.bruto}`])]].map(l => [...l, base.acervo.length ? `${base.acervo.length} documento(s) do acervo aguardam itens e não entram nestes totais.` : "Acervo com itens disponível."]) },
  ];
  return [
    { nome: "Apuração", colunas: ["Tributo", "Débitos", "Créditos", "Saldo anterior", "A recolher", "A transportar"], linhas: a.tributos.map(t => [t.tributo, t.debitos, t.creditos, t.saldoAnterior, t.recolher, t.transportar]) },
    { nome: "Livro fiscal", colunas: ["Empresa", "Nota", "Competência", "Sentido", "CFOP", "CST", "Alíquota", "Valor", "Base", obrigacao === "icms_ipi" ? "ICMS" : "PIS", obrigacao === "icms_ipi" ? "Base IPI" : "Base COFINS", obrigacao === "icms_ipi" ? "IPI" : "COFINS", "Isentas", "Outras"], linhas: a.linhas.map(l => [l.empresaId, l.numero, l.competencia, l.sentido, l.cfop, l.cst, l.aliquota, l.valor, l.base, l.imposto, l.bases[obrigacao === "icms_ipi" ? "ipi" : "cofins"] ?? null, l.tributos[obrigacao === "icms_ipi" ? "ipi" : "cofins"] ?? null, l.isentas, l.outras]) },
    { nome: "Ajustes", colunas: ["ID", "Tributo", "Competência", "Código", "Descrição", "Natureza", "Valor", "Dados estaduais"], linhas: a.ajustes.map(j => [j.id, j.tributo, j.competencia, j.codigo, j.descricao, j.natureza, j.valor, JSON.stringify(j.camposEstaduais)]) },
    { nome: "Conferências", colunas: ["Pendência"], linhas: a.pendencias.map(p => [p]) },
  ];
}
export function csvSeguro(colunas: string[], linhas: (string | null)[][]): string {
  const campo = (v: string | null) => {
    let valor = v ?? "Não levantado";
    // CSV aberto no Excel não deve executar fórmulas de fornecedor/descrição.
    if (/^[=+@\t\r]|^-\D/.test(valor)) valor = `'${valor}`;
    return `"${valor.replace(/"/g, '""')}"`;
  };
  return "\uFEFF" + [colunas, ...linhas].map(l => l.map(campo).join(";")).join("\r\n");
}
