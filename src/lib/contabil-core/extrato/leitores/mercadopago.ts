// Porte de `extrato/bancos/mercadopago.py`: Mercado Pago, com a descrição quebrada acima e abaixo
// da linha de dados.
//
//     Data        Descrição                    ID da operação    Valor       Saldo
//                 Pix recebido 36.576.422
//     01-04-2026  FULANO DE TAL                152067851233      R$ 238,08   R$ 372,35
//                 SILVA
//
// No texto achatado não há como saber onde uma descrição acaba e a outra começa; por isso este
// leitor vai por coordenada: a quebra fica a ~12 pontos da linha de dados e o lançamento seguinte a
// ~41, então a vizinhança resolve sem empate. Toda linha traz saldo, então a cadeia fecha
// lançamento a lançamento. A capa NÃO é usada como âncora de propósito: na ordem de leitura os
// rótulos saem depois dos números, e âncora errada é pior que nenhuma.

import { ehZero, type Dec } from "../../motor/decimal";
import { agruparLinhas, bloco, colarFragmentos, gerarFitid, parseData, parseValor, type Palavra, type Transacao } from "../comum";
import { corta, ordenarPor, re, strip } from "../py";
import type { Leitor } from "./tipos";

const VALOR = re("^-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}$");
const DATA = re("^\\d{2}-\\d{2}-\\d{4}$");

const ASSINATURA = re("\\bdata\\b.*\\bdescri[çc][ãa]o\\b.*\\bid da opera[çc][ãa]o\\b.*\\bvalor\\b.*\\bsaldo\\b", "i");
const ESPACOS = re("\\s+");

type Colunas = { xData: number; xDescricao: number; xId: number; valor: number; saldo: number };

function lerCabecalho(linhas: readonly (readonly Palavra[])[]): Colunas | null {
  for (const palavras of linhas) {
    const textos = palavras.map((p) => p.text.toLowerCase());
    if (!textos.includes("data") || !textos.includes("valor") || !textos.includes("saldo")) continue;
    if (!textos.some((t) => t.startsWith("descri"))) continue;
    return {
      xData: palavras[textos.indexOf("data")].x0,
      xDescricao: palavras[textos.findIndex((t) => t.startsWith("descri"))].x0,
      // "ID da operação" fica entre a descrição e o valor. É identificador interno, não a
      // contraparte: deixá-lo no histórico só empurra o nome para fora do limite de 200.
      xId: textos.includes("id") ? palavras[textos.indexOf("id")].x0 : 1e9,
      valor: palavras[textos.indexOf("valor")].x1,
      saldo: palavras[textos.indexOf("saldo")].x1,
    };
  }
  return null;
}

export const mercadopago: Leitor = {
  nome: "mercadopago",
  siglas: new Set(["MERCADOPAGO", "MERCADO PAGO", "323"]),
  reconhece: (linhas) => linhas.some((l) => ASSINATURA.search(l) !== null),
  extrairDePalavras(paginas, referenciaAno) {
    let transacoes: Transacao[] = [];
    let idx = 0;
    // O cabeçalho da tabela não se repete em toda página: as colunas valem até a próxima página
    // que traga um cabeçalho próprio (pular a página perdia dias de lançamentos).
    let colunas: Colunas | null = null;

    for (const palavras of paginas) {
      const linhas = agruparLinhas(palavras);
      colunas = lerCabecalho(linhas) ?? colunas;
      if (colunas === null) continue;

      // `min(..., default=0.0)` dos topos das linhas que são cabeçalho.
      const topos = linhas.filter((linha) => lerCabecalho([linha]) !== null).map((linha) => linha[0].top);
      const topoCabecalho = topos.length ? Math.min(...topos) : 0.0;

      const ancoras: [number, number][] = [];
      const fragmentos: [number, string][] = [];

      for (const linha of linhas) {
        const topo = linha[0].top;
        if (topo <= topoCabecalho) continue;

        let dataLida: string | null = null;
        const descricao: string[] = [];
        let numeros: [number, Dec][] = [];

        for (const palavra of linha) {
          const texto = palavra.text;
          const { x0, x1 } = palavra;

          if (DATA.match(texto) && Math.abs(x0 - colunas.xData) <= 8) {
            dataLida = parseData(texto, referenciaAno);
            continue;
          }
          if (texto === "R$" || texto === "$") continue;
          if (VALOR.match(texto)) {
            const convertido = parseValor(texto);
            if (convertido !== null) numeros.push([x1, convertido]);
            continue;
          }
          if (colunas.xDescricao - 3 <= x0 && x0 < colunas.xId - 3) descricao.push(texto);
        }

        const textoDescricao = strip(ESPACOS.sub(" ", descricao.join(" ")));

        // Linha de dados: tem data e os dois números (valor e saldo), nessa ordem da esquerda para
        // a direita.
        if (dataLida === null || numeros.length < 2) {
          if (textoDescricao) fragmentos.push([topo, textoDescricao]);
          continue;
        }

        numeros = ordenarPor(numeros, (par) => par[0]);
        const valor = numeros[numeros.length - 2][1];
        const saldo = numeros[numeros.length - 1][1];
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
    return [bloco(transacoes)];
  },
};
