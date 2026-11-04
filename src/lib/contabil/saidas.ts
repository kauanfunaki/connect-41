// As saídas do mês em lançamentos (03/11/2026): porte do passo 6 do painel
// contábil do motor (`sped_generator/contabil_saidas.py`). Um lançamento por
// dia e por tipo, com o total do que a empresa emitiu: CT-e e NFS-e. Puro.
//
// O que muda do motor: lá o CT-e vem do D100 do SPED gerado e a NFS-e da
// tabela de notas de serviço; aqui os dois vêm do acervo de documentos
// fiscais, com a empresa como emitente. Os códigos das contas eram fixos lá;
// aqui são da empresa, e os do motor valem enquanto ninguém troca.

import type { LinhaDaDominio } from "@/lib/financeiro/dominio/planilha";

export type TipoDeSaida = "cte" | "nfse";
export const TIPOS_DE_SAIDA: readonly TipoDeSaida[] = ["cte", "nfse"];
export const ROTULO_DA_SAIDA: Record<TipoDeSaida, string> = { cte: "CT-e", nfse: "NFS-e" };

export type ContaDaSaida = { debito: string; credito: string; historico: string };
export type ContasDasSaidas = Record<TipoDeSaida, ContaDaSaida>;

/** Os códigos do motor (`contabil_saidas.py`, REGRAS): o ponto de partida de toda empresa. */
export const CONTAS_PADRAO_DAS_SAIDAS: ContasDasSaidas = {
  cte: { debito: "504", credito: "523", historico: "132" },
  nfse: { debito: "504", credito: "411", historico: "2" },
};

/** Uma nota emitida pela empresa, como o acervo a entrega. */
export type Saida = { tipo: TipoDeSaida; data: string; centavos: number; cancelada: boolean };

export type DiaDeSaidas = { data: string } & Record<TipoDeSaida, { qtd: number; centavos: number }>;

/** O total de cada dia, por tipo, em ordem de data. Nota cancelada não entra. */
export function saidasPorDia(saidas: readonly Saida[]): DiaDeSaidas[] {
  const dias = new Map<string, DiaDeSaidas>();
  for (const s of saidas) {
    if (s.cancelada || !s.data) continue;
    const dia = dias.get(s.data) ?? { data: s.data, cte: { qtd: 0, centavos: 0 }, nfse: { qtd: 0, centavos: 0 } };
    dia[s.tipo].qtd += 1;
    dia[s.tipo].centavos += s.centavos;
    dias.set(s.data, dia);
  }
  return [...dias.values()].sort((a, b) => a.data.localeCompare(b.data));
}

/** "AAAA-MM-DD" → "DD/MM/AAAA". */
const dataBr = (dataKey: string) => dataKey.split("-").reverse().join("/");

/** O complemento do motor: a data no CT-e, "CFE DATA" antes dela na NFS-e. */
export function complementoDaSaida(tipo: TipoDeSaida, dataKey: string): string {
  return tipo === "cte" ? dataBr(dataKey) : `CFE DATA ${dataBr(dataKey)}`;
}

/** As linhas da planilha da Domínio: um lançamento por dia e por tipo com valor. */
export function linhasDasSaidas(dias: readonly DiaDeSaidas[], contas: ContasDasSaidas, codigoFilial: string): LinhaDaDominio[] {
  const linhas: LinhaDaDominio[] = [];
  for (const dia of dias) {
    for (const tipo of TIPOS_DE_SAIDA) {
      if (dia[tipo].centavos <= 0) continue;
      const c = contas[tipo];
      linhas.push({ dataKey: dia.data, debito: c.debito, credito: c.credito, centavos: dia[tipo].centavos, codigoHistorico: c.historico, complemento: complementoDaSaida(tipo, dia.data), codigoFilial });
    }
  }
  return linhas;
}

/** As contas da empresa sobre as do motor: o que foi gravado troca o padrão daquele tipo. */
export function contasDaEmpresa(gravadas: readonly ({ chave: string } & ContaDaSaida)[]): ContasDasSaidas {
  const contas = { ...CONTAS_PADRAO_DAS_SAIDAS };
  for (const g of gravadas) if (g.chave === "cte" || g.chave === "nfse") contas[g.chave] = { debito: g.debito, credito: g.credito, historico: g.historico };
  return contas;
}
