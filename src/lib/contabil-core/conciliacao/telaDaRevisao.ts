// A revisão manual da conciliação na tela (Bloco B, Fase B3, 12/11/2026): o que o `RevisaoManualEditor`,
// o `VinculosManuais` e o `RazaoExtratoTab` do Contábil Core faziam com a revisão antes de desenhar
// (`concilpro-revisoes-utils.ts`). Puro, sem React: seleção, totais, filtros e paginação.
//
// O original somava em centavos com `Number` e recusava a soma acima de `Number.MAX_SAFE_INTEGER`
// ("Limite excedido"). Aqui as somas são decimais exatas (`Dec`), sem limite na tela; o limite
// monetário da conferência continua sendo do servidor, que recusa o vínculo com a mensagem dele.

import { compara, dec, ehZero, modulo, somaTodos, subtrai, texto, type Dec } from "../motor/decimal";
import { dataBr, moedaDoRelatorio } from "./telaDaConciliacao";
import type { GrupoConciliacaoJson } from "./relatorio";
import type {
  LinhaExtratoRevisao,
  LinhaRazaoRevisao,
  NaturezaRazao,
  NovoVinculo,
  ResumoRevisao,
  Revisao,
  TipoFonteRevisao,
  VinculoRevisao,
} from "./revisaoTipos";

/** Linhas por página nas duas listas do editor (os documentos podem ter milhares de linhas). */
export const TAMANHO_DA_PAGINA = 50;

const ZERO = dec("0");

export const informado = (valor?: string | null) => valor?.trim() || "Não informado";

/** Para a busca: sem acento e em minúsculas. */
export const textoBusca = (valor: string) => valor.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Uma conta pode ter o mesmo código em fontes diferentes: o filtro usa código + classificação. */
export const chaveConta = (l: Pick<LinhaRazaoRevisao, "contaCodigo" | "contaClassificacao">) => JSON.stringify([l.contaCodigo, l.contaClassificacao]);

/** O nome da revisão na lista: o título dado pela pessoa ou, sem ele, o nome do arquivo do Razão. */
export const nomeDaRevisao = (r: Pick<ResumoRevisao, "titulo" | "nomeArquivo">) => r.titulo?.trim() || r.nomeArquivo;

const positivo = (d: Dec) => !ehZero(d) && !d.negativo;

// ─── Vínculos já registrados ────────────────────────────────────────────────

export const vinculosAtivos = (vinculos: readonly VinculoRevisao[]) => vinculos.filter((v) => v.estado === "ATIVO");

/** O extrato e o Razão já usados em conferência ativa: ficam bloqueados para não serem reaproveitados. */
export function usadosNaRevisao(revisao: Pick<Revisao, "vinculos">): { extrato: Set<string>; razao: Set<string> } {
  const ativos = vinculosAtivos(revisao.vinculos);
  return {
    extrato: new Set(ativos.flatMap((v) => v.extratoIds)),
    razao: new Set(ativos.flatMap((v) => v.razaoItens.map((i) => i.linhaId))),
  };
}

/**
 * O selo da pendência no relatório: todas as linhas do extrato dela já têm conferência manual ativa,
 * ou só parte delas. Sem nenhuma, nada.
 */
export function registroManual(grupo: Pick<GrupoConciliacaoJson, "extrato">, extratoVinculado: ReadonlySet<string>): string | null {
  const registrados = grupo.extrato.filter((l) => extratoVinculado.has(l.transacaoId)).length;
  if (registrados === 0) return null;
  return registrados === grupo.extrato.length ? "Conferência manual registrada" : `Conferência parcial (${registrados}/${grupo.extrato.length})`;
}

/** A seleção inicial do extrato ao abrir a revisão por uma pendência: só as linhas livres desta revisão. */
export function extratoInicial(revisao: Pick<Revisao, "extrato" | "vinculos">, ids: readonly string[]): Set<string> {
  const usados = usadosNaRevisao(revisao).extrato;
  const existentes = new Set(revisao.extrato.filter((l) => !ehZero(dec(l.valor))).map((l) => l.transacaoId));
  return new Set(ids.filter((id) => !usados.has(id) && existentes.has(id)));
}

// ─── Seleção e totais ───────────────────────────────────────────────────────

export function alternar(anteriores: ReadonlySet<string>, id: string): Set<string> {
  const proximos = new Set(anteriores);
  if (proximos.has(id)) proximos.delete(id);
  else proximos.add(id);
  return proximos;
}

/** As linhas do extrato escolhidas, na ordem do extrato (a primeira define a coluna do Razão do banco). */
export const extratoEscolhido = (extrato: readonly LinhaExtratoRevisao[], selecao: ReadonlySet<string>) => extrato.filter((l) => selecao.has(l.transacaoId));

/**
 * A coluna do Razão usada na composição. Razão de apoio: a que a pessoa escolheu. Conta do banco: entrada
 * no extrato usa o débito, saída usa o crédito (pela primeira linha escolhida).
 */
