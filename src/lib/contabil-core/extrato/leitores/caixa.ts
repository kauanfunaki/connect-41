// Porte de `extrato/bancos/caixa.py`: Caixa, três layouts lidos pelas palavras com posição.
//
// - "Extrato" (Data/Hora): cada lançamento é uma linha visual partida em três alturas a ~4,6 pontos
//   (data, valor/saldo, hora); o seguinte vem a ~25. Por isso o agrupamento usa 12 pontos. O sinal
//   é uma letra D/C separada do número, ~6 pontos à direita; sem ela o valor não tem leitura.
// - "Extrato por período" (Data Mov.): uma linha por lançamento, com D/C no valor e no saldo; só o
//   cabeçalho muda, o corpo é o mesmo do layout acima.
// - "Gerenciador CAIXA": o sinal é um `-` solto na coluna de valor, a célula quebra em duas alturas
//   e o saldo vem sem sinal (ver `orientarSaldos`).
//
// `SALDO DIA` fecha o dia e não é lançamento. Linha cujo saldo impresso repete o da anterior não
// movimentou a conta (cheque depositado e ainda bloqueado): fica de fora, ou o valor entraria duas
// vezes, no depósito e no desbloqueio.

import { cmp } from "@/lib/revisao-contabil/motor/py";
import { compara, dec, ehZero, igual, modulo, oposto, soma, subtrai, type Dec } from "../../motor/decimal";
import { agruparLinhas, bloco, bordaDireita, gerarFitid, parseData, parseValor, type Bloco, type Palavra, type Transacao } from "../comum";
import { corta, len, re, strip } from "../py";
import type { Leitor } from "./tipos";

// A Caixa parte o lançamento em três alturas a ~4,6 pontos; o seguinte vem a ~25.
const ALTURA_DO_LANCAMENTO = 12.0;
const TOLERANCIA_COLUNA = 16.0;
// Distância máxima entre o número e a letra D/C que lhe dá o sinal.
const DISTANCIA_DA_LETRA = 22.0;

const VALOR = re("^\\d{1,3}(?:\\.\\d{3})*,\\d{2}$");
const DATA = re("^\\d{2}/\\d{2}/\\d{4}$");
const HORA = re("^\\d{2}:\\d{2}:\\d{2}$");
const ESPACOS = re("\\s+");

const ASSINATURA = re("\\bdata/hora\\b.*\\bdoc\\b.*\\bdescri[çc][ãa]o.*\\bvalor\\b.*\\bsaldo\\b", "i");

type Colunas = { xData: number; xDescricao: number; valor: number; saldo: number };

/** A coluna (valor ou saldo) cuja borda direita está mais perto de `x1`, dentro da tolerância. */
function qual(colunas: Colunas, x1: number): "valor" | "saldo" | null {
  let melhor: "valor" | "saldo" | null = null;
  let distancia = TOLERANCIA_COLUNA;
  for (const [nome, borda] of [["valor", colunas.valor], ["saldo", colunas.saldo]] as const) {
    const d = Math.abs(x1 - borda);
    if (d < distancia) {
      melhor = nome;
      distancia = d;
    }
  }
  return melhor;
}

function lerCabecalho(linhas: readonly (readonly Palavra[])[]): Colunas | null {
  for (const palavras of linhas) {
    const textos = palavras.map((p) => p.text.toLowerCase());
    if (!textos.some((t) => t.startsWith("data/hora"))) continue;
    if (!textos.some((t) => t.startsWith("descri"))) continue;
    const valor = bordaDireita(textos, palavras, "valor");
    const saldo = bordaDireita(textos, palavras, "saldo");
    if (valor === null || saldo === null) continue;
    return {
      xData: palavras[textos.findIndex((t) => t.startsWith("data/hora"))].x0,
      xDescricao: palavras[textos.findIndex((t) => t.startsWith("descri"))].x0,
      valor,
      saldo,
    };
  }
  return null;
}

