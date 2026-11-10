// Porte de `extrato/bancos/itau.py`: Itaú, lido por COORDENADA e não por linha de texto.
//
// O extrato mensal traz uma legenda lateral fixa ("A = agendamento", "B = ações movimentadas pela
// Bolsa de Valores"…) à esquerda da tabela, e o `extract_text` a intercala no meio dos lançamentos.
// Com a coordenada, a legenda some (é tudo que está à esquerda da coluna `data`) e o sinal vem da
// coluna: entradas é crédito, saídas é débito. As bordas das colunas saem do próprio cabeçalho da
// tabela, não de números fixos.
//
// Linhas "SALDO ..." são ignoradas de propósito: o Itaú imprime o saldo da aplicação automática na
// mesma coluna de saldo da conta corrente, e esse número é de outra conta. A única linha de saldo
// aproveitada como âncora inicial é a "Saldo anterior".
//
// O Itaú tem três layouts com a mesma marca: o mensal impresso (duas colunas, entradas e saídas
// separadas), o extrato do internet banking (coluna única, saldo por dia) e os lançamentos do
// internet banking (`ag/origem`, saldo só nas pontas). `extrairDePalavras` escolhe pelo cabeçalho.

import {
  compara,
  ehZero,
  modulo,
  naoNegativo,
  oposto,
  soma,
  somaTodos,
  subtrai,
  dec,
  type Dec,
} from "../../motor/decimal";
import {
  agruparLinhas,
  bloco,
  bordaDireita,
  colarFragmentos,
  dataIso,
  gerarFitid,
  parseData,
  parseValor,
  type Bloco,
  type Palavra,
  type Transacao,
} from "../comum";
import { corta, ehDigitos, inteiro, re, strip } from "../py";
import type { Leitor } from "./tipos";

type Paginas = readonly (readonly Palavra[])[];
type Linhas = readonly (readonly Palavra[])[];

// Um valor monetário do corpo da tabela, com o sinal opcional no fim.
const VALOR = re("^-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}-?$");
const DATA_CURTA = re("^\\d{2}/\\d{2}$");
const ESPACOS = re("\\s+");

// Tolerância, em pontos, para casar a borda direita de um valor com a da coluna. As colunas
// numéricas são alinhadas à direita: a borda direita é estável, o `x0` varia com a largura.
const TOLERANCIA_COLUNA = 14.0;

/** A coluna mais próxima pela borda direita, dentro da tolerância (o primeiro vence o empate). */
function maisProxima<N extends string>(x1: number, candidatos: readonly [N, number][]): N | null {
  let melhor: N | null = null;
  let distancia = TOLERANCIA_COLUNA;
  for (const [nome, borda] of candidatos) {
    const d = Math.abs(x1 - borda);
    if (d < distancia) {
      melhor = nome;
      distancia = d;
    }
  }
  return melhor;
}

/** `palavras[next(i for i, t in enumerate(textos) if t.startswith(prefixo))]["x0"]` */
function x0DoPrimeiro(palavras: readonly Palavra[], textos: readonly string[], prefixo: string): number {
  return palavras[textos.findIndex((t) => t.startsWith(prefixo))].x0;
}

/** `min((linha[0].top for linha in linhas if cabecalho([linha])), default=0.0)` */
function topoDoCabecalho(linhas: Linhas, ehCabecalho: (linha: readonly Palavra[]) => boolean): number {
  const topos = linhas.filter(ehCabecalho).map((linha) => linha[0].top);
  return topos.length ? Math.min(...topos) : 0.0;
}

// ─── Assinaturas ────────────────────────────────────────────────────────────