export function naturezaDaComposicao(linhasExtrato: readonly LinhaExtratoRevisao[], tipoFonte: TipoFonteRevisao, naturezaApoio: NaturezaRazao): NaturezaRazao {
  if (tipoFonte === "RAZAO_APOIO") return naturezaApoio;
  return linhasExtrato.length > 0 && positivo(dec(linhasExtrato[0].valor)) ? "D" : "C";
}

export const valorNaNatureza = (l: Pick<LinhaRazaoRevisao, "valorDebito" | "valorCredito">, dc: NaturezaRazao): Dec => dec(dc === "D" ? l.valorDebito : l.valorCredito);

export type TotaisDaSelecao = {
  /** Soma dos valores absolutos do extrato escolhido. */
  totalExtrato: string;
  /** Soma da coluna usada do Razão escolhido. */
  totalRazao: string;
  /** Razão − extrato. */
  diferenca: string;
  temDiferenca: boolean;
  /** Só entradas ou só saídas no extrato escolhido. */
  mesmoSentido: boolean;
};

export function totaisDaSelecao(
  revisao: Pick<Revisao, "extrato" | "linhasRazao">,
  extrato: ReadonlySet<string>,
  razao: ReadonlySet<string>,
  natureza: NaturezaRazao,
): TotaisDaSelecao {
  const linhasExtrato = extratoEscolhido(revisao.extrato, extrato).map((l) => dec(l.valor));
  const totalExtrato = somaTodos(linhasExtrato.map(modulo));
  const totalRazao = somaTodos(revisao.linhasRazao.filter((l) => razao.has(l.id)).map((l) => valorNaNatureza(l, natureza)));
  const diferenca = subtrai(totalRazao, totalExtrato);
  const sentidos = new Set(linhasExtrato.map((d) => (ehZero(d) ? 0 : d.negativo ? -1 : 1)));
  return {
    totalExtrato: texto(totalExtrato),
    totalRazao: texto(totalRazao),
    diferenca: texto(diferenca),
    temDiferenca: !ehZero(diferenca),
    mesmoSentido: sentidos.size <= 1,
  };
}

/**
 * Escolher (ou tirar) uma linha do extrato. Na conta do banco, se a coluna do Razão mudar (a primeira
 * linha passou de entrada para saída), a seleção do Razão é limpa: os valores dela eram da outra coluna.
 */
export function escolherExtrato(
  revisao: Pick<Revisao, "extrato">,
  atuais: ReadonlySet<string>,
  id: string,
  tipoFonte: TipoFonteRevisao,
  naturezaAtual: NaturezaRazao,
): { extrato: Set<string>; limparRazao: boolean } {
  const extrato = alternar(atuais, id);
  const proxima = naturezaDaComposicao(extratoEscolhido(revisao.extrato, extrato).slice(0, 1), "RAZAO_BANCO", "D");
  return { extrato, limparRazao: tipoFonte === "RAZAO_BANCO" && proxima !== naturezaAtual };
}

/** Por que a linha do Razão não pode entrar nesta composição; `null` quando pode. */
export function razaoIndisponivel(
  l: Pick<LinhaRazaoRevisao, "valorDebito" | "valorCredito">,
  natureza: NaturezaRazao,
  tipoFonte: TipoFonteRevisao,
  temExtrato: boolean,
): string | null {
  if (tipoFonte === "RAZAO_BANCO" && !temExtrato) return "Escolha um lançamento do extrato para definir a coluna usada.";
  if (!positivo(valorNaNatureza(l, natureza))) return `Sem valor positivo na coluna de ${natureza === "D" ? "débitos" : "créditos"} usada nesta composição.`;
  return null;
}

export function podeRegistrar(p: {
  fontesValidas: boolean;
  ocupado: boolean;
  qtdExtrato: number;
  qtdRazao: number;
  totais: Pick<TotaisDaSelecao, "mesmoSentido" | "temDiferenca">;
  observacao: string;
}): boolean {
  return (
    p.fontesValidas &&
    !p.ocupado &&
    p.qtdExtrato > 0 &&
    p.qtdRazao > 0 &&
    p.totais.mesmoSentido &&
    (!p.totais.temDiferenca || p.observacao.trim().length > 0)
  );
}

/** O corpo do `POST …/vinculos`: o Razão escolhido, todo na coluna da composição. */
export function novoVinculo(
  revisao: Pick<Revisao, "versao" | "extrato" | "linhasRazao">,
  extrato: ReadonlySet<string>,
  razao: ReadonlySet<string>,
  natureza: NaturezaRazao,
  observacao: string,
): NovoVinculo {
  return {
    versao: revisao.versao,
    // Na ordem dos documentos, não na ordem dos cliques.
    extratoIds: revisao.extrato.filter((l) => extrato.has(l.transacaoId)).map((l) => l.transacaoId),
    razaoItens: revisao.linhasRazao.filter((l) => razao.has(l.id)).map((l) => ({ linhaId: l.id, dc: natureza })),
    observacao: observacao.trim(),
  };
}

