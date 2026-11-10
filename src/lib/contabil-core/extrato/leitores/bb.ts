// Porte de `extrato/bancos/bb.py`: Banco do Brasil, lido pelas palavras com posição. Três layouts:
//
// - **A, "Dt. balancete"**: uma linha por lançamento, coluna de saldo e o sinal na letra `D`/`C` à
//   direita do número. O complemento vem abaixo, a ~11,8 pontos (a mesma distância do lançamento
//   seguinte), então vale a altura padrão e o complemento é colado à parte.
// - **B, "Dia Lote"**: cada lançamento partido em TRÊS alturas (a ~5,3 uma da outra; o grupo
//   seguinte a ~20, por isso a altura de 14), sinal `(-)`/`(+)` e nenhuma coluna de saldo: o saldo
//   sai em linhas `Saldo do dia` com data `00/00/0000` (a data inválida é do MARCADOR, não de um
//   lançamento), e cada uma vira âncora do último lançamento lido.
// - **C, Painel PJ**: impressão da tela; o sinal é o `-` colado no `R$` ANTES do número, e o saldo
//   sai só na última linha do dia.
//
// Nos três, `Saldo Anterior` abre a cadeia.

import { ehZero, modulo, type Dec } from "../../motor/decimal";
import { agruparLinhas, bloco, bordaDireita, gerarFitid, parseData, parseValor, type Bloco, type Palavra, type Transacao } from "../comum";
import { corta, re, strip } from "../py";
import type { Leitor } from "./tipos";

const VALOR = re("^\\d{1,3}(?:\\.\\d{3})*,\\d{2}$");
const DATA = re("^\\d{2}/\\d{2}/\\d{4}$");
const SINAL_PARENTESES = re("^\\(([+-])\\)$");
const ESPACOS = re("\\s+");

const TOLERANCIA_COLUNA = 16.0;
const DISTANCIA_DA_LETRA = 26.0;
// No layout B as três alturas de um lançamento ficam a ~5,3 e o grupo seguinte a ~20: 14 junta as
// três sem alcançar o de baixo.
const ALTURA_DIA_LOTE = 14.0;

const ASSINATURA_BALANCETE = re("\\bdt\\.?\\s*balancete\\b.*\\bhist[óo]rico\\b.*\\bvalor\\b", "i");
const ASSINATURA_DIA_LOTE = re("^\\s*Dia\\s+Lote\\s+Documento\\s+Hist[óo]rico\\s+Valor\\s*$", "i");

// Quando o cabeçalho vem empilhado, `Dt. balancete` se parte em duas alturas e nenhuma linha contém
// a assinatura inteira. O que sobra é a linha só com os dois rótulos de baixo, que sozinha poderia
// ser de qualquer documento contábil: vale como assinatura apenas ACOMPANHADA da linha de colunas.
const ASSINATURA_EMPILHADA = re("^\\s*balancete\\s+movimento\\s*$", "i");
// Painel PJ: os dois rótulos viram colunas próprias, na ordem inversa.
const ASSINATURA_PAINEL = re("\\bmovimento\\b.*\\bbalancete\\b.*\\bhist[óo]rico\\b.*\\bvalor\\b.*\\bsaldo\\b", "i");
const COLUNAS_DO_EXTRATO = re("\\bhist[óo]rico\\b.*\\bvalor\\b.*\\bsaldo\\b", "i");

/** Um caractere de palavra (`extract_words(return_chars=True)`). */
type Caractere = { text: string; x0: number; x1: number; [extra: string]: unknown };

type Colunas = { xData: number; xHistorico: number; valor: number; saldo: number; documento: number | null };
type ColunasDiaLote = { xData: number; xHistorico: number; valor: number };
type Marca = [posicao: number, sinal: number];

/** `min(candidatas)[1]` do Python: a tupla compara a distância e, no empate, o sinal (o -1 ganha). */
function menorCandidata(candidatas: readonly Marca[]): number | null {
  if (!candidatas.length) return null;
  let melhor = candidatas[0];
  for (const c of candidatas) if (c[0] < melhor[0] || (c[0] === melhor[0] && c[1] < melhor[1])) melhor = c;
  return melhor[1];
}

/** O marcador de sinal mais próximo à direita do número. */
function sinalADireita(x1: number, marcas: readonly Marca[]): number | null {
  return menorCandidata(marcas.filter(([x0]) => 0 <= x0 - x1 && x0 - x1 <= DISTANCIA_DA_LETRA).map(([x0, sinal]): Marca => [x0 - x1, sinal]));
}