// A assinatura é o CABEÇALHO DA TABELA, não a marca do banco: procurar "itaú" reconhecia qualquer
// extrato que citasse o banco (um PIX recebido de conta Itaú basta).
const ASSINATURA_MENSAL = re("\\bdata\\b.*\\bdescri\\w*\\b.*\\bentradas?\\b.*\\bsa[íi]das?\\b", "i");
// "Data Lançamentos … Valor (R$) Saldo (R$)" sozinho não identifica o Itaú (Stone e Grafeno têm
// cabeçalho quase igual); o par "Razão Social" + "CNPJ/CPF" é o que separa.
const ASSINATURA_EXTRATO = re("\\bdata\\b.*\\blan[çc]amentos?\\b.*\\braz[ãa]o\\s+social\\b.*\\bcnpj/cpf\\b", "i");
// `data lançamentos ag/origem valor (R$) saldo (R$)`: a terceira variante.
const ASSINATURA_LANCAMENTOS = re("\\bdata\\b.*\\blan[çc]amentos\\b.*\\bag/origem\\b.*\\bvalor\\b.*\\bsaldo\\b", "i");

// ─── Variante: extrato mensal impresso ──────────────────────────────────────

type ColunaMensal = "credito" | "debito" | "saldo";
type Colunas = { xData: number; xDescricao: number; credito: number; debito: number; saldo: number };

/** Coluna a que pertence um valor, pela borda direita. */
const qual = (c: Colunas, x1: number) =>
  maisProxima<ColunaMensal>(x1, [
    ["credito", c.credito],
    ["debito", c.debito],
    ["saldo", c.saldo],
  ]);

/**
 * Acha a linha `data descrição entradas R$ saídas R$ saldo R$`. A borda de cada coluna numérica é
 * a do `R$` que a acompanha; sem ele, a do próprio rótulo.
 */
function lerCabecalho(linhas: Linhas): Colunas | null {
  for (const palavras of linhas) {
    const textos = palavras.map((p) => p.text.toLowerCase());
    if (!textos.includes("data") || !textos.some((t) => t.startsWith("descri"))) continue;
    if (!textos.some((t) => t.startsWith("entrada"))) continue;

    const credito = bordaDireita(textos, palavras, "entrada");
    const debito = bordaDireita(textos, palavras, "sa", ["saldo"]);
    const saldo = bordaDireita(textos, palavras, "saldo");
    if (credito === null || debito === null || saldo === null) continue;
    return {
      xData: palavras[textos.indexOf("data")].x0,
      xDescricao: x0DoPrimeiro(palavras, textos, "descri"),
      credito,
      debito,
      saldo,
    };
  }
  return null;
}

const APLICACAO = re("APLIC\\w*\\s+AUT", "i");
const TOLERANCIA_VARREDURA = dec("0.05");
const ZERO = dec("0");
const SALDO_ANTERIOR = re("^saldo\\s+anterior$", "i");
const SALDO_EM_CC = re("^saldo\\s+em\\s+c/?c$", "i");
const SALDO_FINAL = re("^saldo\\s+final$", "i");

/** `abs(x) <= tolerância` */
const dentro = (x: Dec) => compara(modulo(x), TOLERANCIA_VARREDURA) <= 0;

/**
 * Repõe a varredura para a aplicação automática que o extrato não imprime. O Itaú varre o que sobra
 * na conta corrente para a aplicação; às vezes imprime a linha, às vezes não, e o saldo pula sem
 * lançamento que o explique.
 *
 * O que autoriza a derivação são dois números impressos que concordam: o buraco da cadeia da conta
 * corrente diz quanto falta, a VARIAÇÃO do saldo da aplicação diz para onde foi. Só quando batem,
 * dentro da tolerância, o lançamento é criado, com o valor que ambos exigem. Ele entra ANTES da
 * linha que carrega o saldo impresso, para a âncora impressa continuar sendo a âncora.
 */
