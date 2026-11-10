// Porte de `extrato/bancos/sicredi.py`: extrato de conta corrente do Sicredi, em dois layouts.
//
// O relatório da cooperativa tem três colunas numéricas (DEBITO, CREDITO, SALDO) e a maioria das
// linhas traz um número só: no texto achatado, débito e crédito são indistinguíveis, e só a posição
// diz. As colunas são alinhadas à direita e as bordas saem do próprio cabeçalho. A abertura vem em
// "S A L D O  A N T E R I O R", com as letras separadas, por isso é reconhecida sem os espaços.
//
// O outro layout ("Data Descrição Documento Valor (R$) Saldo (R$)", o mais comum na base) tem uma
// coluna de valor, com o sinal nele, e é lido por texto em `extrairValorESaldo`.

import { ehZero, modulo, oposto, type Dec } from "../../motor/decimal";
import { agruparLinhas, bloco, bordaDireita, gerarFitid, parseData, parseValor, type Bloco, type Palavra, type Transacao } from "../comum";
import { corta, re, split, strip } from "../py";
import type { Leitor } from "./tipos";

const VALOR = re("^-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}$");
const DATA = re("^\\d{2}/\\d{2}/\\d{4}$");
const TOLERANCIA_COLUNA = 14.0;

const ASSINATURA = re("\\bdata\\b.*\\bdocumento\\b.*\\bhistorico\\b.*\\bdebito\\b.*\\bcredito\\b.*\\bsaldo\\b", "i");
const ESPACOS = re("\\s+");
const ESPACOS_E_ASTERISCOS = re("[\\s*]+");

type NomeColuna = "debito" | "credito" | "saldo";

type Colunas = {
  xData: number;
  xDocumento: number;
  debito: number;
  credito: number;
  saldo: number;
};

/** A coluna numérica cuja borda direita está mais perto de `x1`, dentro da tolerância. */
function qual(colunas: Colunas, x1: number): NomeColuna | null {
  let melhor: NomeColuna | null = null;
  let distancia = TOLERANCIA_COLUNA;
  for (const [nome, borda] of [
    ["debito", colunas.debito],
    ["credito", colunas.credito],
    ["saldo", colunas.saldo],
  ] as const) {
    const d = Math.abs(x1 - borda);
    if (d < distancia) {
      melhor = nome;
      distancia = d;
    }
  }
  return melhor;
}

const ROTULOS_CABECALHO = ["data", "documento", "historico", "debito", "credito", "saldo"];

function lerCabecalho(linhas: readonly (readonly Palavra[])[]): Colunas | null {
  for (const palavras of linhas) {
    const textos = palavras.map((p) => p.text.toLowerCase());
    if (!ROTULOS_CABECALHO.every((r) => textos.includes(r))) continue;
    const debito = bordaDireita(textos, palavras, "debito");
    const credito = bordaDireita(textos, palavras, "credito");
    const saldo = bordaDireita(textos, palavras, "saldo");
    if (debito === null || credito === null || saldo === null) continue;
    return {
      xData: Number(palavras[textos.indexOf("data")].x0),
      xDocumento: Number(palavras[textos.indexOf("documento")].x0),
      debito,
      credito,
      saldo,
    };
  }
  return null;
}

// ─── Segundo layout: uma coluna de valor com sinal ──────────────────────────

// A descrição é OPCIONAL: quando o texto é longo, ele quebra inteiro em volta e a linha de dados fica
// só com data, valor e saldo (`13/10/2025 -407,50 1.546,50`).
const LINHA_VALOR_SALDO = re(
  "^(\\d{2}/\\d{2}/\\d{4})\\s+(.*?)\\s*(-?\\d{1,3}(?:\\.\\d{3})*,\\d{2})" + "\\s+(-?\\d{1,3}(?:\\.\\d{3})*,\\d{2})\\s*$",
);
// Os dois rótulos de abertura vistos na base: "SALDO ANTERIOR" e "SALDO" seco.
const SALDO_ANTERIOR_SIMPLES = re("^SALDO(?:\\s+ANTERIOR)?\\s+(-?\\d{1,3}(?:\\.\\d{3})*,\\d{2})\\s*$", "i");

// Depois do último lançamento vem "Lançamentos Futuros (Próximos 30 dias)": débitos AGENDADOS, sem
// coluna de saldo. Lidos como realizados, quebravam a cadeia (e, sem ela, entrariam no razão como se
// tivessem ocorrido). O corte é por marca explícita, não por heurística de "linha estranha no fim".
const FIM_DO_EXTRATO = re("Lan[çc]amentos\\s+Futuros", "i");

const IGNORAR_VALOR_SALDO = re(
  "^(Data\\s+Descri|Associado:|Cooperativa:|Conta:|Extrato\\s*\\(|" +
    "Valores das opera|Sicredi Fone|SAC\\s|Ouvidoria|0800\\s|\\d{4}\\s\\d{4})",
  "i",
);

/**
 * Layout `Data Descrição Documento Valor (R$) Saldo (R$)`, lido por texto: há UMA coluna de valor e
 * o sinal está no próprio número.
 */