// O "Gerenciador CAIXA" não tem `Data/Hora`: as duas datas viram colunas próprias e o cabeçalho
// quebra em alturas. O que sobra numa linha só são as quatro colunas do meio — e
// `Valor(R$)`/`Saldo(R$)` sem espaço é marca dele.
const ASSINATURA_GERENCIADOR = re("\\bdocumento\\b.*\\bhist[óo]rico\\b.*\\bvalor\\(r\\$\\).*\\bsaldo\\(r\\$\\)", "i");

// Layout "Extrato por período": uma linha por lançamento e a letra D/C no valor e no saldo. Não
// ganha corpo próprio — só o cabeçalho muda; duplicar a extração seria criar dois lugares para o
// mesmo erro.
const ASSINATURA_PERIODO = re("\\bdata\\s+mov\\.\\s+nr\\.\\s+doc\\..*\\bhist[óo]rico\\b.*\\bvalor\\b.*\\bsaldo\\b", "i");

function lerCabecalhoPeriodo(linhas: readonly (readonly Palavra[])[]): Colunas | null {
  for (const palavras of linhas) {
    const textos = palavras.map((p) => p.text.toLowerCase());
    if (!textos.includes("data") || !textos.includes("mov.")) continue;
    if (!textos.some((t) => t.startsWith("hist"))) continue;
    const valor = bordaDireita(textos, palavras, "valor");
    const saldo = bordaDireita(textos, palavras, "saldo");
    if (valor === null || saldo === null) continue;
    return {
      xData: palavras[textos.indexOf("data")].x0,
      xDescricao: palavras[textos.findIndex((t) => t.startsWith("hist"))].x0,
      valor,
      saldo,
    };
  }
  return null;
}

/** Os dois layouts que trazem a letra D/C, por qualquer um dos cabeçalhos. */
function lerCabecalhoComLetra(linhas: readonly (readonly Palavra[])[]): Colunas | null {
  return lerCabecalho(linhas) ?? lerCabecalhoPeriodo(linhas);
}

/** A letra D/C mais próxima à direita do número, dentro do alcance (`min` da tupla distância, letra). */
function sinalADireita(x1: number, letras: readonly [number, string][]): string | null {
  let melhor: [number, string] | null = null;
  for (const [x0, letra] of letras) {
    const d = x0 - x1;
    if (!(d >= 0 && d <= DISTANCIA_DA_LETRA)) continue;
    if (melhor === null || d < melhor[0] || (d === melhor[0] && cmp(letra, melhor[1]) < 0)) melhor = [d, letra];
  }
  return melhor === null ? null : melhor[1];
}

// ─── Layout "Gerenciador CAIXA" ─────────────────────────────────────────────
//
//     Data de      Data de                                    Valor(R$)   Saldo(R$)
//     lançamento   movimento   Documento  Histórico
//     02/02/2026   02/02/2026  0          DEBITO DE IOF        - 197,96   R$ 63.725,71
//
// O sinal é um `-` solto na coluna de valor (às vezes numa altura acima do número), a célula de
// histórico quebra e o saldo não traz sinal nenhum.

const ALTURA_DO_GERENCIADOR = 14.0;
const TOLERANCIA_CADEIA = dec("0.05");
const MENOS = re("^[-–—]$");

function lerCabecalhoGerenciador(linhas: readonly (readonly Palavra[])[]): Colunas | null {
  for (const palavras of linhas) {
    const textos = palavras.map((p) => p.text.toLowerCase());
    if (!textos.includes("documento") || !textos.some((t) => t.startsWith("hist"))) continue;
    if (!textos.includes("data")) continue;
    const valor = bordaDireita(textos, palavras, "valor");
    const saldo = bordaDireita(textos, palavras, "saldo");
    if (valor === null || saldo === null) continue;
    return {
      // Duas colunas de data, lançamento e movimento. A primeira é a de lançamento, que é a que
      // o razão usa.
      xData: palavras[textos.indexOf("data")].x0,
      xDescricao: palavras[textos.findIndex((t) => t.startsWith("hist"))].x0,
      valor,
      saldo,
    };
  }
  return null;
}