/**
 * `abs(bruto) * sinal`: a multiplicação do Decimal leva o sinal mesmo quando o valor é zero
 * (`Decimal("0.00") * -1` dá `-0.00`), diferente do `oposto`.
 */
function comSinal(bruto: Dec, sinal: number): Dec {
  return { ...modulo(bruto), negativo: sinal < 0 };
}

/** `"".join(c["text"] for c in grupo)` */
const textoDe = (grupo: readonly Caractere[]) => grupo.map((c) => c.text).join("");

// `2.259,65 C4.242,55 D`: quando o valor e o saldo ficam colados, o pdfplumber devolve a letra do
// sinal grudada no número seguinte. O token não é número nem letra, e o saldo se perdia.
const LETRA_COLADA = re("^([DC])(\\d{1,3}(?:\\.\\d{3})*,\\d{2})$");
// Largura aproximada da letra, para devolver ao número a borda direita que identifica a coluna.
const LARGURA_DA_LETRA = 6.0;
// Um valor como `12.376,74` ocupa ~30 pontos; 40 cobre a coluna inteira com folga e ainda fica
// muito à direita da coluna de descrição.
const LARGURA_DA_COLUNA_NUMERICA = 40.0;

/**
 * Desgruda a letra do sinal do número que veio atrás dela. As palavras novas levam só texto,
 * `x0`, `x1` e `top` no original; o `bottom` vai junto aqui só para caber no tipo (ninguém o lê).
 */
function separarLetraColada(palavras: readonly Palavra[]): Palavra[] {
  const resultado: Palavra[] = [];
  for (const palavra of palavras) {
    const casada = LETRA_COLADA.match(palavra.text);
    if (!casada) {
      resultado.push(palavra);
      continue;
    }
    const x0 = Number(palavra.x0);
    const x1 = Number(palavra.x1);
    resultado.push({ text: casada[1]!, x0, x1: x0 + LARGURA_DA_LETRA, top: palavra.top, bottom: palavra.bottom });
    resultado.push({ text: casada[2]!, x0: x0 + LARGURA_DA_LETRA, x1, top: palavra.top, bottom: palavra.bottom });
  }
  return resultado;
}

// ─── layout A: balancete ────────────────────────────────────────────────────

// O cabeçalho do balancete nem sempre cabe numa altura só: na exportação "Consultas - Extrato de
// conta corrente" ele vem empilhado em TRÊS (`Dt.` / `Ag. origem ... Valor R$ Saldo` /
// `balancete movimento`), a 4 pontos um do outro. Exigir tudo na MESMA linha fazia o leitor
// reconhecer o banco e extrair zero lançamentos.
const ALTURA_DO_CABECALHO = 10.0;

function colunasBalancete(linhas: readonly (readonly Palavra[])[]): Colunas | null {
  for (let indice = 0; indice < linhas.length; indice++) {
    const palavras = linhas[indice];
    const textos = palavras.map((p) => p.text.toLowerCase());
    if (!textos.includes("valor") || !textos.includes("saldo")) continue;
    if (!textos.some((t) => t.startsWith("hist"))) continue;
    const valor = bordaDireita(textos, palavras, "valor");
    const saldo = bordaDireita(textos, palavras, "saldo");
    if (valor === null || saldo === null) continue;

    // `balancete` ancora a coluna de data. Ele pode estar nesta linha ou na de cima/de baixo,
    // quando o cabeçalho vem empilhado.
    const balancete = palavraVizinha(linhas, indice, "balancete");
    if (balancete === null) continue;

    return {
      xData: Number(balancete.x0) - 15,
      xHistorico: Number(palavras[textos.findIndex((t) => t.startsWith("hist"))].x0),
      valor,
      saldo,
      documento: bordaDireita(textos, palavras, "documento"),
    };
  }
  return null;
}

// O BB numera o histórico, e o número cai DENTRO da coluna de descrição (`500 BB GIRO PRONAMPE`,
// `000 Saldo Anterior`). Além de sujar o histórico, ele quebrava a abertura da cadeia: o teste de
// `SALDO ANTERIOR` no início do texto não casava.
const CODIGO_DO_HISTORICO = re("^\\d{1,4}\\s+(?=\\D)");

/** `S A L D O`, com as letras soltas, é a linha de fecho do extrato. */
function ehLinhaDeFecho(texto: string): boolean {
  return texto.replaceAll(" ", "").toUpperCase() === "SALDO";
}

