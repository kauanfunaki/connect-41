// As linhas do arquivo de importação de lançamentos do Domínio, a partir das partidas (porte de
// `_exportar_lancamentos_importacao` em `src/domain/exportacao/service.py`).
//
// Débito e crédito do mesmo lançamento (`lancamentoId`) saem na mesma linha. O código da conta é o
// reduzido (`contaNumero`, o número do MrContador que o Domínio espera); conta sem ele sai com o código
// hierárquico e entra no aviso, porque o Domínio não a importa.

import type { Dec } from "./decimal";
import { historicoParaDominio, type Linha } from "./dominio";
import type { Dc } from "./regras";
import { ordenados } from "./unicodePy";

export type PartidaParaExportar = {
  readonly id: string;
  readonly lancamentoId: string;
  readonly transacaoId: string | null;
  readonly contaId: string;
  readonly dc: Dc;
  readonly valor: Dec;
  readonly historico: string;
  readonly historicoExtrato: string;
  /** "AAAA-MM-DD" */
  readonly dataLancamento: string;
};

export type ContaParaExportar = { readonly contaNumero: number | null; readonly codigo: string; readonly descricao: string };

export type ArquivoDoDominio = {
  linhas: Linha[];
  /** "codigo (descricao)" das contas que saíram sem código reduzido, em ordem. */
  contasSemCodigoAbreviado: string[];
  /** Lançamentos sem as duas pernas, que o layout não comporta. */
  lancamentosSemPar: number;
};

/**
 * `partidas` já vêm vivas, das contas bancárias que entram, e na ordem do arquivo (data do lançamento,
 * e então criação e id — ver "Divergências deliberadas" em docs/CONTABIL-CORE.md).
 * `dcDasTransacoes`: a direção da transação bancária, que decide pagamento ou recebimento. Não se usa a
 * perna débito: neste layout toda linha tem uma.
 */
export function linhasDoDominio(
  partidas: readonly PartidaParaExportar[],
  contas: ReadonlyMap<string, ContaParaExportar>,
  dcDasTransacoes: ReadonlyMap<string, Dc>,
  usarHistoricoExtrato: boolean,
): ArquivoDoDominio {
  const codigo = (id: string) => {
    const c = contas.get(id);
    if (!c) return "";
    return c.contaNumero !== null ? String(c.contaNumero) : c.codigo;
  };
  const contasSemCodigoAbreviado = ordenados(
    [...new Set(partidas.map((p) => p.contaId))]
      .map((id) => contas.get(id))
      .filter((c): c is ContaParaExportar => !!c && c.contaNumero === null)
      .map((c) => `${c.codigo} (${c.descricao})`),
  );

  // Agrupa por lançamento, na ordem de chegada; a segunda perna do mesmo lado substitui a primeira, como o dicionário do original.
  const grupos = new Map<string, Partial<Record<Dc, PartidaParaExportar>>>();
  for (const p of partidas) {
    const g = grupos.get(p.lancamentoId) ?? {};
    g[p.dc] = p;
    grupos.set(p.lancamentoId, g);
  }

  // Composição manual: vários lançamentos da mesma transação, cada um com o seu histórico.
  const porTransacao = new Map<string, number>();
  for (const pernas of grupos.values()) {
    const t = Object.values(pernas).find((p) => p?.transacaoId)?.transacaoId;
    if (t) porTransacao.set(t, (porTransacao.get(t) ?? 0) + 1);
  }

  const linhas: Linha[] = [];
  let lancamentosSemPar = 0;
  for (const pernas of grupos.values()) {
    const debito = pernas.D;
    const credito = pernas.C;
    if (!debito || !credito) {
      lancamentosSemPar++;
      continue;
    }
    const transacaoId = debito.transacaoId ?? credito.transacaoId;
    const dcTransacao = transacaoId ? dcDasTransacoes.get(transacaoId) : undefined;
    const historicoContabil = debito.historico || credito.historico;
    let historico = historicoContabil;
    const composta = (transacaoId ? porTransacao.get(transacaoId) ?? 0 : 0) > 1;
    // Na composição cada componente tem histórico próprio: a opção de copiar o extrato não o substitui.
    if (usarHistoricoExtrato && !composta) {
      // Registro antigo pode não ter a linha do banco: nunca apaga o histórico que já existia.
      historico = debito.historicoExtrato || credito.historicoExtrato || historicoContabil;
    }
    // Sem a transação de origem não há evidência de pagamento ou recebimento: fica o histórico contábil.
    if (dcTransacao && historico && !composta) historico = historicoParaDominio(historico, dcTransacao);

    const [ano, mes, dia] = debito.dataLancamento.split("-");
    linhas.push({
      Data: `${dia}/${mes}/${ano}`,
      "Cód. Conta Debito": codigo(debito.contaId),
      "Cód. Conta Credito": codigo(credito.contaId),
      Valor: debito.valor,
      "Cód. Histórico": "",
      // Política só do arquivo do Domínio: o histórico sai em maiúsculas; os códigos de conta, não.
      "Complemento Histórico": historico.toUpperCase(),
      "Inicia Lote": "",
      "Código Matriz/Filial": "",
      "Centro de Custo Débito": "",
      "Centro de Custo Crédito": "",
    });
  }
  return { linhas, contasSemCodigoAbreviado, lancamentosSemPar };
}