/** Os saldos impressos caminham com os valores, de âncora a âncora? */
function cadeiaFecha(transacoes: readonly Transacao[]): boolean {
  let anterior: Dec | null = null;
  let acumulado = dec("0");
  let viuPar = false;
  for (const transacao of transacoes) {
    acumulado = soma(acumulado, transacao.valor);
    if (transacao.saldoApos === null) continue;
    if (anterior !== null) {
      viuPar = true;
      if (compara(modulo(subtrai(subtrai(transacao.saldoApos, anterior), acumulado)), TOLERANCIA_CADEIA) > 0) return false;
    }
    anterior = transacao.saldoApos;
    acumulado = dec("0");
  }
  return viuPar;
}

/**
 * Descobre o SINAL do saldo, que este extrato não imprime: a conta no vermelho sai em módulo, e um
 * débito faz o número crescer. As duas leituras são TESTADAS contra a cadeia e vale a que caminha;
 * se as duas caminham ou nenhuma, nada é invertido e a conferência lá na frente recusa.
 */
function orientarSaldos(transacoes: Transacao[]): Transacao[] {
  if (cadeiaFecha(transacoes)) return transacoes;
  const invertidas = transacoes.map((t) => ({ ...t, saldoApos: t.saldoApos !== null ? oposto(t.saldoApos) : null }));
  return cadeiaFecha(invertidas) ? invertidas : transacoes;
}

function extrairGerenciador(paginas: readonly (readonly Palavra[])[], referenciaAno: number): Bloco[] {
  const transacoes: Transacao[] = [];
  let idx = 0;
  let colunas: Colunas | null = null;

  for (const palavras of paginas) {
    const linhas = agruparLinhas(palavras, ALTURA_DO_GERENCIADOR);
    colunas = lerCabecalhoGerenciador(linhas) ?? colunas;
    if (colunas === null) continue;

    for (const linha of linhas) {
      if (lerCabecalhoGerenciador([linha]) !== null) continue;

      let dataLida: string | null = null;
      // (altura, x0, texto): a célula de histórico quebra em duas alturas — ordenar só pelo x0
      // embaralharia as duas metades.
      const descricao: [number, number, string][] = [];
      let valor: Dec | null = null;
      let saldo: Dec | null = null;
      let negativo = false;

      for (const palavra of linha) {
        const texto = palavra.text;
        const x0 = palavra.x0;
        const x1 = palavra.x1;

        if (DATA.match(texto)) {
          // Só a PRIMEIRA coluna de data; a de movimento é ignorada.
          if (Math.abs(x0 - colunas.xData) <= 8 && dataLida === null) dataLida = parseData(texto, referenciaAno);
          continue;
        }
        if (MENOS.match(texto) && x1 >= colunas.valor - 60) {
          // O `-` mora na coluna de valor, à esquerda do número ou numa altura acima dele.
          negativo = true;
          continue;
        }
        if (VALOR.match(texto)) {
          const convertido = parseValor(texto);
          if (convertido === null) continue;
          if (Math.abs(x1 - colunas.valor) <= TOLERANCIA_COLUNA) valor = modulo(convertido);
          else if (Math.abs(x1 - colunas.saldo) <= TOLERANCIA_COLUNA) saldo = convertido;
          continue;
        }
        if (x0 >= colunas.xDescricao - 3 && x0 < colunas.valor - 40) descricao.push([palavra.top, x0, texto]);
      }

      // `sorted()` da tupla (altura, x0, texto).
      const ordenada = [...descricao].sort((a, b) => a[0] - b[0] || a[1] - b[1] || cmp(a[2], b[2]));
      const textoDescricao = strip(ESPACOS.sub(" ", ordenada.map((d) => d[2]).join(" ")));
      if (dataLida === null || valor === null) continue;
      // `SALDO DIA` fecha o dia com valor 0,00: não é lançamento.
      if (ehZero(valor) || textoDescricao.toUpperCase().startsWith("SALDO DIA")) continue;

      const movimento = negativo ? oposto(valor) : valor;
      const historico = corta(textoDescricao, 200) || "SEM DESCRIÇÃO";
      transacoes.push({
        fitid: gerarFitid(dataLida, historico, movimento, idx),
        data: dataLida,
        valor: movimento,
        historico,
        tipoOfx: !movimento.negativo && !ehZero(movimento) ? "CREDIT" : "DEBIT",
        saldoApos: saldo,
        ordem: idx,
      });
      idx++;
    }
  }

  if (!transacoes.length) return [];
  return [bloco(orientarSaldos(transacoes))];
}

