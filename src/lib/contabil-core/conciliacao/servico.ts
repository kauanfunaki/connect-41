// Conciliação de uma conta bancária: Razão enviado × extrato já importado (Bloco B, Fase B2,
// 12/11/2026). Porte de `conciliar_razao_extrato` (`src/domain/conciliacao_bancaria/service.py`),
// da parte que vem DEPOIS de ler o banco: aqui a função é pura e recebe o que o servidor leu
// (`servidor/conciliacao.ts`).
//
// Só relata. Nenhum lançamento é criado, estornado ou marcado: a análise e os ajustes ficam com o
// contador.
//
// ANTES DE CRUZAR, TRÊS CONFERÊNCIAS. Cruzar o Razão errado com o extrato certo produz um relatório
// inteiro de pendências falsas, com cara de verdadeiro. Por isso:
// 1. o CNPJ do Razão tem de ser o da empresa;
// 2. a conta do Razão tem de ser a conta contábil vinculada a esta conta bancária (quando houver
//    vínculo); senão é o Razão de outro banco;
// 3. o extrato importado tem de cobrir o período do Razão. Sem extrato no fim do mês, cada
//    lançamento daqueles dias vira "só no razão", e o problema é a importação que faltou, não a
//    contabilidade. Isso sai como aviso.
//
// Fidelidade ao Python (conferida pelo gabarito `gabarito/servico-conciliacao-*.json`):
// - as recusas têm a MESMA frase do `ValidationError`/`NotFoundError` do original;
// - `Decimal(t.valor) * -1` dá `-0.00` para valor zero (o `-d` daria `0.00`), e o relatório mostra;
// - os dicionários do original (`itens_r`, `itens_e`, o `Counter` e o `defaultdict` por dia) guardam
//   a ordem da primeira inserção; aqui são `Map`, que fazem o mesmo.

import type { Resultado } from "../servidor/base";
import { igual, modulo, soma, somaTodos, subtrai, type Dec } from "../motor/decimal";
import { diasEntre } from "../extrato/comum";
import { re, strip } from "../extrato/py";
import {
  APLICACAO,
  DATA_DIFERENTE,
  DUPLICIDADE_EXTRATO,
  DUPLICIDADE_RAZAO,
  LOTE_SISPAG,
  LOTE_SISPAG_DIVERGENTE,
  RENDIMENTO,
  RESGATE,
  conciliar,
  diferenca,
  especieDeAplicacao,
  type Grupo,
  type Item,
} from "./cruzamento";
import { comporSispag, indicarParcelasIguais } from "./composicao";
import { milhar } from "./razao";
import type { LancamentoRazao, RazaoConta } from "./razaoTipos";
import type { ConsultaSispag, PagamentoSispag } from "./sispag";
import type {
  ComposicaoExtrato,
  ConfiancaComposicao,
  CriterioComposicao,
  LinhaExtratoDe,
  LinhaRazaoDe,
  RelatorioConciliacao,
  ResumoDiaDe,
} from "./relatorio";

export const CONTA_BANCARIA_NAO_ENCONTRADA = "Conta bancária não encontrada nesta empresa.";

/** A conta bancária (`AgenciaBancaria`) como a conciliação a usa. */
export type AgenciaParaConciliar = {
  bancoSigla: string;
  agencia: string;
  numero: string;
  /** Há conta contábil vinculada (`conta_contabil_id`)? */
  temContaContabil: boolean;
};

/** A conta contábil vinculada à conta bancária (`PlanoConta`). */
export type ContaContabilVinculada = { contaNumero: number | null; codigo: string; descricao: string };

/** Uma transação viva do extrato importado. `valor` é sempre positivo: o sinal está em `dc`. */
export type TransacaoParaConciliar = {
  id: string;
  /** "AAAA-MM-DD" */
  data: string;
  ordem: number | null;
  valor: Dec;
  dc: string;
  historico: string;
};

