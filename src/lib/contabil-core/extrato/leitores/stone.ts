// Porte de `extrato/bancos/stone.py`: extrato da Stone, lido por coordenada.
//
//     DATA        TIPO     LANÇAMENTO        VALOR (R$)  SALDO (R$)  CONTRAPARTE
//                          CALPIE PINTURAS
//     31/07/2025  Débito   INDUSTRIAIS LTDA      226,00       64,73
//                          Transferência | Pix
//
// 1. O valor não tem sinal: quem diz débito ou crédito é a coluna TIPO.
// 2. A ordem é decrescente; quem devolve a ordem cronológica é `ordenarDoMaisAntigo`.
// 3. O nome da contraparte quebra em volta da linha de dados, na mesma coluna; o que separa os
//    grupos é a distância vertical (±12 pontos dentro do grupo contra 48 entre grupos).
// Não há SALDO ANTERIOR nem SALDO FINAL: a conferência é a cadeia entre lançamentos.

import { ehZero, igual, modulo, oposto, type Dec } from "../../motor/decimal";
import {
  agruparLinhas,
  bloco,
  bordaDireita,
  colarFragmentos,
  gerarFitid,
  ordenarDoMaisAntigo,
  parseData,
  parseValor,
  type Bloco,
  type Palavra,
  type Transacao,
} from "../comum";
import { corta, re, strip } from "../py";
import type { Leitor } from "./tipos";

const VALOR = re("^-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}$");
const DATA_LONGA = re("^\\d{2}/\\d{2}/\\d{4}$");
const TOLERANCIA_COLUNA = 16.0;

// A coluna TIPO é a fonte do sinal.
const DEBITO = ["débito", "debito"];
const CREDITO = ["crédito", "credito"];

const ASSINATURA = re("\\bdata\\b.*\\btipo\\b.*\\blan[çc]amento\\b.*\\bvalor\\b.*\\bsaldo\\b", "i");
const ESPACOS = re("\\s+");

type Colunas = {
  xData: number;
  xTipo: number;
  xLancamento: number;
  valor: number;
  saldo: number;
};

function lerCabecalho(linhas: readonly (readonly Palavra[])[]): Colunas | null {
  for (const palavras of linhas) {
    const textos = palavras.map((p) => p.text.toLowerCase());
    if (!textos.includes("data") || !textos.includes("tipo")) continue;
    if (!textos.some((t) => t.startsWith("lan"))) continue;
    const valor = bordaDireita(textos, palavras, "valor");
    const saldo = bordaDireita(textos, palavras, "saldo");
    if (valor === null || saldo === null) continue;
    return {
      xData: Number(palavras[textos.indexOf("data")].x0),
      xTipo: Number(palavras[textos.indexOf("tipo")].x0),
      xLancamento: Number(palavras[textos.findIndex((t) => t.startsWith("lan"))].x0),
      valor,
      saldo,
    };
  }
  return null;
}

/** `Decimal == Decimal | None`: `None == None` é verdade; `None` contra número, não. */
function saldosIguais(a: Dec | null, b: Dec | null): boolean {
  if (a === null || b === null) return a === b;
  return igual(a, b);
}

/**
 * Tira o saldo das linhas que só repetem o saldo da linha seguinte. Quando um Pix vem com tarifa, a
 * Stone imprime as duas linhas com o MESMO saldo (o do par já líquido). Saldo igual em duas linhas
 * seguidas só seria possível com lançamento de valor zero, que já foi descartado: é sempre fecho de
 * grupo, e mantendo-o só na última a conferência por segmentos soma o par inteiro.
 */
function saldoSoNoFimDoGrupo(transacoes: readonly Transacao[]): Transacao[] {
  const resultado = [...transacoes];
  for (let i = 0; i < resultado.length - 1; i++) {
    const atual = resultado[i];
    const seguinte = resultado[i + 1];
    if (atual.saldoApos !== null && saldosIguais(atual.saldoApos, seguinte.saldoApos)) {
      resultado[i] = { ...atual, saldoApos: null };
    }
  }
  return resultado;
}

