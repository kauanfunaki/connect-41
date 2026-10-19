// Leitura do boleto pela IA (19/10, lote H2) — o que o Nibo faz ao arrastar o
// PDF. Funções puras: o schema que a IA preenche, o prompt e a conferência do
// que voltou. A chamada mora em `leituraDoBoletoServidor.ts`.
//
// A IA lê; o código confere. Valor e vencimento de boleto bancário estão também
// na linha digitável, protegidos por dígito verificador (`boleto.ts`): quando a
// linha fecha, ela manda, e a divergência vira aviso. Quando não fecha — ou a
// IA não achou a linha —, valor e vencimento vêm marcados para conferir. CPF e
// CNPJ com dígito errado são descartados: um documento errado acha o
// fornecedor errado, e isso é pior que nenhum.

import { lerDocumentoFiscal } from "@/lib/companyTaxId";
import { lerLinhaDigitavel, formatarLinhaDigitavel } from "./boleto";
import { TAMANHO_MAXIMO_DO_NUMERO_DO_DOCUMENTO } from "./manual";

export const AGENTE_DO_BOLETO = "leitor_de_boleto";

/** Campos que a tela marca com "confira" — o que a leitura não conseguiu garantir. */
export type CampoAConferir = "valor" | "vencimento" | "fornecedor";

export type LeituraDoBoleto = {
  ehBoleto: boolean;
  beneficiario: string | null;
  /** Só dígitos, e só CPF ou CNPJ válido. */
  documentoDoBeneficiario: string | null;
  valorCentavos: number | null;
  vencimentoKey: string | null;
  emissaoKey: string | null;
  numeroDocumento: string | null;
  /** Formatada como no boleto, quando os dígitos verificadores fecham. */
  linhaDigitavel: string | null;
  descricao: string | null;
  conferir: CampoAConferir[];
  /** O que a pessoa precisa saber antes de lançar — escrito pelo código. */
  avisos: string[];
};

const campo = (descricao: string) => ({ type: "string", description: descricao });

export const SCHEMA_DO_BOLETO: Record<string, unknown> = {
  type: "object",
  properties: {
    tipoDoDocumento: {
      type: "string",
      enum: ["boleto", "fatura", "nota_fiscal", "outro"],
      description: "boleto: tem linha digitável ou código de barras para pagar. fatura: cobrança sem boleto. outro: o resto",
    },
    beneficiario: campo("Nome do beneficiário (cedente) — quem recebe o pagamento. Vazio se não houver"),
    documentoDoBeneficiario: campo("CPF ou CNPJ do beneficiário, só números. Vazio se o documento não trouxer"),
    pagador: campo("Nome do pagador (sacado). Vazio se não houver"),
    documentoDoPagador: campo("CPF ou CNPJ do pagador, só números. Vazio se não houver"),
    linhaDigitavel: campo("A linha digitável (47 ou 48 dígitos) ou o número do código de barras (44), só números, exatamente como impressa. Vazio se não houver"),
    valor: { type: ["number", "null"], description: "Valor do documento em reais, sem desconto nem juros. Nulo se não houver" },
    vencimento: campo("Data de vencimento, AAAA-MM-DD. Vazio se não houver"),
    dataDoDocumento: campo("Data do documento (emissão, processamento), AAAA-MM-DD. Vazio se não houver"),
    numeroDoDocumento: campo("O campo 'Nº do documento' do boleto. Vazio se não houver"),
    nossoNumero: campo("O campo 'Nosso número'. Vazio se não houver"),
    descricao: campo(
      "O que está sendo cobrado, em até 80 caracteres, a partir das instruções ou do demonstrativo (ex.: 'Aluguel de outubro/2026', 'Mensalidade do software'). Vazio se o documento não disser"
    ),
  },
  required: [
    "tipoDoDocumento",
    "beneficiario",
    "documentoDoBeneficiario",
    "pagador",
    "documentoDoPagador",
    "linhaDigitavel",
    "valor",
    "vencimento",
    "dataDoDocumento",
    "numeroDoDocumento",
    "nossoNumero",
    "descricao",
  ],
  additionalProperties: false,
};

export const SISTEMA_DO_BOLETO =
  "Você lê boletos e documentos de cobrança brasileiros para o setor de BPO financeiro de um escritório de contabilidade, " +
  "que vai lançar a conta a pagar. Copie nomes, documentos, datas, valores e números exatamente como estão impressos — " +
  "não calcule, não corrija e não invente: campo que o documento não traz fica vazio ou nulo. " +
  "A linha digitável vai inteira, só com os números, mesmo que esteja quebrada em blocos. " +
  "Se o arquivo não for um documento de cobrança, diga no tipo do documento e deixe o resto vazio.";

function texto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