function derivarVarreduraDaAplicacao(
  transacoes: Transacao[],
  saldoAnterior: Dec | null,
  aplicacoes: readonly [number, Dec][],
  aplicacaoInicial: Dec = ZERO,
): Transacao[] {
  if (saldoAnterior === null || !aplicacoes.length) return transacoes;

  // posição na lista → saldo da aplicação impresso logo depois dela
  const porPosicao = new Map(aplicacoes);
  const resultado: Transacao[] = [];
  let corrente = saldoAnterior;
  let saldoAplicacao = aplicacaoInicial;

  transacoes.forEach((transacao, posicao) => {
    const impresso = transacao.saldoApos;
    const aplicacaoSeguinte = porPosicao.get(posicao + 1);

    if (impresso !== null && aplicacaoSeguinte !== undefined) {
      const buraco = subtrai(impresso, soma(corrente, transacao.valor));
      const movidoParaAplicacao = subtrai(aplicacaoSeguinte, saldoAplicacao);
      if (!dentro(buraco) && dentro(soma(buraco, movidoParaAplicacao))) {
        resultado.push({
          fitid: gerarFitid(transacao.data, "APLICACAO AUTOMATICA", buraco, resultado.length),
          data: transacao.data,
          valor: buraco,
          historico: "APLICACAO AUTOMATICA (derivado do saldo da aplicacao)",
          tipoOfx: naoNegativo(buraco) ? "CREDIT" : "DEBIT",
          saldoApos: null,
          ordem: resultado.length,
        });
        corrente = soma(corrente, buraco);
      }
    }

    if (aplicacaoSeguinte !== undefined) saldoAplicacao = aplicacaoSeguinte;

    corrente = impresso !== null ? impresso : soma(corrente, transacao.valor);
    resultado.push({ ...transacao, ordem: resultado.length });
  });

  return resultado;
}

/**
 * Saldo aplicado no fim do mês ANTERIOR, do resumo das aplicações automáticas: o primeiro número da
 * linha `principal`. Um valor por quadro (o extrato pode trazer mais de um produto).
 */
function principaisIniciais(paginas: Paginas): Dec[] {
  const principais: Dec[] = [];
  for (const palavras of paginas) {
    for (const linha of agruparLinhas(palavras)) {
      if (linha.length < 3 || linha[0].text.toLowerCase() !== "principal") continue;
      if (!VALOR.match(linha[1].text)) continue;
      const valor = parseValor(linha[1].text);
      if (valor !== null) principais.push(valor);
    }
  }
  return principais;
}

/**
 * Separa a aplicação do "Saldo anterior" quando ele a inclui. Com saldo aplicado na abertura, o
 * Itaú imprime em "Saldo anterior" a soma da conta corrente com a aplicação, mas a coluna de saldo
 * acompanha só a conta corrente. Quem decide é a primeira âncora impressa: a abertura só é trocada
 * quando o saldo anterior como está NÃO chega nela e o saldo anterior menos o principal chega.
 *
 * Devolve (saldo anterior da conta corrente, saldo aplicado na abertura).
 */
function saldoAnteriorDaContaCorrente(transacoes: readonly Transacao[], saldoAnterior: Dec | null, principais: readonly Dec[]): [Dec | null, Dec] {
  const semMudanca: [Dec | null, Dec] = [saldoAnterior, ZERO];
  if (saldoAnterior === null) return semMudanca;
  const candidatos = principais.filter((p) => !p.negativo && !ehZero(p));
  if (candidatos.length > 1) candidatos.push(somaTodos(candidatos));
  if (!candidatos.length) return semMudanca;

  let acumulado = ZERO;
  for (const transacao of transacoes) {
    acumulado = soma(acumulado, transacao.valor);
    if (transacao.saldoApos === null) continue;
    const impresso = transacao.saldoApos;
    if (dentro(subtrai(soma(saldoAnterior, acumulado), impresso))) return semMudanca;
    for (const principal of candidatos) {
      if (dentro(subtrai(soma(subtrai(saldoAnterior, principal), acumulado), impresso))) {
        return [subtrai(saldoAnterior, principal), principal];
      }
    }
    return semMudanca;
  }
  return semMudanca;
}