function limparCodigoDoHistorico(texto: string): string {
  return CODIGO_DO_HISTORICO.sub("", texto, 1);
}

/** Procura uma palavra na linha dada e nas que estão à altura do cabeçalho. */
function palavraVizinha(linhas: readonly (readonly Palavra[])[], indice: number, alvo: string): Palavra | null {
  const referencia = Number(linhas[indice][0].top);
  for (const outras of linhas) {
    if (Math.abs(Number(outras[0].top) - referencia) > ALTURA_DO_CABECALHO) continue;
    for (const palavra of outras) if (palavra.text.toLowerCase() === alvo) return palavra;
  }
  return null;
}

/**
 * Separa campos unidos pelo PDF usando os caracteres e a coluna Documento. Não adivinha quantos
 * dígitos pertencem ao documento: as coordenadas reais distinguem `9.903` de `141.586,23` mesmo
 * sem espaço no token.
 */
function separarDocumentoValor(palavras: readonly Palavra[], colunas: Colunas): Palavra[] {
  const limite = colunas.documento;
  if (limite === null) return [...palavras];
  const resultado: Palavra[] = [];
  for (const palavra of palavras) {
    const chars = (palavra.chars ?? []) as Caractere[];
    if (!chars.length || !palavra.text.includes(",") || !(palavra.x0 < limite && limite < palavra.x1)) {
      resultado.push(palavra);
      continue;
    }
    const documento = chars.filter((c) => Number(c.x0) < limite);
    const valor = chars.filter((c) => Number(c.x0) >= limite);
    if (!documento.length || !VALOR.fullmatch(textoDe(valor))) {
      resultado.push(palavra);
      continue;
    }
    for (const grupo of [documento, valor]) {
      resultado.push({ ...palavra, text: textoDe(grupo), x0: grupo[0].x0, x1: grupo[grupo.length - 1].x1, chars: grupo });
    }
  }
  return resultado;
}

/** `f"{alvo.historico} {texto}".strip()[:200]`: a linha de complemento vai para o lançamento de cima. */
function complementar(transacoes: Transacao[], textoDescricao: string): void {
  if (!textoDescricao || !transacoes.length) return;
  const alvo = transacoes[transacoes.length - 1];
  transacoes[transacoes.length - 1] = { ...alvo, historico: corta(strip(`${alvo.historico} ${textoDescricao}`), 200) };
}

function novaTransacao(data: string, textoDescricao: string, valor: Dec, saldo: Dec | null, idx: number): Transacao {
  const historico = corta(textoDescricao, 200) || "SEM DESCRIÇÃO";
  return {
    fitid: gerarFitid(data, historico, valor, idx),
    data,
    valor,
    historico,
    tipoOfx: !valor.negativo && !ehZero(valor) ? "CREDIT" : "DEBIT",
    saldoApos: saldo,
    ordem: idx,
  };
}