function data(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(`${m[0]}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== m[0] ? null : m[0];
}

function centavos(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v >= 1e10) return null;
  return Math.round(v * 100);
}

// Espaço comum depois do "R$": o `style: "currency"` põe um espaço inquebrável,
// que some no texto do aviso mas não na comparação de quem o procura.
const reais = (c: number) => `R$ ${Number(c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dataBr = (key: string) => key.split("-").reverse().join("/");

/**
 * Confere o que a IA devolveu e monta o que preenche a tela.
 *
 * `documentoDaEmpresa` é o CPF/CNPJ da empresa em que se lança: boleto com
 * outro pagador ganha aviso — lançar a conta de um cliente na empresa de outro
 * é o erro que o BPO mais teme (pedido de 13/10, "uma empresa por vez").
 */
export function lerRespostaDoBoleto(bruto: unknown, hojeKey: string, documentoDaEmpresa: string | null): LeituraDoBoleto {
  const o = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const avisos: string[] = [];
  const conferir = new Set<CampoAConferir>();

  const ehBoleto = o.tipoDoDocumento === "boleto" || o.tipoDoDocumento === "fatura";
  if (!ehBoleto) avisos.push("A IA não reconheceu este arquivo como boleto ou fatura. Confira tudo antes de lançar.");

  // Beneficiário: documento só se o dígito fechar.
  const beneficiario = texto(o.beneficiario, 180);
  let documentoDoBeneficiario: string | null = null;
  const docBruto = texto(o.documentoDoBeneficiario, 30);
  if (docBruto) {
    const doc = lerDocumentoFiscal(docBruto);
    if (doc) documentoDoBeneficiario = doc.digitos;
    else avisos.push("O CPF/CNPJ do beneficiário que a IA leu não é válido e ficou de fora. Escolha o fornecedor à mão.");
  }
  if (!documentoDoBeneficiario) conferir.add("fornecedor");

  // Pagador: outro CPF/CNPJ que não o da empresa é sinal de empresa errada. A
  // filial do mesmo grupo (mesma raiz de CNPJ) não conta: o BPO lança matriz e
  // filiais juntas (decisão de 13/10 sobre a BLD).
  const pagador = lerDocumentoFiscal(texto(o.documentoDoPagador, 30) ?? "");
  const mesmaEmpresa = (a: string, b: string) => a === b || (a.length === 14 && b.length === 14 && a.slice(0, 8) === b.slice(0, 8));
  if (pagador && documentoDaEmpresa && !mesmaEmpresa(pagador.digitos, documentoDaEmpresa)) {
    const nome = texto(o.pagador, 120);
    avisos.push(`O pagador deste boleto é ${nome ? `${nome} (${pagador.digitos})` : pagador.digitos}, não a empresa em que você está lançando. Confira a empresa.`);
  }

  let valorCentavos = centavos(o.valor);
  let vencimentoKey = data(o.vencimento);

  // A linha digitável manda no que ela carrega.
  let linhaDigitavel: string | null = null;
  const linhaBruta = texto(o.linhaDigitavel, 80);
  const linha = linhaBruta ? lerLinhaDigitavel(linhaBruta, hojeKey) : null;
  if (linha?.ok) {
    linhaDigitavel = formatarLinhaDigitavel(linha.linhaDigitavel);
    if (linha.valorCentavos !== null) {
      if (valorCentavos !== null && valorCentavos !== linha.valorCentavos) {
        avisos.push(`A IA leu ${reais(valorCentavos)}, mas a linha digitável diz ${reais(linha.valorCentavos)} — ficou o da linha.`);
      }
      valorCentavos = linha.valorCentavos;
    } else {
      conferir.add("valor");
    }
    if (linha.vencimentoKey !== null) {
      if (vencimentoKey !== null && vencimentoKey !== linha.vencimentoKey) {
        avisos.push(`A IA leu o vencimento ${dataBr(vencimentoKey)}, mas a linha digitável diz ${dataBr(linha.vencimentoKey)} — ficou o da linha.`);
      }
      vencimentoKey = linha.vencimentoKey;
    } else {
      conferir.add("vencimento");
    }
  } else {
    conferir.add("valor");
    conferir.add("vencimento");
    if (ehBoleto) {
      avisos.push(
        linha
          ? `A linha digitável lida não fecha (${linha.erro.replace(/\.$/, "").toLowerCase()}). Confira valor e vencimento no boleto.`
          : "A IA não achou a linha digitável. Confira valor e vencimento no boleto."
      );
    }
  }

  // Emissão no futuro é leitura errada (e o lançamento a recusaria).
  let emissaoKey = data(o.dataDoDocumento);
  if (emissaoKey && emissaoKey > hojeKey) emissaoKey = null;

  const numeroDocumento = texto(o.numeroDoDocumento, TAMANHO_MAXIMO_DO_NUMERO_DO_DOCUMENTO) ?? texto(o.nossoNumero, TAMANHO_MAXIMO_DO_NUMERO_DO_DOCUMENTO);

  const oQue = texto(o.descricao, 120);
  const descricao = oQue ?? (beneficiario ? `Boleto ${beneficiario}` : null);

  return {
    ehBoleto,
    beneficiario,
    documentoDoBeneficiario,
    valorCentavos,
    vencimentoKey,
    emissaoKey,
    numeroDocumento,
    linhaDigitavel,
    descricao: descricao ? descricao.slice(0, 255) : null,
    conferir: [...conferir],
    avisos,
  };
}
