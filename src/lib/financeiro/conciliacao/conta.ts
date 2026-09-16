// Regras da conta bancária: validação do cadastro e a conferência de que o
// extrato importado é mesmo desta conta. Funções puras.

import { centavosDeTexto } from "../manual";
import { dataValida } from "../periodo";

/** Só dígitos, sem zero à esquerda. `""` quando não sobra nada. */
export function digitosDaConta(texto: string | null | undefined): string {
  return (texto ?? "").replace(/\D/g, "").replace(/^0+/, "");
}

/** Código COMPE com três dígitos. `null` quando não é um. OFX às vezes manda "0341". */
export function codigoDoBanco(texto: string | null | undefined): string | null {
  const d = digitosDaConta(texto);
  if (d === "" || d.length > 3) return null;
  return d.padStart(3, "0");
}

/**
 * O ACCTID do arquivo é desta conta?
 *
 * Compara só dígitos e sem zero à esquerda, e tolera as três formas em que o
 * mesmo número aparece nos bancos brasileiros:
 *
 * - com o dígito verificador junto (`123456`) ou separado (`12345-6`);
 * - **sem** o dígito — há banco que exporta o ACCTID sem ele;
 * - com a agência na frente (`1234` + `123456`), que é como alguns bancos
 *   compõem o ACCTID.
 *
 * O que não tolera é número diferente: importar o extrato de outra conta
 * misturaria o saldo de duas contas numa só, e desfazer isso é transação por
 * transação.
 */
export function contaConfere(
  acctIdDoArquivo: string,
  conta: { accountNumber: string; agency: string | null }
): boolean {
  const arquivo = digitosDaConta(acctIdDoArquivo);
  const cadastro = digitosDaConta(conta.accountNumber);
  if (arquivo === "" || cadastro === "") return false;
  if (arquivo === cadastro) return true;

  // Sem o dígito verificador: o cadastro separado por hífen diz qual é o DV;
  // sem hífen, o último dígito. Número curto demais não entra na tolerância —
  // cortar um dígito de "10" casaria com qualquer conta "1".
  const hifen = conta.accountNumber.lastIndexOf("-");
  const candidatoSemDv = digitosDaConta(hifen >= 0 ? conta.accountNumber.slice(0, hifen) : cadastro.slice(0, -1));
  const semDv = candidatoSemDv.length >= 4 ? candidatoSemDv : "";
  if (semDv !== "" && arquivo === semDv) return true;

  const agencia = digitosDaConta(conta.agency);
  if (agencia !== "" && arquivo.startsWith(agencia)) {
    const resto = digitosDaConta(arquivo.slice(agencia.length));
    if (resto === cadastro || (semDv !== "" && resto === semDv)) return true;
  }
  return false;
}

export type CamposDaConta = {
  nickname: string | null | undefined;
  bankCode: string | null | undefined;
  agency: string | null | undefined;
  accountNumber: string | null | undefined;
  type: string | null | undefined;
  openingBalance: string | null | undefined;
  openingBalanceDate: string | null | undefined;
};

export type ContaValidada = {
  nickname: string;
  bankCode: string;
  agency: string | null;
  accountNumber: string;
  accountDigits: string;
  type: "CORRENTE" | "POUPANCA";
  /** Centavos com sinal — conta pode começar no cheque especial. */
  saldoInicialCentavos: number | null;
  saldoInicialKey: string | null;
};

/** Valor de dinheiro que aceita sinal negativo. */
export function centavosComSinal(texto: string | null | undefined): number | null {
  const t = (texto ?? "").trim();
  if (t.startsWith("-")) {
    const v = centavosDeTexto(t.slice(1));
    return v === null ? null : -v;
  }
  return centavosDeTexto(t);
}

/** Teto do `Decimal(14,2)`: doze dígitos inteiros. */
const MAIOR_SALDO_EM_CENTAVOS = 999_999_999_999_99;

export function validarConta(
  campos: CamposDaConta
): { ok: true; dados: ContaValidada } | { ok: false; erro: string } {
  const nickname = (campos.nickname ?? "").trim();
  if (nickname === "") return { ok: false, erro: "Dê um nome para a conta (ex.: Itaú movimento)." };
  if (nickname.length > 80) return { ok: false, erro: "Nome com mais de 80 caracteres." };

  const bankCode = codigoDoBanco(campos.bankCode);
  if (!bankCode) return { ok: false, erro: "Código do banco inválido — use o número COMPE (ex.: 001, 341)." };

  const agency = (campos.agency ?? "").trim();
  if (agency !== "" && !/^[\d-]{1,10}$/.test(agency)) return { ok: false, erro: "Agência só com números (e hífen do dígito)." };

  const accountNumber = (campos.accountNumber ?? "").trim();
  if (!/^[\d.\-\s]{1,30}$/.test(accountNumber)) return { ok: false, erro: "Número da conta só com números e o hífen do dígito." };
  const accountDigits = digitosDaConta(accountNumber);
  if (accountDigits === "") return { ok: false, erro: "Informe o número da conta." };

  const type = campos.type === "POUPANCA" ? "POUPANCA" : campos.type === "CORRENTE" ? "CORRENTE" : null;
  if (!type) return { ok: false, erro: "Escolha o tipo da conta." };

  const saldoTexto = (campos.openingBalance ?? "").trim();
  const dataTexto = (campos.openingBalanceDate ?? "").trim();
  let saldoInicialCentavos: number | null = null;
  let saldoInicialKey: string | null = null;
  if (saldoTexto !== "" || dataTexto !== "") {
    // Os dois ou nenhum: saldo sem data não diz a partir de quando somar o
    // extrato, e data sem saldo não tem o que conferir.
    if (saldoTexto === "" || dataTexto === "") {
      return { ok: false, erro: "Saldo inicial e data do saldo andam juntos — preencha os dois ou nenhum." };
    }
    saldoInicialCentavos = centavosComSinal(saldoTexto);
    if (saldoInicialCentavos === null) return { ok: false, erro: "Saldo inicial ilegível. Use, por exemplo, -1.234,56." };
    if (Math.abs(saldoInicialCentavos) > MAIOR_SALDO_EM_CENTAVOS) return { ok: false, erro: "Saldo inicial acima do limite." };
    saldoInicialKey = dataValida(dataTexto);
    if (!saldoInicialKey) return { ok: false, erro: "Data do saldo inicial inválida." };
  }

  return {
    ok: true,
    dados: {
      nickname,
      bankCode,
      agency: agency === "" ? null : agency,
      accountNumber,
      accountDigits,
      type,
      saldoInicialCentavos,
      saldoInicialKey,
    },
  };
}