function extrairBalancete(paginas: readonly (readonly Palavra[])[], referenciaAno: number): Bloco[] {
  const transacoes: Transacao[] = [];
  let saldoAnterior: Dec | null = null;
  let saldoFinal: Dec | null = null;
  let idx = 0;
  let colunas: Colunas | null = null;

  for (const palavras of paginas) {
    let linhas = agruparLinhas(separarLetraColada(palavras));
    colunas = colunasBalancete(linhas) ?? colunas;
    if (colunas === null) continue;

    linhas = agruparLinhas(separarLetraColada(separarDocumentoValor(palavras, colunas)));

    for (const linha of linhas) {
      if (colunasBalancete([linha]) !== null) continue;

      let dataLida: string | null = null;
      const descricao: string[] = [];
      const numeros: [x1: number, nome: "valor" | "saldo", valor: Dec][] = [];
      const marcas: Marca[] = [];

      for (const palavra of linha) {
        const texto = palavra.text;
        const x0 = Number(palavra.x0);
        const x1 = Number(palavra.x1);

        if (DATA.match(texto) && Math.abs(x0 - colunas.xData) <= 14) {
          dataLida = parseData(texto, referenciaAno);
          continue;
        }
        // A letra do sinal mora à direita das colunas numéricas. Sem essa condição, QUALQUER `D` ou
        // `C` solto virava marcador, e a linha de fecho `S A L D O` perdia o próprio D.
        if (["D", "C"].includes(texto.toUpperCase()) && [...texto].length === 1 && x0 >= colunas.valor - LARGURA_DA_COLUNA_NUMERICA) {
          marcas.push([x0, texto.toUpperCase() === "D" ? -1 : 1]);
          continue;
        }
        if (VALOR.match(texto)) {
          let achou = false;
          for (const nome of ["valor", "saldo"] as const) {
            if (Math.abs(x1 - colunas[nome]) <= TOLERANCIA_COLUNA) {
              const convertido = parseValor(texto);
              if (convertido !== null) numeros.push([x1, nome, convertido]);
              achou = true;
              break;
            }
          }
          if (!achou && x0 >= colunas.xHistorico - 3) descricao.push(texto);
          continue;
        }
        if (x0 >= colunas.xHistorico - 3) descricao.push(texto);
      }

      const textoDescricao = limparCodigoDoHistorico(strip(ESPACOS.sub(" ", descricao.join(" "))));

      let valor: Dec | null = null;
      let saldo: Dec | null = null;
      for (const [x1, nome, bruto] of numeros) {
        const sinal = sinalADireita(x1, marcas);
        if (sinal === null) continue;
        if (nome === "valor") valor = comSinal(bruto, sinal);
        else saldo = comSinal(bruto, sinal);
      }

      if (textoDescricao.toUpperCase().startsWith("SALDO ANTERIOR")) {
        // O valor da abertura sai na coluna de saldo.
        if (saldoAnterior === null) saldoAnterior = saldo !== null ? saldo : valor;
        continue;
      }

      // O fecho do extrato vem com as letras SEPARADAS (`S A L D O`), numa linha de código de
      // histórico 999. Sem reconhecê-la, ela virava complemento do último lançamento e o bloco
      // ficava sem saldo final.
      if (ehLinhaDeFecho(textoDescricao)) {
        if (saldo !== null) saldoFinal = saldo;
        continue;
      }

      if (valor === null || ehZero(valor)) {
        // Linha de complemento: pertence ao lançamento de cima.
        complementar(transacoes, textoDescricao);
        continue;
      }
      if (dataLida === null) continue;

      transacoes.push(novaTransacao(dataLida, textoDescricao, valor, saldo, idx));
      idx++;
    }
  }

  if (!transacoes.length) return [];
  return [bloco(transacoes, saldoAnterior, saldoFinal)];
}

// ─── layout B: dia/lote ─────────────────────────────────────────────────────

const CABECALHO_DIA_LOTE = [
  ["dia", "lote", "documento", "histórico", "valor"],
  ["dia", "lote", "documento", "historico", "valor"],
];

function colunasDiaLote(linhas: readonly (readonly Palavra[])[]): ColunasDiaLote | null {
  for (const palavras of linhas) {
    const textos = palavras.map((p) => p.text.toLowerCase());
    const inicio = textos.slice(0, 5);
    if (!CABECALHO_DIA_LOTE.some((c) => c.length === inicio.length && c.every((t, i) => t === inicio[i]))) continue;
    return {
      xData: Number(palavras[0].x0),
      xHistorico: Number(palavras[3].x0),
      valor: Number(palavras[4].x1) + 10,
    };
  }
  return null;
}

/**
 * `round(x, 2)` do Python como chave: o `toFixed` arredonda pelo valor binário exato, como o
 * Python, mas desempata para cima; o Python desempata para o par. Empate exato só acontece quando
 * `x * 8` é inteiro ímpar (x = k/8).
 */
function arredonda2(x: number): string {
  const oito = x * 8;
  if (Number.isInteger(oito) && oito % 2 !== 0) {
    const cem = x * 100; // exato: k * 12,5
    const baixo = Math.floor(cem);
    const n = baixo % 2 === 0 ? baixo : baixo + 1;
    return (n / 100).toFixed(2);
  }
  return x.toFixed(2);
}

const chaveDePosicao = (w: Palavra) => `${arredonda2(Number(w.top))}|${arredonda2(Number(w.x0))}`;