export type EntradaConciliacao = {
  /** CNPJ da empresa, como cadastrado; `null` quando a empresa não foi achada (no original, `db.get` → None). */
  empresaCnpj: string | null;
  /** `null`: a conta bancária não é desta empresa, ou foi apagada. */
  agencia: AgenciaParaConciliar | null;
  /** A conta contábil vinculada, quando há vínculo e ela foi achada. */
  contaContabil: ContaContabilVinculada | null;
  razao: RazaoConta;
  sispag: ConsultaSispag | null;
  /** As transações vivas da conta no período do Razão, na ordem do extrato (data, ordem). */
  transacoes: readonly TransacaoParaConciliar[];
};

// Dias sem extrato nas pontas do período antes de avisar. Fim de semana e feriado deixam alguns dias
// sem movimento de verdade.
const FOLGA_COBERTURA = 4;

const NOME_DA_ESPECIE: Record<string, [string, string]> = {
  [RESGATE]: ["resgate", "resgates"],
  [APLICACAO]: ["aplicação", "aplicações"],
  [RENDIMENTO]: ["rendimento", "rendimentos"],
};

const NAO_DIGITO = re("\\D");
const ZERO: Dec = { negativo: false, coeficiente: BigInt(0), expoente: 0 };

/** `_so_digitos`: o `\D` do Python mantém dígito de qualquer escrita. */
function soDigitos(texto: string | null): string {
  return NAO_DIGITO.sub("", texto ?? "");
}