export const caixa: Leitor = {
  nome: "caixa",
  siglas: new Set(["CAIXA", "CEF", "104"]),
  reconhece: (linhas) =>
    linhas.some((l) => ASSINATURA.search(l) !== null || ASSINATURA_GERENCIADOR.search(l) !== null || ASSINATURA_PERIODO.search(l) !== null),
  extrairDePalavras(paginas, referenciaAno) {
    for (const palavras of paginas) {
      if (lerCabecalhoGerenciador(agruparLinhas(palavras, ALTURA_DO_GERENCIADOR)) !== null) {
        return extrairGerenciador(paginas, referenciaAno);
      }
    }

    const transacoes: Transacao[] = [];
    let idx = 0;
    let colunas: Colunas | null = null;
    let ultimoSaldo: Dec | null = null;

    for (const palavras of paginas) {
      const linhas = agruparLinhas(palavras, ALTURA_DO_LANCAMENTO);
      colunas = lerCabecalhoComLetra(linhas) ?? colunas;
      if (colunas === null) continue;

      for (const linha of linhas) {
        if (lerCabecalhoComLetra([linha]) !== null) continue;

        let dataLida: string | null = null;
        const descricao: string[] = [];
        const numeros: [number, "valor" | "saldo", Dec][] = [];
        const letras: [number, string][] = [];

        for (const palavra of linha) {
          const texto = palavra.text;
          const x0 = palavra.x0;
          const x1 = palavra.x1;

          if (DATA.match(texto) && Math.abs(x0 - colunas.xData) <= 10) {
            dataLida = parseData(texto, referenciaAno);
            continue;
          }
          // Mesma coluna da data; o extrato é conciliado por dia.
          if (HORA.match(texto)) continue;
          const maiuscula = texto.toUpperCase();
          if ((maiuscula === "D" || maiuscula === "C") && len(texto) === 1) {
            letras.push([x0, maiuscula]);
            continue;
          }
          if (VALOR.match(texto)) {
            const coluna = qual(colunas, x1);
            const convertido = parseValor(texto);
            if (coluna && convertido !== null) {
              numeros.push([x1, coluna, convertido]);
              continue;
            }
          }
          if (x0 >= colunas.xDescricao - 3) descricao.push(texto);
        }

        const textoDescricao = strip(ESPACOS.sub(" ", descricao.join(" ")));
        // Fecha o dia repetindo o saldo da última linha: não é lançamento e não acrescenta âncora.
        if (textoDescricao.toUpperCase().startsWith("SALDO DIA")) continue;

        let valor: Dec | null = null;
        let saldo: Dec | null = null;
        for (const [x1, coluna, bruto] of numeros) {
          const letra = sinalADireita(x1, letras);
          if (letra === null) continue;
          const comSinal = letra === "D" ? oposto(modulo(bruto)) : modulo(bruto);
          if (coluna === "valor") valor = comSinal;
          else saldo = comSinal;
        }

        if (valor === null || ehZero(valor) || dataLida === null) continue;

        // Linha que não moveu o saldo: dinheiro depositado e ainda não liberado. Ele volta como
        // lançamento próprio quando desbloqueia — importar os dois dobraria o valor.
        if (saldo !== null && ultimoSaldo !== null && igual(saldo, ultimoSaldo)) continue;
        if (saldo !== null) ultimoSaldo = saldo;

        const historico = corta(textoDescricao, 200) || "SEM DESCRIÇÃO";
        transacoes.push({
          fitid: gerarFitid(dataLida, historico, valor, idx),
          data: dataLida,
          valor,
          historico,
          tipoOfx: !valor.negativo && !ehZero(valor) ? "CREDIT" : "DEBIT",
          saldoApos: saldo,
          ordem: idx,
        });
        idx++;
      }
    }

    if (!transacoes.length) return [];
    return [bloco(transacoes)];
  },
};