function extrairDiaLote(paginas: readonly (readonly Palavra[])[], referenciaAno: number): Bloco[] {
  const transacoes: Transacao[] = [];
  let saldoAnterior: Dec | null = null;
  let idx = 0;
  let colunas: ColunasDiaLote | null = null;

  for (const daPagina of paginas) {
    const palavras = separarLetraColada(daPagina);
    // O cabeçalho é lido na altura PADRÃO: com 14 pontos ele se funde com a linha de baixo e deixa
    // de ser reconhecível.
    const estreitas = agruparLinhas(palavras);
    colunas = colunasDiaLote(estreitas) ?? colunas;
    if (colunas === null) continue;

    // E as palavras dele saem da página antes do agrupamento largo: o cabeçalho se repete no topo de
    // cada página, a menos de 14 pontos da primeira linha de dados; fundido, ele parte o lançamento
    // em dois grupos e o valor se perde.
    const doCabecalho = new Set<string>();
    for (const linha of estreitas) if (colunasDiaLote([linha]) !== null) for (const w of linha) doCabecalho.add(chaveDePosicao(w));
    const uteis = palavras.filter((w) => !doCabecalho.has(chaveDePosicao(w)));
    const linhas = agruparLinhas(uteis, ALTURA_DIA_LOTE);

    for (const linha of linhas) {
      let dataLida: string | null = null;
      const descricao: string[] = [];
      const numeros: [x1: number, valor: Dec][] = [];
      const marcas: Marca[] = [];

      for (const palavra of linha) {
        const texto = palavra.text;
        const x0 = Number(palavra.x0);
        const x1 = Number(palavra.x1);

        if (DATA.match(texto) && Math.abs(x0 - colunas.xData) <= 10) {
          // `00/00/0000` marca a linha de saldo; não é data de nada.
          if (texto !== "00/00/0000") dataLida = parseData(texto, referenciaAno);
          continue;
        }
        const sinal = SINAL_PARENTESES.match(texto);
        if (sinal) {
          marcas.push([x0, sinal[1] === "+" ? 1 : -1]);
          continue;
        }
        if (VALOR.match(texto) && Math.abs(x1 - colunas.valor) <= 24) {
          const convertido = parseValor(texto);
          if (convertido !== null) numeros.push([x1, convertido]);
          continue;
        }
        if (x0 >= colunas.xHistorico - 3) descricao.push(texto);
      }

      const textoDescricao = strip(ESPACOS.sub(" ", descricao.join(" ")));
      const maiuscula = textoDescricao.toUpperCase();

      let valor: Dec | null = null;
      for (const [x1, bruto] of numeros) {
        const sinalLido = sinalADireita(x1, marcas);
        if (sinalLido !== null) valor = comSinal(bruto, sinalLido);
      }

      if (maiuscula.startsWith("SALDO ANTERIOR")) {
        if (saldoAnterior === null) saldoAnterior = valor;
        continue;
      }

      if (maiuscula.startsWith("SALDO DO DIA")) {
        // Âncora: é o saldo DEPOIS do último lançamento lido.
        if (valor !== null && transacoes.length) transacoes[transacoes.length - 1] = { ...transacoes[transacoes.length - 1], saldoApos: valor };
        continue;
      }

      if (valor === null || ehZero(valor) || dataLida === null) continue;

      transacoes.push(novaTransacao(dataLida, textoDescricao, valor, null, idx));
      idx++;
    }
  }

  if (!transacoes.length) return [];
  return [bloco(transacoes, saldoAnterior)];
}

// ─── layout C: painel PJ ────────────────────────────────────────────────────

const MARCA_REAIS = re("^(-?)R\\$$");
// Distância entre o `R$` e o número que ele qualifica: medido, fica em 2 e 3 pontos. 12 dá folga
// sem alcançar a coluna vizinha, que está a dezenas.
const DISTANCIA_DO_CIFRAO = 12.0;

function colunasPainel(linhas: readonly (readonly Palavra[])[]): Colunas | null {
  for (const palavras of linhas) {
    const textos = palavras.map((p) => p.text.toLowerCase());
    if (!["movimento", "balancete", "valor", "saldo"].every((t) => textos.includes(t))) continue;
    if (!textos.some((t) => t.startsWith("hist"))) continue;
    // O cabeçalho do balancete, quando cabe numa linha só, também tem os dois rótulos e casaria
    // aqui. No balancete eles são `Dt. balancete` e `Dt. movimento`, nessa ordem; no Painel são
    // colunas próprias, sem `Dt.` e na ordem inversa.
    if (textos.includes("dt.")) continue;
    if (textos.indexOf("movimento") > textos.indexOf("balancete")) continue;
    const valor = bordaDireita(textos, palavras, "valor");
    const saldo = bordaDireita(textos, palavras, "saldo");
    if (valor === null || saldo === null) continue;
    return {
      xData: Number(palavras[textos.indexOf("movimento")].x0),
      xHistorico: Number(palavras[textos.findIndex((t) => t.startsWith("hist"))].x0),
      valor,
      saldo,
      documento: null,
    };
  }
  return null;
}