export const stone: Leitor = {
  nome: "stone",
  siglas: new Set(["STONE", "197"]),
  reconhece: (linhas) => linhas.some((l) => ASSINATURA.search(l) !== null),
  extrairDePalavras(paginas, referenciaAno): Bloco[] {
    let transacoes: Transacao[] = [];
    let idx = 0;
    // As colunas valem até a próxima página que traga cabeçalho próprio: nem todo extrato repete o
    // cabeçalho em toda página, e pular a página inteira perderia os lançamentos dela.
    let colunas: Colunas | null = null;

    for (const palavras of paginas) {
      const linhas = agruparLinhas(palavras);
      colunas = lerCabecalho(linhas) ?? colunas;
      if (colunas === null) continue;

      // Nada acima do cabeçalho da tabela é contraparte: ali estão o titular, o CNPJ e o período.
      const topos = linhas.filter((linha) => lerCabecalho([linha]) !== null).map((linha) => Number(linha[0].top));
      const topoCabecalho = topos.length ? Math.min(...topos) : 0.0;

      const ancoras: [number, number][] = [];
      const fragmentos: [number, string][] = [];

      for (const linha of linhas) {
        const topo = Number(linha[0].top);
        if (topo <= topoCabecalho) continue;

        let dataLida: string | null = null;
        let sinal = 0;
        const descricao: string[] = [];
        let valor: Dec | null = null;
        let saldo: Dec | null = null;

        for (const palavra of linha) {
          const texto = palavra.text;
          const x0 = Number(palavra.x0);
          const x1 = Number(palavra.x1);

          if (DATA_LONGA.match(texto) && Math.abs(x0 - colunas.xData) <= 14) {
            dataLida = parseData(texto, referenciaAno);
            continue;
          }

          if (Math.abs(x0 - colunas.xTipo) <= 8) {
            const baixa = texto.toLowerCase();
            if (DEBITO.includes(baixa)) {
              sinal = -1;
              continue;
            }
            if (CREDITO.includes(baixa)) {
              sinal = 1;
              continue;
            }
          }

          if (VALOR.match(texto)) {
            const convertido = parseValor(texto);
            if (convertido !== null) {
              if (Math.abs(x1 - colunas.saldo) <= TOLERANCIA_COLUNA) {
                saldo = convertido;
                continue;
              }
              if (Math.abs(x1 - colunas.valor) <= TOLERANCIA_COLUNA) {
                valor = convertido;
                continue;
              }
            }
          }

          if (x0 >= colunas.xLancamento - 3) descricao.push(texto);
        }

        const textoDescricao = strip(ESPACOS.sub(" ", descricao.join(" ")));

        if (dataLida === null || valor === null || sinal === 0) {
          if (textoDescricao) fragmentos.push([topo, textoDescricao]);
          continue;
        }

        // `abs(valor) * sinal`: o sinal vem da coluna TIPO.
        valor = sinal < 0 ? oposto(modulo(valor)) : modulo(valor);
        if (ehZero(valor)) continue;

        transacoes.push({
          fitid: gerarFitid(dataLida, textoDescricao, valor, idx),
          data: dataLida,
          valor,
          historico: corta(textoDescricao, 200),
          tipoOfx: !valor.negativo && !ehZero(valor) ? "CREDIT" : "DEBIT",
          saldoApos: saldo,
          ordem: idx,
        });
        ancoras.push([topo, transacoes.length - 1]);
        idx++;
      }

      transacoes = colarFragmentos(transacoes, ancoras, fragmentos);
    }

    if (!transacoes.length) return [];

    transacoes = transacoes.map((t) => (t.historico ? t : { ...t, historico: "SEM DESCRIÇÃO" }));
    const cronologicas = ordenarDoMaisAntigo(transacoes);
    return [bloco(saldoSoNoFimDoGrupo(cronologicas))];
  },
};