function extrairValorESaldo(linhas: readonly string[], referenciaAno: number): Bloco[] {
  const limpas = linhas.map((l) => strip(l));
  const transacoes: Transacao[] = [];
  let saldoAnterior: Dec | null = null;
  let idx = 0;

  // Linha solta já usada por um lançamento não pode ser usada por outro: a segunda linha de dados sem
  // descrição roubaria a contraparte da primeira.
  const consumidas = new Set<number>();

  const ehEstrutural = (i: number): boolean => {
    if (!(i >= 0 && i < limpas.length) || !limpas[i]) return true;
    return Boolean(
      LINHA_VALOR_SALDO.match(limpas[i]) ||
        SALDO_ANTERIOR_SIMPLES.match(limpas[i]) ||
        IGNORAR_VALOR_SALDO.match(limpas[i]) ||
        // O cabeçalho da seção de agendados fecha o extrato: sem isto seria colado como contraparte.
        FIM_DO_EXTRATO.search(limpas[i]),
    );
  };

  const textoSolto = (i: number): string => {
    if (ehEstrutural(i) || consumidas.has(i)) return "";
    consumidas.add(i);
    return limpas[i];
  };

  for (let i = 0; i < limpas.length; i++) {
    const limpa = limpas[i];
    if (!limpa) continue;

    if (FIM_DO_EXTRATO.search(limpa)) break;

    if (saldoAnterior === null) {
      const abertura = SALDO_ANTERIOR_SIMPLES.match(limpa);
      if (abertura) {
        saldoAnterior = parseValor(abertura[1]!);
        continue;
      }
    }

    if (IGNORAR_VALOR_SALDO.match(limpa)) continue;

    const casada = LINHA_VALOR_SALDO.match(limpa);
    if (!casada) continue;

    const [dataStr, meioBruto, valorStr, saldoStr] = casada.grupos;
    const dataLida = parseData(dataStr!, referenciaAno);
    const valor = parseValor(valorStr!);
    const saldo = parseValor(saldoStr!);
    if (dataLida === null || valor === null || ehZero(valor)) continue;

    const meio = strip(ESPACOS.sub(" ", meioBruto!));
    let historico: string;
    // Descrição longa quebra em volta da linha de dados, e no meio sobra só a coluna Documento
    // (`PIX_DEB`) ou nada. Colar SEMPRE erraria: o texto solto fica adjacente também ao lançamento
    // seguinte, que roubaria a contraparte do vizinho. Duas ou mais palavras no meio = descrição completa.
    if (split(meio).length < 2) {
      const acima = textoSolto(i - 1);
      const abaixo = textoSolto(i + 1);
      // A ordem reproduz a da linha inteira: descrição e, no fim, o documento.
      historico = strip([acima, abaixo, meio].filter(Boolean).join(" "));
    } else {
      historico = meio;
    }
    historico = corta(ESPACOS.sub(" ", historico), 200) || "SEM DESCRIÇÃO";
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

  if (!transacoes.length) return [];
  return [bloco(transacoes, saldoAnterior)];
}

export const sicredi: Leitor = {
  nome: "sicredi",
  siglas: new Set(["SICREDI", "748"]),
  reconhece: (linhas) => linhas.some((l) => ASSINATURA.search(l) !== null),
  extrairDePalavras(paginas, referenciaAno) {
    const transacoes: Transacao[] = [];
    let saldoAnterior: Dec | null = null;
    let idx = 0;
    let colunas: Colunas | null = null;

    for (const palavras of paginas) {
      const linhas = agruparLinhas(palavras);
      colunas = lerCabecalho(linhas) ?? colunas;
      if (colunas === null) continue;

      for (const linha of linhas) {
        let dataLida: string | null = null;
        const descricao: string[] = [];
        const valores = new Map<NomeColuna, Dec>();

        for (const palavra of linha) {
          const texto = palavra.text;
          const x0 = Number(palavra.x0);
          const x1 = Number(palavra.x1);

          if (DATA.match(texto) && Math.abs(x0 - colunas.xData) <= 14) {
            dataLida = parseData(texto, referenciaAno);
            continue;
          }
          if (VALOR.match(texto)) {
            const coluna = qual(colunas, x1);
            if (coluna) {
              const convertido = parseValor(texto);
              if (convertido !== null) valores.set(coluna, convertido);
              continue;
            }
          }
          if (x0 >= colunas.xDocumento - 3) descricao.push(texto);
        }

        const textoDescricao = strip(descricao.join(" "));
        // As letras vêm separadas ("S A L D O  A N T E R I O R").
        const compacto = ESPACOS_E_ASTERISCOS.sub("", textoDescricao).toUpperCase();

        if (compacto.startsWith("SALDOANTERIOR")) {
          if (valores.has("saldo") && saldoAnterior === null) saldoAnterior = valores.get("saldo")!;
          continue;
        }

        let valor: Dec;
        const debito = valores.get("debito");
        const credito = valores.get("credito");
        if (debito !== undefined) valor = oposto(modulo(debito));
        else if (credito !== undefined) valor = modulo(credito);
        else continue;

        if (ehZero(valor) || dataLida === null) continue;

        const historico = corta(ESPACOS.sub(" ", textoDescricao), 200) || "SEM DESCRIÇÃO";
        transacoes.push({
          fitid: gerarFitid(dataLida, historico, valor, idx),
          data: dataLida,
          valor,
          historico,
          tipoOfx: !valor.negativo && !ehZero(valor) ? "CREDIT" : "DEBIT",
          saldoApos: valores.get("saldo") ?? null,
          ordem: idx,
        });
        idx++;
      }
    }

    if (!transacoes.length) {
      // O outro layout do banco. As palavras já estão na mão: agrupá-las de volta em linhas custa
      // menos que uma segunda leitura do PDF.
      const linhasTexto = paginas.flatMap((palavras) => agruparLinhas(palavras).map((linha) => linha.map((p) => p.text).join(" ")));
      return extrairValorESaldo(linhasTexto, referenciaAno);
    }
    return [bloco(transacoes, saldoAnterior)];
  },
};
