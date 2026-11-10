// Porte de `extrato/bancos/bradesco.py`: extrato do Bradesco (X-One), lançamento em três linhas.
//
//     PIX ENVIADO                       ← tipo do lançamento (linha de texto puro)
//     1406542 -2.000,00 36.771,60       ← linha de dados: [data] doc valor saldo
//     DES: GRISOPAR COM TRANSPOR 02/01  ← complemento: a contraparte
//
// O parser genérico lia só a linha de cima e deixava a de baixo para o lançamento SEGUINTE: a
// contraparte de um PIX ia parar na tarifa debaixo dele e a cadeia de saldos quebrava. A regra que
// separa os formatos é a própria linha de dados: com letras, ela se descreve sozinha; só com dígitos,
// é o miolo de um grupo de três (tipo acima, complemento abaixo).

import { ehZero, igual, naoNegativo, type Dec } from "../../motor/decimal";
import { bloco, gerarFitid, parseData, parseValor, type Bloco, type Transacao } from "../comum";
import { re, strip } from "../py";
import { extrair as extrairDeColunas } from "./_bradescoColunas";
import type { Leitor } from "./tipos";

const VALOR = "-?\\d{1,3}(?:\\.\\d{3})*,\\d{2}";

// [data] <resto> <valor> <saldo>
const LINHA_DADOS = re(`^(?:(\\d{2}/\\d{2}/\\d{4})\\s+)?(.*?)\\s+(${VALOR})\\s+(${VALOR})\\s*$`);

const TEM_LETRA = re("[A-Za-zÀ-ÿ]");

// Cabeçalho de colunas. O arquivo pode trazer "Extrato" (o mês fechado) e "Últimos Lançamentos" (os
// dias seguintes), cada um com sua própria cadeia de saldos.
const CABECALHO_TABELA = re("^Data\\s+Lan[cç]amento\\s+Dcto", "i");

// "Últimos Lançamentos" abre outra cadeia de saldos e deve ser lida: pode conter o último dia do
// próprio período e movimentos posteriores. As repetições são tratadas em `consolidarBlocos`.
const FIM_DO_EXTRATO = re("^[ÚU]ltimos\\s+Lan[cç]amentos", "i");
const SALDO_ANTERIOR = re(`SALDO ANTERIOR\\s+(${VALOR})\\s*$`, "i");
const SALDOS_INVEST = re("^Saldos Invest", "i");
const ASSINATURA = re("Data\\s+Lan[cç]amento\\s+Dcto", "i");
const ESPACOS = re("\\s+");

const IGNORAR = re(
  "^(Ag[eê]ncia\\s*\\||Extrato de:|Data\\s+Lan[cç]amento|Total\\s|" + "SALDO ANTERIOR|Os dados|Pr[oó]ximo|\\d{5}\\s*\\|)",
  "i",
);

/** `Decimal == Decimal | None`: `None == None` é verdade; `None` contra número, não. */
function saldosIguais(a: Dec | null, b: Dec | null): boolean {
  if (a === null || b === null) return a === b;
  return igual(a, b);
}