/** `f"{data:%d/%m/%Y}"` de "AAAA-MM-DD". */
export function dataBr(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** `_reais`: R$ 1.234,56 */
export function reais(valor: Dec): string {
  return "R$ " + milhar(valor).replace(/,/g, "_").replace(/\./g, ",").replace(/_/g, ".");
}

/** `d * -1` do Python: troca o sinal até do zero (`Decimal("0.00") * -1` é `-0.00`). */
function vezesMenosUm(d: Dec): Dec {
  return { ...d, negativo: !d.negativo };
}

function avisoAplicacaoSemExtrato(itens: readonly Item[]): string {
  const porEspecie = new Map<string | null, Item[]>();
  for (const item of itens) {
    const especie = especieDeAplicacao(item.historico, item.valor);
    const lista = porEspecie.get(especie);
    if (lista) lista.push(item);
    else porEspecie.set(especie, [item]);
  }
  const partes: string[] = [];
  for (const especie of [APLICACAO, RESGATE, RENDIMENTO]) {
    const grupo = porEspecie.get(especie);
    if (grupo?.length) {
      const [singular, plural] = NOME_DA_ESPECIE[especie];
      const total = somaTodos(grupo.map((i) => modulo(i.valor)));
      const nome = grupo.length === 1 ? singular : plural;
      partes.push(`${grupo.length} ${nome} (${reais(total)})`);
    }
  }
  return (
    "O extrato importado não traz os lançamentos de aplicação automática do razão: " +
    partes.join(", ") +
    ". Eles não foram conferidos e não entram nas pendências — confira no extrato " +
    "consolidado ou no relatório de aplicações do banco."
  );
}

/**
 * `_conferir_sispag`: a consulta de pagamentos é desta empresa e desta conta? Senão, recusa. Um
 * SISPAG de outra conta casaria lotes pela soma e apontaria "pagamentos faltando" que são de outro
 * banco: pendência falsa com nome e valor.
 */
function conferirSispag(sispag: ConsultaSispag, empresaCnpj: string | null, agencia: AgenciaParaConciliar, nomeConta: string): string | null {
  if (empresaCnpj !== null && sispag.cnpj && soDigitos(empresaCnpj) !== sispag.cnpj) {
    return `A consulta do SISPAG é de outra empresa (CNPJ ${sispag.cnpj}).`;
  }
  const conta = soDigitos(sispag.conta);
  const esperado = soDigitos(agencia.agencia) + soDigitos(agencia.numero);
  if (conta && esperado && !conta.startsWith(esperado)) {
    return `A consulta do SISPAG é da conta ${sispag.conta}, e a conciliação é de ${nomeConta}. Envie o SISPAG desta conta.`;
  }
  return null;
}

type Dia = {
  lancamentosRazao: number;
  lancamentosExtrato: number;
  movimentoRazao: Dec;
  movimentoExtrato: Dec;
  pendencias: number;
  dataDiferente: number;
  aplicacaoSemExtrato: number;
};

/** `_por_dia`: movimento e pendências de cada dia, para achar em que data está a diferença. */
function porDia(
  itensR: readonly Item[],
  itensE: readonly Item[],
  resultado: { abertura: Item[]; pendencias: Grupo[]; conciliados: Grupo[]; aplicacaoSemExtrato: Item[] },
): ResumoDiaDe<Dec>[] {
  const dias = new Map<string, Dia>();
  const dia = (d: string): Dia => {
    let v = dias.get(d);
    if (!v) {
      v = { lancamentosRazao: 0, lancamentosExtrato: 0, movimentoRazao: ZERO, movimentoExtrato: ZERO, pendencias: 0, dataDiferente: 0, aplicacaoSemExtrato: 0 };
      dias.set(d, v);
    }
    return v;
  };
  const fora = new Set(resultado.abertura.map((a) => a.id));
  for (const item of itensR) {
    if (!fora.has(item.id)) {
      const v = dia(item.data);
      v.lancamentosRazao += 1;
      v.movimentoRazao = soma(v.movimentoRazao, item.valor);
    }
  }
  for (const item of itensE) {
    const v = dia(item.data);
    v.lancamentosExtrato += 1;
    v.movimentoExtrato = soma(v.movimentoExtrato, item.valor);
  }
  for (const g of resultado.pendencias) {
    for (const d of new Set([...g.razao, ...g.extrato].map((i) => i.data))) dia(d).pendencias += 1;
  }
  // Par casado com data diferente deixa diferença nos dois dias sem ser pendência; sem esta contagem
  // o dia pareceria errado sem motivo.
  for (const g of resultado.conciliados) {
    if (g.tipo === DATA_DIFERENTE) for (const i of [...g.razao, ...g.extrato]) dia(i.data).dataDiferente += 1;
  }
  for (const item of resultado.aplicacaoSemExtrato) dia(item.data).aplicacaoSemExtrato += 1;
  return [...dias.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([data, v]) => ({ data, ...v, diferenca: subtrai(v.movimentoRazao, v.movimentoExtrato) }));
}

/** Monta o relatório da conciliação. As recusas voltam como `{ ok: false }` com a frase do original. */
export function relatorioDaConciliacao(entrada: EntradaConciliacao): Resultado<RelatorioConciliacao> {
  const { razao, agencia, empresaCnpj } = entrada;
  const falha = (erro: string): Resultado<RelatorioConciliacao> => ({ ok: false, erro });
  if (agencia === null) return falha(CONTA_BANCARIA_NAO_ENCONTRADA);

  const nomeConta = `${agencia.bancoSigla} ag. ${agencia.agencia} c/c ${agencia.numero}`;
  const contaRazao = strip(`${razao.contaCodigo} - ${razao.contaClassificacao} ${razao.contaDescricao}`);
  const avisos: string[] = [];

  if (empresaCnpj !== null && razao.cnpj && soDigitos(empresaCnpj) !== razao.cnpj) {
    return falha(
      `O razão é de outra empresa (CNPJ ${razao.cnpj}, ${razao.empresa}). ` +
        "Confira se o arquivo e a empresa selecionada são os mesmos.",
    );
  }

  if (agencia.temContaContabil) {
    const conta = entrada.contaContabil;
    if (conta !== null) {
      const mesmoCodigo = conta.contaNumero !== null && String(conta.contaNumero) === razao.contaCodigo;
      const mesmaClassificacao = conta.codigo === razao.contaClassificacao;
      if (!(mesmoCodigo || mesmaClassificacao)) {
        // `conta.conta_numero or ''`: o zero também some.
        return falha(
          `O razão enviado é da conta ${contaRazao}, mas a conta bancária ${nomeConta} está vinculada à conta contábil ` +
            `${conta.contaNumero || ""} ${conta.codigo} ${conta.descricao}. ` +
            "Envie o razão desta conta, ou escolha a conta bancária certa.",
        );
      }
    }
  } else {
    avisos.push(
      `A conta bancária ${nomeConta} não tem conta contábil vinculada, então não deu ` +
        `para confirmar que o razão (${contaRazao}) é desta conta.`,
    );
  }

  const inicio = razao.periodoInicio;
  const fim = razao.periodoFim;
  if (inicio === null || fim === null) return falha("Não encontrei o período no cabeçalho do razão.");

  let pagamentosSispag: PagamentoSispag[] = [];
  if (entrada.sispag !== null) {
    const recusa = conferirSispag(entrada.sispag, empresaCnpj, agencia, nomeConta);
    if (recusa !== null) return falha(recusa);
    pagamentosSispag = entrada.sispag.pagamentos.filter((p) => inicio <= p.data && p.data <= fim);
    if (!pagamentosSispag.length) {
      avisos.push(
        "A consulta do SISPAG enviada não tem pagamentos no período do razão, " +
          "então não foi usada para separar os lotes.",
      );
    }
  }

  const transacoes = entrada.transacoes;
  if (!transacoes.length) {
    return falha(
      `Não há extrato importado para ${nomeConta} entre ${dataBr(inicio)} e ${dataBr(fim)}. ` +
        "Importe o extrato do período antes de conciliar.",
    );
  }

  const primeira = transacoes[0].data;
  const ultima = transacoes[transacoes.length - 1].data;
  const inicioIncompleto = diasEntre(inicio, primeira) > FOLGA_COBERTURA;
  const fimIncompleto = diasEntre(ultima, fim) > FOLGA_COBERTURA;
  if (inicioIncompleto || fimIncompleto) {
    avisos.push(
      `O extrato importado vai de ${dataBr(primeira)} a ${dataBr(ultima)}, e o razão de ` +
        `${dataBr(inicio)} a ${dataBr(fim)}. Lançamentos fora ` +
        'desse intervalo vão aparecer como "só no razão" por falta de extrato, não por erro.',
    );
  }

  // `itens_r` e `itens_e` do original: dicionários por id (a posição da primeira inserção, o último valor).
  const lancamentos = new Map<string, LancamentoRazao>();
  const itensR = new Map<string, Item>();
  razao.lancamentos.forEach((l, i) => {
    itensR.set(`r${i}`, { id: `r${i}`, data: l.data, valor: l.valor, historico: l.historico });
    lancamentos.set(`r${i}`, l);
  });
  const itensE = new Map<string, Item>();
  for (const t of transacoes) {
    itensE.set(t.id, { id: t.id, data: t.data, valor: t.dc === "C" ? t.valor : vezesMenosUm(t.valor), historico: t.historico });
  }
  const listaR = [...itensR.values()];
  const listaE = [...itensE.values()];
  const resultado = conciliar<Item, PagamentoSispag>(listaR, listaE, {
    periodoInicio: inicio,
    sispag: pagamentosSispag.length ? pagamentosSispag : null,
  });

  if (resultado.aplicacaoSemExtrato.length) avisos.push(avisoAplicacaoSemExtrato(resultado.aplicacaoSemExtrato));

  const linhaR = (item: Item): LinhaRazaoDe<Dec> => {
    const l = lancamentos.get(item.id)!;
    return { data: l.data, valor: l.valor, historico: l.historico, lote: l.lote, contrapartida: l.contrapartida };
  };
  const linhaE = (item: Item): LinhaExtratoDe<Dec> => ({ transacaoId: item.id, data: item.data, valor: item.valor, historico: item.historico });

  const composicoes = (g: Grupo<Item, PagamentoSispag>): ComposicaoExtrato[] => {
    if (g.tipo !== LOTE_SISPAG && g.tipo !== LOTE_SISPAG_DIVERGENTE) return [];
    const calculadas = comporSispag(
      g.razao.map((item, indice) => ({ indice, valor: item.valor, lote: lancamentos.get(item.id)!.lote })),
      g.extrato.map((item, indice) => ({ indice, valor: item.valor })),
      g.sispagFaltando.map((p) => p.valor),
    );
    return calculadas.map((c) => ({
      extratoIndice: c.extratoIndice,
      razaoIndices: [...c.razaoIndices],
      sispagFaltandoIndices: [...c.sispagFaltandoIndices],
      criterio: c.criterio as CriterioComposicao,
      confianca: c.confianca as ConfiancaComposicao,
    }));
  };

  const movimentoRazao = subtrai(somaTodos(listaR.map((i) => i.valor)), somaTodos(resultado.abertura.map((a) => a.valor)));
  const movimentoExtrato = somaTodos(listaE.map((i) => i.valor));
  // Na duplicidade, o lado repetido é pendência; o outro já está conciliado e não pode ser contado
  // duas vezes. (Só a comparação com a diferença importa; o valor não sai no relatório.)
  let explicado = ZERO;
  for (const g of resultado.pendencias) {
    if (g.tipo !== DUPLICIDADE_EXTRATO) explicado = soma(explicado, somaTodos(g.razao.map((i) => i.valor)));
    if (g.tipo !== DUPLICIDADE_RAZAO) explicado = subtrai(explicado, somaTodos(g.extrato.map((i) => i.valor)));
  }
  explicado = soma(explicado, somaTodos(resultado.aplicacaoSemExtrato.map((i) => i.valor)));
  const diferencaTotal = subtrai(movimentoRazao, movimentoExtrato);

  for (const grupo of resultado.pendencias) {
    const indice = indicarParcelasIguais(
      grupo.razao.map((item, i) => ({ indice: i, valor: item.valor })),
      grupo.extrato.map((item, i) => ({ indice: i, valor: item.valor })),
    );
    if (indice !== null) {
      avisos.push(
        `Possível parcelamento em ${dataBr(grupo.extrato[0].data)}: ` +
          `${grupo.extrato.length} parcelas do extrato somam exatamente ` +
          `o lançamento ${indice + 1} do razão neste grupo. ` +
          "Parcelas iguais, com ajuste de até R$ 0,05 na última. " +
          "Confira documentos e datas; nenhuma relação foi confirmada automaticamente.",
      );
    }
  }

  // `dict(Counter(...))`: na ordem em que cada tipo apareceu.
  const porTipo = new Map<string, number>();
  for (const g of resultado.conciliados) porTipo.set(g.tipo, (porTipo.get(g.tipo) ?? 0) + 1);

  return {
    ok: true,
    valor: {
      resumo: {
        empresa: razao.empresa,
        contaRazao,
        contaBancaria: nomeConta,
        periodoInicio: inicio,
        periodoFim: fim,
        lancamentosRazao: itensR.size,
        lancamentosExtrato: itensE.size,
        conciliados: resultado.conciliados.length,
        pendencias: resultado.pendencias.length,
        movimentoRazao,
        movimentoExtrato,
        diferenca: diferencaTotal,
        diferencaExplicada: igual(explicado, diferencaTotal),
        abertura: resultado.abertura.map(linhaR),
        aplicacaoSemExtrato: resultado.aplicacaoSemExtrato.length,
      },
      avisos,
      conciliadosPorTipo: [...porTipo.entries()],
      pendencias: resultado.pendencias.map((g) => ({
        tipo: g.tipo,
        razao: g.razao.map(linhaR),
        extrato: g.extrato.map(linhaE),
        diferenca: diferenca(g),
        sispagFaltando: g.sispagFaltando.map((p) => ({ data: p.data, valor: p.valor, tipo: p.tipo, favorecido: p.favorecido, documento: p.documento })),
        composicoes: composicoes(g),
      })),
      aplicacaoSemExtrato: resultado.aplicacaoSemExtrato.map(linhaR),
      porDia: porDia(listaR, listaE, resultado),
      sispagUsado: pagamentosSispag.length > 0,
    },
  };
}