/** Extrato mensal impresso: duas colunas, entradas e saídas separadas. */
function extrairMensal(paginas: Paginas, referenciaAno: number): Bloco[] {
  const transacoes: Transacao[] = [];
  let saldoAnterior: Dec | null = null;
  let saldoFinal: Dec | null = null;
  let fimDaTabela = false;
  let idx = 0;
  let ultimaData: string | null = null;
  // (posição na lista de lançamentos, saldo da aplicação naquele ponto)
  const aplicacoes: [number, Dec][] = [];

  for (const palavras of paginas) {
    if (fimDaTabela) break;
    const linhas = agruparLinhas(palavras);
    const colunas = lerCabecalho(linhas);
    // Página sem tabela de movimentação (capa, investimentos, legendas).
    if (colunas === null) continue;

    for (const linha of linhas) {
      // Depois do fecho vem outra tabela (o totalizador de aplicações automáticas), que reusa as
      // mesmas colunas e entrava como crédito que não existe, na cauda.
      if (fimDaTabela) break;

      // Fora a coluna da legenda, que fica à esquerda da coluna `data`.
      const uteis = linha.filter((p) => p.x0 >= colunas.xData - 3);
      if (!uteis.length) continue;

      let dataNova: string | null = null;
      const descricao: string[] = [];
      const valores = new Map<ColunaMensal, Dec>();

      for (const palavra of uteis) {
        const texto = palavra.text;
        const { x0, x1 } = palavra;

        if (DATA_CURTA.match(texto) && Math.abs(x0 - colunas.xData) <= 6) {
          const lida = parseData(texto, referenciaAno);
          if (lida) dataNova = lida;
          continue;
        }

        if (VALOR.match(texto)) {
          const coluna = qual(colunas, x1);
          if (coluna) {
            const valor = parseValor(texto);
            if (valor !== null) valores.set(coluna, valor);
            continue;
          }
        }

        if (x0 >= colunas.xDescricao - 3) descricao.push(texto);
      }

      if (dataNova) ultimaData = dataNova;

      const textoDescricao = strip(descricao.join(" "));
      if (!textoDescricao) continue;

      // Abertura do extrato: o único saldo que vira âncora inicial.
      if (SALDO_ANTERIOR.match(textoDescricao)) {
        if (valores.has("saldo") && saldoAnterior === null) saldoAnterior = valores.get("saldo")!;
        continue;
      }

      // "Saldo em C/C" fecha a cadeia da CONTA CORRENTE, que é a que a coluna de saldo acompanha.
      // O "Saldo final" logo abaixo soma a aplicação automática e não serve.
      if (SALDO_EM_CC.match(textoDescricao)) {
        if (valores.has("saldo")) saldoFinal = valores.get("saldo")!;
        continue;
      }

      // "Saldo final" encerra a movimentação; o que vem depois é outra tabela.
      if (SALDO_FINAL.match(textoDescricao)) {
        fimDaTabela = true;
        break;
      }

      // Saldo de aplicação automática na coluna de saldo da conta corrente: não é lançamento nem
      // âncora, mas é ANOTADO, porque a variação dele explica a varredura não impressa.
      if (textoDescricao.toUpperCase().startsWith("SALDO")) {
        if (APLICACAO.search(textoDescricao) && valores.has("saldo")) aplicacoes.push([transacoes.length, valores.get("saldo")!]);
        continue;
      }

      let valor: Dec;
      if (valores.has("credito")) valor = modulo(valores.get("credito")!);
      else if (valores.has("debito")) valor = oposto(modulo(valores.get("debito")!));
      else continue;

      if (ehZero(valor) || ultimaData === null) continue;

      const historico = corta(ESPACOS.sub(" ", textoDescricao), 200);
      transacoes.push({
        fitid: gerarFitid(ultimaData, historico, valor, idx),
        data: ultimaData,
        valor,
        historico,
        tipoOfx: naoNegativo(valor) ? "CREDIT" : "DEBIT",
        saldoApos: valores.get("saldo") ?? null,
        ordem: idx,
      });
      idx++;
    }
  }

  if (!transacoes.length) return [];
  const [anteriorDaConta, aplicacaoInicial] = saldoAnteriorDaContaCorrente(transacoes, saldoAnterior, principaisIniciais(paginas));
  return [bloco(derivarVarreduraDaAplicacao(transacoes, anteriorDaConta, aplicacoes, aplicacaoInicial), anteriorDaConta, saldoFinal)];
}