/** O `R$` mais próximo à esquerda do número. */
function sinalAEsquerda(x0: number, marcas: readonly Marca[]): number | null {
  return menorCandidata(marcas.filter(([x1]) => 0 <= x0 - x1 && x0 - x1 <= DISTANCIA_DO_CIFRAO).map(([x1, sinal]): Marca => [x0 - x1, sinal]));
}

function extrairPainel(paginas: readonly (readonly Palavra[])[], referenciaAno: number): Bloco[] {
  const transacoes: Transacao[] = [];
  let saldoAnterior: Dec | null = null;
  let idx = 0;
  let colunas: Colunas | null = null;

  for (const palavras of paginas) {
    const linhas = agruparLinhas(palavras);
    colunas = colunasPainel(linhas) ?? colunas;
    if (colunas === null) continue;

    for (const linha of linhas) {
      if (colunasPainel([linha]) !== null) continue;

      let dataLida: string | null = null;
      const descricao: string[] = [];
      const numeros: [x0: number, nome: "valor" | "saldo", valor: Dec][] = [];
      const marcas: Marca[] = [];

      for (const palavra of linha) {
        const texto = palavra.text;
        const x0 = Number(palavra.x0);
        const x1 = Number(palavra.x1);

        if (DATA.match(texto) && Math.abs(x0 - colunas.xData) <= 14) {
          dataLida = parseData(texto, referenciaAno);
          continue;
        }
        const marca = MARCA_REAIS.match(texto);
        if (marca) {
          marcas.push([x1, marca[1] ? -1 : 1]);
          continue;
        }
        if (VALOR.match(texto)) {
          let achou = false;
          for (const nome of ["valor", "saldo"] as const) {
            if (Math.abs(x1 - colunas[nome]) <= TOLERANCIA_COLUNA) {
              const convertido = parseValor(texto);
              if (convertido !== null) numeros.push([x0, nome, convertido]);
              achou = true;
              break;
            }
          }
          if (!achou && x0 >= colunas.xHistorico - 3) descricao.push(texto);
          continue;
        }
        if (x0 >= colunas.xHistorico - 3) descricao.push(texto);
      }

      const textoDescricao = strip(ESPACOS.sub(" ", descricao.join(" ")));

      let valor: Dec | null = null;
      let saldo: Dec | null = null;
      for (const [x0, nome, bruto] of numeros) {
        const sinal = sinalAEsquerda(x0, marcas);
        if (sinal === null) continue;
        if (nome === "valor") valor = comSinal(bruto, sinal);
        else saldo = comSinal(bruto, sinal);
      }

      if (textoDescricao.toUpperCase().startsWith("SALDO ANTERIOR")) {
        if (saldoAnterior === null) saldoAnterior = saldo !== null ? saldo : valor;
        continue;
      }

      if (valor === null || ehZero(valor)) {
        complementar(transacoes, textoDescricao);
        continue;
      }
      if (dataLida === null) continue;

      transacoes.push(novaTransacao(dataLida, textoDescricao, valor, saldo, idx));
      idx++;
    }
  }

  if (!transacoes.length) return [];
  return [bloco(transacoes, saldoAnterior)];
}

/**
 * Escolhe o layout pelo cabeçalho da tabela. O Painel é testado ANTES do balancete e a ordem não é
 * estilo: o cabeçalho dele satisfaz as condições do balancete, que então ancorava a data em
 * `BALANCETE` quando ela mora sob `MOVIMENTO`, e extraía zero lançamentos sem errar em nada visível.
 */
function extrairDePalavras(paginas: readonly (readonly Palavra[])[], referenciaAno: number): Bloco[] {
  for (const palavras of paginas) {
    const estreitas = agruparLinhas(palavras);
    if (colunasPainel(estreitas) !== null) return extrairPainel(paginas, referenciaAno);
    if (colunasBalancete(estreitas) !== null) return extrairBalancete(paginas, referenciaAno);
    if (colunasDiaLote(estreitas) !== null) return extrairDiaLote(paginas, referenciaAno);
  }
  return [];
}

export const bb: Leitor = {
  nome: "bb",
  siglas: new Set(["BB", "BANCO DO BRASIL", "001"]),
  requerCaracteres: true,
  reconhece(linhas) {
    if (linhas.some((l) => ASSINATURA_BALANCETE.search(l) || ASSINATURA_DIA_LOTE.match(strip(l)) || ASSINATURA_PAINEL.search(l))) return true;
    return linhas.some((l) => ASSINATURA_EMPILHADA.match(l) !== null) && linhas.some((l) => COLUNAS_DO_EXTRATO.search(l) !== null);
  },
  extrairDePalavras,
};