export const bradesco: Leitor = {
  nome: "bradesco",
  siglas: new Set(["BRADESCO", "237"]),
  /** Assinatura do extrato: o cabeçalho de colunas do X-One. */
  reconhece(linhas) {
    for (const linha of linhas.slice(0, 40)) {
      if (ASSINATURA.search(linha)) return true;
      if (linha.toLowerCase().includes("bradesco")) return true;
    }
    return false;
  },
  /** Um bloco por trecho de extrato com cadeia de saldos própria. */
  extrair(linhas, referenciaAno) {
    const limpas = linhas.map((l) => strip(l));
    const blocos: Bloco[] = [];
    let atuais: Transacao[] = [];
    let saldoAnterior: Dec | null = null;
    let idx = 0;
    let ultimaData: string | null = null;

    const fechar = () => {
      if (atuais.length) blocos.push(bloco(atuais, saldoAnterior));
      atuais = [];
      saldoAnterior = null;
    };

    const ehDados = (i: number): boolean =>
      i >= 0 && i < limpas.length && Boolean(limpas[i]) && !IGNORAR.match(limpas[i]) && LINHA_DADOS.match(limpas[i]) !== null;

    for (let i = 0; i < limpas.length; i++) {
      const linha = limpas[i];
      if (!linha) continue;

      if (FIM_DO_EXTRATO.match(linha)) {
        fechar();
        ultimaData = null;
        continue;
      }

      if (SALDOS_INVEST.match(linha)) break;

      // O cabeçalho se repete em cada página. Os lançamentos no topo da próxima página podem omitir a
      // data, que continua sendo a do fim da anterior. Só um novo SALDO ANTERIOR inicia outro bloco.
      if (CABECALHO_TABELA.match(linha)) continue;

      const mSaldo = SALDO_ANTERIOR.search(linha);
      if (mSaldo) {
        if (atuais.length) {
          fechar();
          ultimaData = null;
        }
        // Abre a cadeia do bloco: dá contra o que conferir o 1º lançamento.
        saldoAnterior = parseValor(mSaldo[1]!);
        const d = parseData(linha, referenciaAno);
        if (d) ultimaData = d;
        continue;
      }

      if (IGNORAR.match(linha)) continue;

      const m = LINHA_DADOS.match(linha);
      if (!m) continue;

      const [dataStr, meioBruto, valorStr, saldoStr] = m.grupos;
      if (dataStr) {
        const d = parseData(dataStr, referenciaAno);
        if (d) ultimaData = d;
      }
      if (ultimaData === null) continue;

      const valor = parseValor(valorStr!);
      if (valor === null || ehZero(valor)) continue;

      const meio = strip(meioBruto!);
      let historico: string;
      if (TEM_LETRA.search(meio)) {
        historico = meio;
      } else {
        let tipo = "";
        if (
          i > 0 &&
          !ehDados(i - 1) &&
          TEM_LETRA.search(limpas[i - 1] || "") &&
          !IGNORAR.match(limpas[i - 1]) &&
          !CABECALHO_TABELA.match(limpas[i - 1])
        ) {
          tipo = limpas[i - 1];
        }
        let complemento = "";
        if (i + 1 < limpas.length && !ehDados(i + 1)) {
          const seguinte = limpas[i + 1];
          if (seguinte && TEM_LETRA.search(seguinte) && !IGNORAR.match(seguinte)) complemento = seguinte;
        }
        historico = strip([tipo, complemento].filter(Boolean).join(" "));
      }

      historico = ESPACOS.sub(" ", historico) || "SEM DESCRIÇÃO";

      atuais.push({
        fitid: gerarFitid(ultimaData, historico, valor, idx),
        data: ultimaData,
        valor,
        historico,
        tipoOfx: naoNegativo(valor) ? "CREDIT" : "DEBIT",
        saldoApos: parseValor(saldoStr!),
        ordem: idx,
      });
      idx++;
    }

    fechar();
    return blocos;
  },
  extrairDePalavras: (paginas, referenciaAno) => extrairDeColunas(paginas, referenciaAno),
  /** Remove apenas a reapresentação inicial comprovada pelo saldo de fechamento. */
  consolidarBlocos(blocos) {
    const resultado: Transacao[] = [];
    for (const b of blocos) {
      let atuais = b.transacoes;
      if (resultado.length && atuais.length) {
        const ultimo = resultado[resultado.length - 1];
        const limite = ultimo.data;
        const prefixo: Transacao[] = [];
        for (const item of atuais) {
          if (item.data > limite) break;
          prefixo.push(item);
        }
        if (prefixo.length && saldosIguais(prefixo[prefixo.length - 1].saldoApos, ultimo.saldoApos)) {
          const contar = (ts: readonly Transacao[]) => {
            const c = new Map<string, number>();
            for (const t of ts) c.set(t.fitid, (c.get(t.fitid) ?? 0) + 1);
            return c;
          };
          const disponiveis = contar(resultado);
          const repetidos = contar(prefixo);
          if ([...repetidos].every(([chave, qtd]) => (disponiveis.get(chave) ?? 0) >= qtd)) atuais = atuais.slice(prefixo.length);
        }
      }
      resultado.push(...atuais);
    }
    return resultado;
  },
};