// ─── Variante: extrato do internet banking ──────────────────────────────────

// Cabeçalho: `Data Lançamentos Razão Social CNPJ/CPF Valor (R$) Saldo (R$)`
const DATA_LONGA = re("^\\d{2}/\\d{2}/\\d{4}$");
const SALDO_PARCIAL_DO_DIA = re("APLIC|MOVIMENTA", "i");

type ColunasExtrato = { xData: number; xLancamento: number; valor: number; saldo: number };

function lerCabecalhoExtrato(linhas: Linhas): ColunasExtrato | null {
  for (const palavras of linhas) {
    const textos = palavras.map((p) => p.text.toLowerCase());
    if (!textos.includes("data") || !textos.some((t) => t.startsWith("lan"))) continue;
    if (!textos.includes("valor") || !textos.includes("saldo")) continue;
    // Exige a coluna de razão social, como a assinatura desta variante: sem isso ficava com o
    // cabeçalho da variante `ag/origem` e o arquivo saía vazio.
    if (!textos.some((t) => t.startsWith("raz"))) continue;

    const valor = bordaDireita(textos, palavras, "valor");
    const saldo = bordaDireita(textos, palavras, "saldo");
    if (valor === null || saldo === null) continue;

    return {
      xData: palavras[textos.indexOf("data")].x0,
      xLancamento: x0DoPrimeiro(palavras, textos, "lan"),
      valor,
      saldo,
    };
  }
  return null;
}

/**
 * Extrato do internet banking: uma coluna de valor com o sinal no número, saldo uma vez por dia
 * (na linha `SALDO TOTAL DISPONÍVEL DIA`, que vira a âncora do último lançamento) e a razão social
 * quebrada em várias linhas em torno da linha de dados, colada no lançamento mais próximo.
 */