// ─── Filtros ────────────────────────────────────────────────────────────────

/** O texto de busca de cada linha do extrato, montado uma vez (datas, moedas e acentos). */
export function indiceDoExtrato(extrato: readonly LinhaExtratoRevisao[]): Map<string, string> {
  return new Map(
    extrato.map((l) => [l.transacaoId, textoBusca([l.historico, l.favorecido, l.documento, l.data, dataBr(l.data), l.valor, moedaDoRelatorio(l.valor)].join(" "))]),
  );
}

export function indiceDoRazao(linhas: readonly LinhaRazaoRevisao[]): Map<string, string> {
  return new Map(
    linhas.map((l) => [
      l.id,
      textoBusca(
        [
          l.contaCodigo,
          l.contaClassificacao,
          l.contaDescricao,
          l.historico,
          l.favorecido,
          l.documento,
          l.lote,
          l.contrapartida,
          l.data,
          dataBr(l.data),
          l.valorDebito,
          l.valorCredito,
          moedaDoRelatorio(l.valorDebito),
          moedaDoRelatorio(l.valorCredito),
        ].join(" "),
      ),
    ]),
  );
}

export type FiltroDoExtrato = { mostrarVinculados: boolean; data: string; busca: string };

export function filtrarExtrato(
  extrato: readonly LinhaExtratoRevisao[],
  usados: ReadonlySet<string>,
  indice: ReadonlyMap<string, string>,
  f: FiltroDoExtrato,
): LinhaExtratoRevisao[] {
  const busca = textoBusca(f.busca.trim());
  return extrato.filter(
    (l) =>
      (f.mostrarVinculados || !usados.has(l.transacaoId)) &&
      (!f.data || l.data === f.data) &&
      (!busca || (indice.get(l.transacaoId) ?? "").includes(busca)),
  );
}

export const TODAS_AS_CONTAS = "todas";

export type FiltroDoRazao = { tipoFonte: TipoFonteRevisao; mostrarVinculados: boolean; conta: string; busca: string };

export function filtrarRazao(
  linhas: readonly LinhaRazaoRevisao[],
  usados: ReadonlySet<string>,
  indice: ReadonlyMap<string, string>,
  f: FiltroDoRazao,
): LinhaRazaoRevisao[] {
  const busca = textoBusca(f.busca.trim());
  return linhas.filter(
    (l) =>
      l.tipoFonte === f.tipoFonte &&
      (f.mostrarVinculados || !usados.has(l.id)) &&
      (f.conta === TODAS_AS_CONTAS || chaveConta(l) === f.conta) &&
      (!busca || (indice.get(l.id) ?? "").includes(busca)),
  );
}

/** As contas contábeis de uma origem do Razão, para o filtro (a primeira é "Todas as contas"). */
export function contasDaOrigem(linhas: readonly LinhaRazaoRevisao[], tipoFonte: TipoFonteRevisao): { value: string; label: string; descricao?: string }[] {
  const contas = new Map<string, { value: string; label: string; descricao?: string }>();
  for (const l of linhas) {
    if (l.tipoFonte !== tipoFonte) continue;
    const chave = chaveConta(l);
    if (!contas.has(chave)) contas.set(chave, { value: chave, label: `${informado(l.contaCodigo)} — ${informado(l.contaDescricao)}`, descricao: informado(l.contaClassificacao) });
  }
  return [{ value: TODAS_AS_CONTAS, label: "Todas as contas" }, ...contas.values()];
}

// ─── Paginação ──────────────────────────────────────────────────────────────

export const totalDePaginas = (total: number, tamanho = TAMANHO_DA_PAGINA) => Math.max(1, Math.ceil(total / tamanho));

/** A página `pagina` (a partir de 0), presa ao intervalo válido. */
export function paginaDe<T>(lista: readonly T[], pagina: number, tamanho = TAMANHO_DA_PAGINA): { itens: T[]; pagina: number; paginas: number } {
  const paginas = totalDePaginas(lista.length, tamanho);
  const p = Math.min(Math.max(0, pagina), paginas - 1);
  return { itens: lista.slice(p * tamanho, (p + 1) * tamanho), pagina: p, paginas };
}

// ─── Exibição ───────────────────────────────────────────────────────────────

/** O valor da linha do Razão na coluna do vínculo, para a lista de conferências. */
export const valorDoItem = (l: Pick<LinhaRazaoRevisao, "valorDebito" | "valorCredito">, dc: NaturezaRazao) => (dc === "D" ? l.valorDebito : l.valorCredito);

/** Se a linha do extrato pode ser escolhida (valor zero não compõe nada). */
export const extratoEscolhivel = (l: Pick<LinhaExtratoRevisao, "valor">) => !ehZero(dec(l.valor));

/** Entrada (positivo) ou saída no extrato. */
export const ehSaida = (valor: string) => compara(dec(valor), ZERO) < 0;
