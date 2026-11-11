// Consulta de pagamentos do Itaú (SISPAG): a composição dos lotes do extrato (Bloco B, 11/11/2026).
// Porte de `conciliacao_bancaria/sispag.py`.
//
// O extrato do Itaú mostra "Sispag Fornecedores" com UM valor, e o razão tem cada pagamento
// separado. A consulta de pagamentos do internet banking lista os pagamentos um a um (favorecido,
// CPF/CNPJ, tipo, data, valor e status), mas não diz de qual linha do extrato cada um saiu. O banco
// junta por dia e por tipo; quem cruza isso é o cruzamento, aqui é só a leitura.
//
// A planilha é lida pelo NOME da coluna: a linha de cabeçalho é a primeira que tem favorecido,
// tipo de pagamento, data do pagamento e valor.

import { modulo, type Dec } from "../motor/decimal";
import { removerAcentos } from "../motor/texto";
import { ehVazia, strPy, type Celula } from "../planilha/celula";
import { re, strip } from "../extrato/py";
import { decimalDaCelula, FolhasInvalidas, lerFolhas, ou, strptimeDmy } from "./folhas";

/** O arquivo não é uma consulta de pagamentos legível. */
export class SispagInvalido extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "SispagInvalido";
  }
}

export type PagamentoSispag = {
  /** "AAAA-MM-DD" */
  readonly data: string;
  /** Positivo: é o valor pago. */
  readonly valor: Dec;
  readonly tipo: string;
  readonly favorecido: string;
  readonly documento: string;
  readonly efetuado: boolean;
};

export type ConsultaSispag = {
  /** "7285 / 12287-0", como impresso. */
  conta: string;
  /** Só dígitos. */
  cnpj: string;
  pagamentos: PagamentoSispag[];
};

/** `_sem_acento` */
export function semAcento(texto: string): string {
  return strip(removerAcentos(texto).toLowerCase());
}

const OLE = [0xd0, 0xcf, 0x11, 0xe0];

/** `_linhas`: as linhas de todas as folhas, uma atrás da outra. */
function linhasDoArquivo(conteudo: Uint8Array): Celula[][] {
  const zip = conteudo[0] === 0x50 && conteudo[1] === 0x4b;
  if (zip || OLE.every((b, i) => conteudo[i] === b)) {
    try {
      return lerFolhas(conteudo).flatMap((f) => f.linhas.map((linha) => [...linha]));
    } catch (e) {
      if (e instanceof FolhasInvalidas) throw new SispagInvalido(e.message);
      throw e;
    }
  }
  throw new SispagInvalido("Envie a consulta de pagamentos do SISPAG em XLS ou XLSX.");
}

// Colunas pelo começo do nome, sem acento: "data do pagamento", "valor (R$)".
const PAPEIS: [string, string][] = [
  ["favorecido", "favorecido"],
  ["cpf", "documento"],
  ["tipo de pagamento", "tipo"],
  ["data do pagamento", "data"],
  ["valor", "valor"],
  ["status", "status"],
];
const OBRIGATORIAS = ["favorecido", "data", "valor", "tipo"];

/** `_mapear`: o índice de cada papel, ou `null` se faltar alguma coluna obrigatória. */
export function mapear(linha: readonly Celula[]): Map<string, number> | null {
  const colunas = new Map<string, number>();
  linha.forEach((celula, i) => {
    const texto = semAcento(strPy(ou(celula, "")));
    for (const [prefixo, papel] of PAPEIS) {
      if (texto.startsWith(prefixo) && !colunas.has(papel)) colunas.set(papel, i);
    }
  });
  return OBRIGATORIAS.every((p) => colunas.has(p)) ? colunas : null;
}

/** `_data`: "AAAA-MM-DD" ou `null`. */
export function dataDaCelula(valor: Celula): string | null {
  if (valor !== null && typeof valor !== "string" && valor.tipo === "datahora") return valor.valor.slice(0, 10);
  return strptimeDmy(strip(strPy(valor)));
}

/** `_decimal` */
export const decimalSispag = decimalDaCelula;

const NAO_DIGITO = re("\\D");

/** `ler_sispag` */
export function lerSispag(conteudo: Uint8Array): ConsultaSispag {
  const linhas = linhasDoArquivo(conteudo);
  let conta = "";
  let cnpj = "";
  let colunas: Map<string, number> | null = null;
  const pagamentos: PagamentoSispag[] = [];

  for (const linha of linhas) {
    const textos = linha.filter((c) => !ehVazia(c)).map((c) => strip(strPy(c)));
    if (colunas === null) {
      for (let i = 0; i < textos.length - 1; i++) {
        const rotulo = semAcento(textos[i]);
        if (rotulo.startsWith("agencia/conta") && !conta) conta = textos[i + 1];
        if (rotulo.startsWith("cnpj") && !cnpj) cnpj = NAO_DIGITO.sub("", textos[i + 1]);
      }
      colunas = mapear(linha);
      continue;
    }

    const mapa = colunas;
    const celula = (papel: string): Celula => {
      const i = mapa.get(papel);
      return i !== undefined && i < linha.length ? linha[i] : null;
    };

    const data = dataDaCelula(celula("data"));
    const valor = decimalSispag(celula("valor"));
    if (data === null || valor === null) continue; // rodapé ("Total:"), linha em branco
    const status = semAcento(strPy(ou(celula("status"), "efetuado")));
    pagamentos.push({
      data,
      valor: modulo(valor),
      tipo: strip(strPy(ou(celula("tipo"), ""))),
      favorecido: strip(strPy(ou(celula("favorecido"), ""))),
      documento: strip(strPy(ou(celula("documento"), ""))),
      efetuado: status.startsWith("efetuado"),
    });
  }

  if (colunas === null) {
    if (linhas.some((linha) => linha.some((c) => semAcento(strPy(c)).includes("lançamento") || semAcento(strPy(c)).includes("lancamento")))) {
      throw new SispagInvalido(
        "Este arquivo é um extrato consolidado, não a consulta detalhada do SISPAG. " +
          "Importe-o em Extrato Bancário e escolha Comparar com Extrato bancário. " +
          "Os valores dos lotes não identificam seus pagamentos individuais.",
      );
    }
    throw new SispagInvalido(
      "Não encontrei a tabela de pagamentos (colunas favorecido, tipo de pagamento, " +
        "data do pagamento e valor). Envie a consulta de pagamentos do SISPAG.",
    );
  }
  if (!pagamentos.length) throw new SispagInvalido("A consulta de pagamentos não tem nenhum pagamento.");
  return { conta, cnpj, pagamentos };
}