function extrairInternet(paginas: Paginas, referenciaAno: number): Bloco[] {
  let transacoes: Transacao[] = [];
  let saldoAnterior: Dec | null = null;
  let idx = 0;
  let colunas: ColunasExtrato | null = null;

  for (const palavras of paginas) {
    const linhas = agruparLinhas(palavras);
    // O cabeçalho só é impresso na PRIMEIRA página; as colunas valem até o fim do arquivo.
    colunas = lerCabecalhoExtrato(linhas) ?? colunas;
    if (colunas === null) continue;

    // (topo, posição) das linhas de dados desta página, para colar os fragmentos.
    const ancoras: [number, number][] = [];
    const fragmentos: [number, string][] = [];

    // Nada acima do cabeçalho da tabela é fragmento: senão o cabeçalho da página (dados do TITULAR)
    // entrava no histórico do primeiro lançamento.
    const topoCabecalho = topoDoCabecalho(linhas, (linha) => lerCabecalhoExtrato([linha]) !== null);

    for (const linha of linhas) {
      const topo = linha[0].top;
      if (topo <= topoCabecalho) continue;
      let dataLida: string | null = null;
      const descricao: string[] = [];
      let valor: Dec | null = null;
      let saldo: Dec | null = null;

      for (const palavra of linha) {
        const texto = palavra.text;
        const { x0, x1 } = palavra;

        if (DATA_LONGA.match(texto) && Math.abs(x0 - colunas.xData) <= 6) {
          dataLida = parseData(texto, referenciaAno);
          continue;
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

      if (dataLida === null && valor === null && textoDescricao) {
        // Fragmento de razão social quebrada.
        fragmentos.push([topo, textoDescricao]);
        continue;
      }

      if (SALDO_ANTERIOR.match(textoDescricao)) {
        if (saldo !== null && saldoAnterior === null) saldoAnterior = saldo;
        continue;
      }

      if (textoDescricao.toUpperCase().startsWith("SALDO")) {
        // Fecho do dia: ancora a cadeia no último lançamento lido. Só o TOTAL do dia serve; as
        // partes (`SALDO MOVIMENTAÇÃO CONTA`, `SALDO APLIC. AUT.`) sobrescreviam a âncora.
        if (SALDO_PARCIAL_DO_DIA.search(textoDescricao)) continue;
        if (saldo !== null && transacoes.length) transacoes[transacoes.length - 1] = { ...transacoes[transacoes.length - 1], saldoApos: saldo };
        continue;
      }

      if (valor === null || ehZero(valor) || dataLida === null) continue;

      transacoes.push({
        fitid: gerarFitid(dataLida, textoDescricao, valor, idx),
        data: dataLida,
        valor,
        historico: corta(textoDescricao, 200),
        tipoOfx: naoNegativo(valor) ? "CREDIT" : "DEBIT",
        saldoApos: null,
        ordem: idx,
      });
      ancoras.push([topo, transacoes.length - 1]);
      idx++;
    }

    transacoes = colarFragmentos(transacoes, ancoras, fragmentos);
  }

  if (!transacoes.length) return [];
  // O rótulo de ausência só vale depois da colagem: há lançamento cuja descrição inteira está nos
  // fragmentos em volta.
  transacoes = transacoes.map((t) => (t.historico ? t : { ...t, historico: "SEM DESCRIÇÃO" }));
  return [bloco(transacoes, saldoAnterior)];
}

// ─── Variante: lançamentos do internet banking ──────────────────────────────

// `02 / jan`: dia e mês abreviado, em três palavras e sem ano.
const MESES_ABREV = new Map<string, number>([
  ["jan", 1], ["fev", 2], ["mar", 3], ["abr", 4], ["mai", 5], ["jun", 6],
  ["jul", 7], ["ago", 8], ["set", 9], ["out", 10], ["nov", 11], ["dez", 12],
]);
const PERIODO_LANCAMENTOS = re("per[ií]odo:\\s*\\d{2}/\\d{2}/(\\d{4})", "i");

type ColunaLancamentos = "valor" | "saldo";
type ColunasLancamentos = { xData: number; xLancamentos: number; valor: number; saldo: number };

/** Coluna do número, pela borda direita: valor ou saldo. */
const qualLancamentos = (c: ColunasLancamentos, x1: number) =>
  maisProxima<ColunaLancamentos>(x1, [
    ["valor", c.valor],
    ["saldo", c.saldo],
  ]);

function lerCabecalhoLancamentos(linhas: Linhas): ColunasLancamentos | null {
  for (const palavras of linhas) {
    const textos = palavras.map((p) => p.text.toLowerCase());
    if (!textos.includes("data") || !textos.includes("valor") || !textos.includes("saldo")) continue;
    if (!textos.some((t) => t.startsWith("lan"))) continue;
    if (!textos.some((t) => t.startsWith("ag/"))) continue;
    const valor = bordaDireita(textos, palavras, "valor");
    const saldo = bordaDireita(textos, palavras, "saldo");
    if (valor === null || saldo === null) continue;
    return {
      xData: palavras[textos.indexOf("data")].x0,
      xLancamentos: x0DoPrimeiro(palavras, textos, "lan"),
      valor,
      saldo,
    };
  }
  return null;
}

/**
 * Lançamentos do internet banking: a conta é varrida para a aplicação todo dia e o extrato NÃO
 * imprime saldo por lançamento. A coluna de saldo só traz `SALDO INICIAL` e `SALDO FINAL` (as duas
 * pontas, a única conferência possível) e `SALDO APLIC AUT MAIS` (saldo da aplicação, não da
 * conta). A data vem sem ano (`02 / jan`); o ano sai do "período: 01/01/2026 até ..." do cabeçalho.
 */
function extrairLancamentos(paginas: Paginas, referenciaAno: number): Bloco[] {
  let ano = referenciaAno;
  const transacoes: Transacao[] = [];
  let saldoInicial: Dec | null = null;
  let saldoFinal: Dec | null = null;
  let fim = false;
  let idx = 0;
  let colunas: ColunasLancamentos | null = null;

  for (const palavras of paginas) {
    if (fim) break;
    const linhas = agruparLinhas(palavras);
    colunas = lerCabecalhoLancamentos(linhas) ?? colunas;

    for (const linha of linhas) {
      const textoCru = linha.map((p) => p.text).join(" ");
      const achado = PERIODO_LANCAMENTOS.search(textoCru);
      if (achado) ano = inteiro(achado[1]!);
      if (colunas === null || fim) continue;

      let dia: number | null = null;
      let mes: number | null = null;
      const descricao: string[] = [];
      const valores = new Map<ColunaLancamentos, Dec>();

      for (const palavra of linha) {
        const bruto = palavra.text;
        const { x0, x1 } = palavra;

        if (Math.abs(x0 - colunas.xData) <= 6 && ehDigitos(bruto)) {
          dia = inteiro(bruto);
          continue;
        }
        if (bruto === "/" && x0 < colunas.xLancamentos) continue;
        if (MESES_ABREV.has(bruto.toLowerCase()) && x0 < colunas.xLancamentos) {
          mes = MESES_ABREV.get(bruto.toLowerCase())!;
          continue;
        }

        if (VALOR.match(bruto)) {
          const coluna = qualLancamentos(colunas, x1);
          if (coluna) {
            const convertido = parseValor(bruto);
            if (convertido !== null) valores.set(coluna, convertido);
            continue;
          }
        }

        if (x0 >= colunas.xLancamentos - 3) descricao.push(bruto);
      }

      const textoDescricao = strip(ESPACOS.sub(" ", descricao.join(" ")));
      if (!textoDescricao) continue;
      const maiuscula = textoDescricao.toUpperCase();

      // As duas pontas não saem na mesma coluna (SALDO INICIAL na de saldo, SALDO FINAL na de
      // valor), por isso aqui vale qualquer número da linha.
      const ponta = valores.has("saldo") ? valores.get("saldo")! : (valores.get("valor") ?? null);
      if (maiuscula.startsWith("SALDO INICIAL")) {
        if (ponta !== null && saldoInicial === null) saldoInicial = ponta;
        continue;
      }
      if (maiuscula.startsWith("SALDO FINAL")) {
        if (ponta !== null) {
          saldoFinal = ponta;
          fim = true;
        }
        continue;
      }
      // Saldo da aplicação automática: não é lançamento nem âncora.
      if (maiuscula.startsWith("SALDO")) continue;

      if (!valores.has("valor") || dia === null || mes === null) continue;
      const valor = valores.get("valor")!;
      if (ehZero(valor)) continue;
      // `date(ano, mes, dia)` com ValueError: pula a linha.
      const dataLida = dataIso(ano, mes, dia);
      if (dataLida === null) continue;

      transacoes.push({
        fitid: gerarFitid(dataLida, textoDescricao, valor, idx),
        data: dataLida,
        valor,
        historico: corta(textoDescricao, 200),
        tipoOfx: !valor.negativo && !ehZero(valor) ? "CREDIT" : "DEBIT",
        saldoApos: null,
        ordem: idx,
      });
      idx++;
    }
  }

  if (!transacoes.length) return [];
  return [bloco(transacoes, saldoInicial, saldoFinal)];
}

// ─── O leitor ───────────────────────────────────────────────────────────────

export const itau: Leitor = {
  nome: "itau",
  siglas: new Set(["ITAU", "ITAÚ", "341"]),
  reconhece: (linhas) =>
    linhas.some((l) => Boolean(ASSINATURA_MENSAL.search(l) || ASSINATURA_EXTRATO.search(l) || ASSINATURA_LANCAMENTOS.search(l))),
  /** Escolhe a variante de layout pelo cabeçalho da tabela, na primeira página que traga um. */
  extrairDePalavras(paginas, referenciaAno) {
    for (const palavras of paginas) {
      const linhas = agruparLinhas(palavras);
      if (lerCabecalho(linhas) !== null) return extrairMensal(paginas, referenciaAno);
      if (lerCabecalhoExtrato(linhas) !== null) return extrairInternet(paginas, referenciaAno);
      if (lerCabecalhoLancamentos(linhas) !== null) return extrairLancamentos(paginas, referenciaAno);
    }
    return [];
  },
};
